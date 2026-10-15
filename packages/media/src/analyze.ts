import { MEDIA_ANALYSIS_SCHEMA_VERSION, ARTHASH_CODEC, rgbBytes, extractColors, normalizeExif, removeUndefined, type AnalyzeMediaOptions, type ImageExif, type ImageMediaAnalysis, type MediaAnalysisResult, type VideoMediaAnalysis } from "./shared";
export * from "./shared";
/**
 * Browser-side media analysis:
 * - images: blurhash / arthash / dominant colors / EXIF
 * - videos: mediainfo metadata + EXIF
 */

import { codec, encode as encodeArthash } from "arthash";
import { encode as encodeBlurhash } from "blurhash";
import initMetaprobe, { extractMetaFastSized } from "metaprobe";
import { hashBlob } from "./hash";
import {
  loadMediaInfoVideoMetadata,
  type VideoTechnicalMetadata,
} from "./video-metadata";

interface RasterImage {
  height: number;
  rgba: Uint8ClampedArray;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
}

type RecordValue = Record<string, unknown>;

const IMAGE_TYPES = ["image/"];
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
  "bmp",
]);
const VIDEO_EXTENSIONS = new Set(["mov", "mp4", "avi", "mkv", "webm", "m4v"]);

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function isVideoFile(file: Blob & { name?: string }): boolean {
  return (
    file.type.startsWith("video/") ||
    VIDEO_EXTENSIONS.has(getExtension(file.name ?? "").slice(1))
  );
}

function isImageFile(file: Blob & { name?: string }): boolean {
  return (
    IMAGE_TYPES.some((prefix) => file.type.startsWith(prefix)) ||
    IMAGE_EXTENSIONS.has(getExtension(file.name ?? "").slice(1))
  );
}

function createCanvas(
  width: number,
  height: number
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("当前环境不支持 Canvas，无法分析图片");
}

function get2DContext(
  canvas: OffscreenCanvas | HTMLCanvasElement
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("无法创建 Canvas 2D 上下文");
  }
  return context as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
}

async function decodeImage(
  file: Blob,
  maxDimension: number
): Promise<RasterImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    try {
      return rasterize(bitmap, bitmap.width, bitmap.height, maxDimension);
    } finally {
      bitmap.close();
    }
  }

  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw new Error("当前环境不支持图片解码");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图片解码失败"));
      element.src = url;
    });
    return rasterize(
      image,
      image.naturalWidth,
      image.naturalHeight,
      maxDimension
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rasterize(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number
): RasterImage {
  const safeMax = Math.max(1, maxDimension);
  const scale = Math.min(1, safeMax / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = createCanvas(width, height);
  const context = get2DContext(canvas);
  context.drawImage(source, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return { height, rgba: imageData.data, sourceHeight, sourceWidth, width };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== "function") {
    throw new Error("当前环境不支持 Base64 编码");
  }
  let binary = "";
  const chunkSize = 0x80_00;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function readExif(file: Blob, includeRaw: boolean): Promise<ImageExif> {
  try {
    await initMetaprobe();
    const parsed = (
      extractMetaFastSized(
        new Uint8Array(await file.arrayBuffer()),
        (file as File).name ?? "",
        file.size
      ) as { exif?: RecordValue }
    ).exif;
    return normalizeExif(parsed, includeRaw);
  } catch (error) {
    console.error("metaprobe EXIF 解析失败:", error);
    return {};
  }
}

async function analyzeImage(
  file: Blob,
  options: AnalyzeMediaOptions
): Promise<{ width: number; height: number; image: ImageMediaAnalysis }> {
  const raster = await decodeImage(file, options.analysisMaxDimension ?? 100);
  const componentX = options.blurhashComponentX ?? 4;
  const componentY = options.blurhashComponentY ?? 3;
  const blurhash = encodeBlurhash(
    raster.rgba,
    raster.width,
    raster.height,
    componentX,
    componentY
  );
  const hash = await encodeArthash(
    rgbBytes(raster.rgba),
    raster.width,
    raster.height,
    codec.rect({ n: 64 })
  );
  const exif = await readExif(file, options.includeRawExif ?? false);
  return {
    height: raster.sourceHeight,
    image: {
      arthash: bytesToBase64(hash),
      arthash_codec: ARTHASH_CODEC,
      blurhash,
      colors: extractColors(raster.rgba, options.colorCount ?? 5),
      exif,
    },
    width: raster.sourceWidth,
  };
}

async function analyzeVideo(
  file: Blob & { name?: string },
  includeRawExif: boolean
): Promise<{ video: VideoMediaAnalysis }> {
  const metadata = await loadVideoMetadata(file);
  const exif = removeUndefined({
    ...metadata.exif,
    ...(await readExif(file, includeRawExif)),
  });
  return {
    video: removeUndefined({
      bitrate: metadata.bitrate,
      codec: metadata.codec,
      creation_time: metadata.creation_time ?? exif.taken_at,
      duration: metadata.duration,
      exif,
      frame_rate: metadata.frame_rate,
      height: metadata.height,
      metadata: removeUndefined({
        ...metadata.metadata,
        exif: exif.raw,
      }),
      width: metadata.width,
    }),
  };
}

async function loadVideoElementMetadata(
  file: Blob & { name?: string }
): Promise<VideoTechnicalMetadata> {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return {};
  }
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("视频元数据读取失败"));
      video.src = url;
    });
    return removeUndefined({
      duration: Number.isFinite(video.duration) ? video.duration : undefined,
      height: video.videoHeight || undefined,
      width: video.videoWidth || undefined,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadVideoMetadata(
  file: Blob & { name?: string }
): Promise<VideoTechnicalMetadata> {
  const browserMetadata: VideoTechnicalMetadata =
    await loadVideoElementMetadata(file).catch(
      (): VideoTechnicalMetadata => ({})
    );
  try {
    const mediaInfoMetadata = await loadMediaInfoVideoMetadata(file);
    return removeUndefined({
      ...browserMetadata,
      ...mediaInfoMetadata,
      duration: mediaInfoMetadata.duration ?? browserMetadata.duration,
      height: mediaInfoMetadata.height ?? browserMetadata.height,
      width: mediaInfoMetadata.width ?? browserMetadata.width,
    });
  } catch {
    return browserMetadata;
  }
}

export async function analyzeMedia(
  file: File,
  options: AnalyzeMediaOptions = {}
): Promise<MediaAnalysisResult> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new TypeError("analyzeMedia 需要传入 File 或 Blob");
  }

  options.onProgress?.({ percent: 0, stage: "md5" });
  const md5 = await hashBlob(file, ({ percent }) =>
    options.onProgress?.({ percent, stage: "md5" })
  );
  const result: MediaAnalysisResult = {
    basic: {
      extension: getExtension(file.name ?? ""),
      md5,
      name: file.name ?? "",
      size: file.size,
      type: file.type || "application/octet-stream",
    },
    schema_version: MEDIA_ANALYSIS_SCHEMA_VERSION,
  };

  if (isImageFile(file)) {
    options.onProgress?.({ percent: 0, stage: "decode" });
    const image = await analyzeImage(file, options);
    result.basic.width = image.width;
    result.basic.height = image.height;
    result.image = image.image;
    options.onProgress?.({ percent: 100, stage: "analyze" });
  } else if (isVideoFile(file)) {
    const video = await analyzeVideo(file, options.includeRawExif ?? false);
    result.basic.width = video.video.width;
    result.basic.height = video.video.height;
    result.video = video.video;
    options.onProgress?.({ percent: 100, stage: "analyze" });
  }

  return result;
}
