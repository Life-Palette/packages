import {
  detectImageKind,
  readImageContainer,
  replaceExif,
  sameExif,
} from "./image-metadata";

export interface CompressionOptions {
  /** Target file size in MB. Defaults to 1 MB. */
  maxSizeMB?: number;
  onProgress?: (percent: number) => void;
}

/** Compress before media analysis so checksum and metadata describe uploaded bytes. */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const maxSizeMB = options.maxSizeMB ?? 1;
  if (!Number.isFinite(maxSizeMB) || maxSizeMB <= 0) {
    throw new RangeError("maxSizeMB must be a positive finite number");
  }
  // Sniff bytes, not caller-supplied MIME. Unsupported containers remain intact.
  if (!detectImageKind(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) {
    options.onProgress?.(100);
    return file;
  }
  const source = readImageContainer(new Uint8Array(await file.arrayBuffer()));
  if (source.animated) {
    options.onProgress?.(100);
    return file;
  }
  const input = new File([replaceExif(source, [])], file.name, {
    lastModified: file.lastModified,
    type: source.mime,
  });
  const { default: imageCompression } = await import(
    "browser-image-compression"
  );
  const compressed = await imageCompression(input, {
    alwaysKeepResolution: true,
    exifOrientation: 1,
    fileType: source.mime,
    maxSizeMB,
    onProgress: (percent) =>
      options.onProgress?.(Math.min(95, Math.round(percent * 0.95))),
    preserveExif: false,
    useWebWorker: true,
  });
  if (compressed.size === 0) {
    throw new Error("Image compression returned an empty file");
  }
  const encoded = readImageContainer(
    new Uint8Array(await compressed.arrayBuffer())
  );
  if (
    encoded.kind !== source.kind ||
    encoded.width !== source.width ||
    encoded.height !== source.height ||
    encoded.animated
  ) {
    throw new Error(
      "Image compression changed format or dimensions; cannot safely preserve EXIF"
    );
  }
  const bytes = replaceExif(encoded, source.exif);
  if (!sameExif(source, readImageContainer(bytes))) {
    throw new Error("Image compression failed EXIF preservation validation");
  }
  options.onProgress?.(100);
  if (bytes.length >= file.size) {
    return file;
  }
  return new File([bytes], file.name, {
    lastModified: file.lastModified,
    type: source.mime,
  });
}
