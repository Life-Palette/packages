import { detectImageKind, readImageContainer, replaceExif, sameExif } from "@life-palette/uploader/shared";
import { cleanup, createTemporaryFile, type TemporaryFile } from "./file";
import { analyzeMedia, readMediaBytes, type MediaConfig, type MediaAnalysisOptions, type MediaRuntime } from "./media";
import { getUni, nativeCall } from "./transport";
import { UploadError, type UploadCancellation, type UploadFile } from "./types";

export interface CompressionOptions {
  maxSizeMB?: number;
  quality?: number;
  cancellation?: UploadCancellation;
  onProgress?: (percent: number) => void;
}

function borrowed(file: UploadFile): TemporaryFile {
  return { file, dispose: async () => undefined };
}

/** Owns only newly created files. Always dispose the returned handle after use. */
export async function compressImage(
  input: UploadFile | string,
  config: MediaConfig,
  options: CompressionOptions = {}
): Promise<TemporaryFile> {
  const maxSizeMB = options.maxSizeMB ?? 1;
  const quality = options.quality ?? 90;
  if (!Number.isFinite(maxSizeMB) || maxSizeMB <= 0) throw new RangeError("maxSizeMB must be positive");
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new RangeError("quality must be an integer between 1 and 100");
  const file = typeof input === "string" ? { path: input } : input;
  const finishOriginal = () => { options.onProgress?.(100); return borrowed(file); };
  const bytes = await readMediaBytes(file, config, options.cancellation);
  if (!detectImageKind(bytes)) return finishOriginal();
  const source = readImageContainer(bytes);
  if (source.animated || bytes.length <= maxSizeMB * 1024 * 1024) return finishOriginal();
  const name = file.name || file.path.split(/[\\/]/).pop() || "image";
  if (config.platform === "h5") {
    if (!config.browser) throw new UploadError("Provide createBrowserMediaAdapter() from the /browser entry on H5");
    const original = new File([bytes], name, { type: source.mime });
    const output = await config.browser.compress(original, options);
    if (output === original) return finishOriginal();
    const path = URL.createObjectURL(output);
    return { file: { path, name, sourceFile: output }, dispose: async () => URL.revokeObjectURL(path) };
  }
  const api = getUni(config.uni) as MediaRuntime;
  if (!api.compressImage) throw new UploadError("Native image compression is unavailable");
  // Strip EXIF before decoding so the native compressor cannot rotate pixels
  // and then have the original orientation applied a second time.
  const stripped = source.exif.length ? await createTemporaryFile(replaceExif(source, []).buffer, config) : borrowed(file);
  const outputs = new Set<string>();
  try {
    let restored: Uint8Array<ArrayBuffer> | undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      options.cancellation?.throwIfAborted();
      const compressed = await nativeCall<{ tempFilePath: string }>((callbacks) => api.compressImage?.({ ...callbacks, src: stripped.file.path, quality: Math.max(10, quality - attempt * 15) }));
      if (compressed.tempFilePath === file.path || compressed.tempFilePath === stripped.file.path) return finishOriginal();
      outputs.add(compressed.tempFilePath);
      const encoded = readImageContainer(await readMediaBytes({ path: compressed.tempFilePath }, config, options.cancellation));
      if (encoded.kind !== source.kind || encoded.width !== source.width || encoded.height !== source.height || encoded.animated) {
        throw new UploadError("Compression changed format or dimensions; cannot safely preserve EXIF");
      }
      const candidate = replaceExif(encoded, source.exif);
      if (!sameExif(source, readImageContainer(candidate))) throw new UploadError("Compression failed EXIF preservation validation");
      if (!restored || candidate.length < restored.length) restored = candidate;
      options.onProgress?.(Math.min(95, (attempt + 1) * 15));
      if (candidate.length <= maxSizeMB * 1024 * 1024) break;
    }
    options.cancellation?.throwIfAborted();
    if (!restored || restored.length >= bytes.length) return finishOriginal();
    const result = await createTemporaryFile(restored.buffer, config);
    result.file.name = name;
    options.onProgress?.(100);
    return result;
  } finally {
    await cleanup(stripped.dispose, config);
    for (const path of outputs) {
      await cleanup(async () => {
        const fs = api.getFileSystemManager?.();
        if (!fs?.unlink) throw new UploadError("Temporary compression output cannot be removed");
        await nativeCall((callbacks) => fs.unlink?.({ ...callbacks, filePath: path }));
      }, config);
    }
  }
}

export interface PrepareUploadOptions {
  compression?: CompressionOptions | false;
  analysis?: MediaAnalysisOptions;
}

/** One-package pipeline: optional compression -> analysis of final bytes -> upload-ready metadata. */
export async function prepareUpload(input: UploadFile | string, config: MediaConfig, options: PrepareUploadOptions = {}) {
  const file = typeof input === "string" ? { path: input } : input;
  const temporary = options.compression ? await compressImage(file, config, options.compression) : borrowed(file);
  try {
    const metadata = await analyzeMedia(temporary.file, config, options.analysis);
    return { ...temporary, metadata, checksum: metadata.basic.md5 };
  } catch (error) {
    await cleanup(temporary.dispose, config);
    throw error;
  }
}
