import {
  ARTHASH_CODEC,
  MEDIA_ANALYSIS_SCHEMA_VERSION,
  extractColors,
  normalizeExif,
  removeUndefined,
  rgbBytes,
  type AnalyzeMediaOptions,
  type MediaAnalysisResult,
} from "@life-palette/media/shared";
import { encode as encodeBlurhash } from "blurhash";
import initMetaprobe, { extractMetaFastSized } from "metaprobe/miniprogram";
import { cleanup, openUploadFile, type FileConfig } from "./file";
import { encodeRgb, initArthash } from "./generated/arthash.js";
import { getUni } from "./transport";
import { UploadError, type UploadCancellation, type UploadFile, type UniRuntime } from "./types";

export interface MediaConfig extends FileConfig {
  /** Packaged file paths, not HTTP URLs. */
  metaprobeWasmPath?: string;
  arthashWasmPath?: string;
  /** Inject through the separate /browser entry on H5; keeps browser WASM out of mini-program bundles. */
  browser?: {
    analyze: typeof import("@life-palette/media").analyzeMedia;
    compress: typeof import("@life-palette/uploader").compressImage;
  };
}

export interface MediaAnalysisOptions extends AnalyzeMediaOptions {
  checksum?: string;
  cancellation?: UploadCancellation;
  /** Set false explicitly for metadata-only analysis without Canvas/ArtHash. */
  visualAnalysis?: boolean;
}

export interface CanvasImage {
  src: string;
  width: number;
  height: number;
  onload: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
}
export interface AnalysisCanvas {
  width: number;
  height: number;
  createImage(): CanvasImage;
  getContext(type: "2d"): {
    drawImage(image: CanvasImage, x: number, y: number, width: number, height: number): void;
    getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  } | null;
}
export interface MediaRuntime extends UniRuntime {
  createOffscreenCanvas?: (options: { type: "2d"; width: number; height: number }) => AnalysisCanvas;
  arrayBufferToBase64?: (data: ArrayBuffer) => string;
  compressImage?: (options: {
    src: string;
    quality: number;
    success: (result: { tempFilePath: string }) => void;
    fail: (error: { errMsg?: string }) => void;
  }) => void;
}

export async function readMediaBytes(
  file: UploadFile,
  config: FileConfig,
  cancellation?: UploadCancellation
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = await openUploadFile(file, config);
  try {
    const bytes = new Uint8Array(reader.size);
    for (let start = 0; start < reader.size; start += 1024 * 1024) {
      cancellation?.throwIfAborted();
      const end = Math.min(start + 1024 * 1024, reader.size);
      const part = await reader.read(start, end);
      if (part.byteLength !== end - start) throw new UploadError("Short media read");
      bytes.set(new Uint8Array(part), start);
    }
    cancellation?.throwIfAborted();
    return bytes;
  } finally {
    await cleanup(reader.close, config);
  }
}

async function rasterize(file: UploadFile, api: MediaRuntime, maxDimension: number) {
  if (!api.createOffscreenCanvas) throw new UploadError("Canvas analysis is unavailable; supply a compatible runtime or select visualAnalysis: false");
  const canvas = api.createOffscreenCanvas({ type: "2d", width: 1, height: 1 });
  const image = canvas.createImage();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = resolve;
      image.onerror = (cause) => reject(new UploadError("Image decode failed", { cause }));
      image.src = file.path;
    });
    if (!(image.width > 0 && image.height > 0)) throw new UploadError("Image dimensions are invalid");
    const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new UploadError("Canvas 2D context is unavailable");
    context.drawImage(image, 0, 0, width, height);
    const rgba = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
    if (rgba.length !== width * height * 4) throw new UploadError("Canvas returned an invalid pixel buffer");
    return { width, height, rgba, sourceWidth: image.width, sourceHeight: image.height };
  } finally {
    image.onload = null;
    image.onerror = null;
    canvas.width = 1;
    canvas.height = 1;
  }
}

const MIME_TYPES: Record<string, string> = {
  jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif",
  tiff: "image/tiff", tif: "image/tiff", bmp: "image/bmp", svg: "image/svg+xml",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", m4v: "video/x-m4v", pdf: "application/pdf",
};

/** Analyze final bytes before upload. The returned shape is shared with the Web media package. */
export async function analyzeMedia(
  input: UploadFile | string,
  config: MediaConfig,
  options: MediaAnalysisOptions = {}
): Promise<MediaAnalysisResult> {
  const maxDimension = options.analysisMaxDimension ?? 100;
  if (!Number.isFinite(maxDimension) || maxDimension < 1 || maxDimension > 1024) throw new RangeError("analysisMaxDimension must be between 1 and 1024");
  const file = typeof input === "string" ? { path: input } : input;
  const api = getUni(config.uni) as MediaRuntime;
  const reader = await openUploadFile(file, config);
  try {
    options.cancellation?.throwIfAborted();
    options.onProgress?.({ stage: "md5", percent: 0 });
    const md5 = options.checksum || await reader.checksum((percent) => {
      options.cancellation?.throwIfAborted();
      options.onProgress?.({ stage: "md5", percent });
    });
    options.onProgress?.({ stage: "md5", percent: 100 });
    const extension = reader.name.includes(".") ? reader.name.slice(reader.name.lastIndexOf(".")).toLowerCase() : "";
    const bytes = new Uint8Array(reader.size);
    for (let start = 0; start < reader.size; start += 1024 * 1024) {
      options.cancellation?.throwIfAborted();
      const end = Math.min(start + 1024 * 1024, reader.size);
      const chunk = await reader.read(start, end);
      if (chunk.byteLength !== end - start) throw new UploadError("Short media read");
      bytes.set(new Uint8Array(chunk), start);
    }
    options.cancellation?.throwIfAborted();
    if (config.platform === "h5") {
      if (!config.browser) throw new UploadError("Provide createBrowserMediaAdapter() from the /browser entry on H5");
      return config.browser.analyze(new File([bytes], reader.name, { type: file.sourceFile?.type || MIME_TYPES[extension.slice(1)] || "application/octet-stream" }), options);
    }
    if (config.platform !== "mp") throw new UploadError("Media analysis currently supports H5 and WeChat mini-programs");
    options.onProgress?.({ stage: "decode", percent: 0 });
    const result: MediaAnalysisResult = {
      schema_version: MEDIA_ANALYSIS_SCHEMA_VERSION,
      basic: { name: reader.name, size: reader.size, md5, extension, type: MIME_TYPES[extension.slice(1)] || "application/octet-stream" },
    };
    await initMetaprobe({ wasmPath: config.metaprobeWasmPath ?? "static/uploader-uniapp/metaprobe.wasm" });
    let parsed;
    try {
      parsed = extractMetaFastSized(bytes, reader.name, reader.size);
    } catch (error) {
      if (result.basic.type.startsWith("image/") || result.basic.type.startsWith("video/")) throw error;
      options.onProgress?.({ stage: "analyze", percent: 100 });
      return result;
    }
    const exif = normalizeExif(parsed.exif, options.includeRawExif ?? false);
    result.basic.type = MIME_TYPES[parsed.format] ?? result.basic.type;
    if (parsed.width > 0) result.basic.width = parsed.width;
    if (parsed.height > 0) result.basic.height = parsed.height;
    options.cancellation?.throwIfAborted();
    if (parsed.kind === "image") {
      result.image = { colors: [], exif };
      if (options.visualAnalysis !== false) {
        const raster = await rasterize(file, api, maxDimension);
        options.cancellation?.throwIfAborted();
        result.basic.width = raster.sourceWidth;
        result.basic.height = raster.sourceHeight;
        result.image.colors = extractColors(raster.rgba, options.colorCount ?? 5);
        result.image.blurhash = encodeBlurhash(raster.rgba, raster.width, raster.height, options.blurhashComponentX ?? 4, options.blurhashComponentY ?? 3);
        await initArthash(config.arthashWasmPath ?? "static/uploader-uniapp/arthash.wasm");
        const art = encodeRgb(rgbBytes(raster.rgba), raster.width, raster.height, { shape: "rect", n_shapes: 64, color_bits: 16 }, 0n, undefined);
        if (!api.arrayBufferToBase64) throw new UploadError("Base64 encoding is unavailable");
        result.image.arthash = api.arrayBufferToBase64(new Uint8Array(art).buffer);
        result.image.arthash_codec = ARTHASH_CODEC;
      }
    } else if (parsed.kind === "video") {
      result.video = removeUndefined({ width: result.basic.width, height: result.basic.height, duration: parsed.duration, codec: parsed.codec, frame_rate: parsed.frameRate, bitrate: parsed.videoBitrate ?? parsed.overallBitrate, creation_time: parsed.creationTime ?? exif.taken_at, metadata: parsed.metadata, exif });
    }
    options.cancellation?.throwIfAborted();
    options.onProgress?.({ stage: "analyze", percent: 100 });
    return result;
  } finally {
    await cleanup(reader.close, config);
  }
}
