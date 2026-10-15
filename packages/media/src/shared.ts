import { readExifIso } from "./exif-fields";

type RecordValue = Record<string, unknown>;

export const MEDIA_ANALYSIS_SCHEMA_VERSION = 1 as const;
export const ARTHASH_CODEC = "rect-v64" as const;

export interface MediaColor {
  b: number;
  g: number;
  hex: string;
  is_primary: boolean;
  percentage: number;
  r: number;
  rank: number;
}

export interface ImageExif {
  altitude?: number;
  device_make?: string;
  device_model?: string;
  exposure_time?: string;
  f_number?: string;
  focal_length?: string;
  iso?: number;
  lat?: number;
  lens_model?: string;
  lng?: number;
  orientation?: number;
  raw?: Record<string, unknown>;
  taken_at?: string;
}

export interface ImageMediaAnalysis {
  arthash?: string;
  arthash_codec?: typeof ARTHASH_CODEC;
  blurhash?: string;
  colors: MediaColor[];
  exif: ImageExif;
}

export interface VideoMediaAnalysis {
  bitrate?: number;
  codec?: string;
  creation_time?: string;
  duration?: number;
  exif?: ImageExif;
  frame_rate?: number;
  height?: number;
  metadata?: Record<string, unknown>;
  width?: number;
}

export interface MediaAnalysisResult {
  basic: {
    name: string;
    type: string;
    extension: string;
    size: number;
    md5: string;
    width?: number;
    height?: number;
  };
  image?: ImageMediaAnalysis;
  schema_version: typeof MEDIA_ANALYSIS_SCHEMA_VERSION;
  video?: VideoMediaAnalysis;
}

export interface AnalyzeMediaOptions {
  /** Maximum dimension used for browser-side image analysis. */
  analysisMaxDimension?: number;
  /** BlurHash horizontal component count. */
  blurhashComponentX?: number;
  /** BlurHash vertical component count. */
  blurhashComponentY?: number;
  /** Number of dominant colors to return. Defaults to the backend's current five-color contract. */
  colorCount?: number;
  /** Include the complete parsed EXIF/XMP object. Disabled by default for privacy and payload size. */
  includeRawExif?: boolean;
  onProgress?: (progress: {
    stage: "md5" | "decode" | "analyze";
    percent: number;
  }) => void;
}

export function rgbBytes(rgba: Uint8ClampedArray): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (
    let source = 0, target = 0;
    source < rgba.length;
    source += 4, target += 3
  ) {
    rgb[target] = rgba[source] ?? 0;
    rgb[target + 1] = rgba[source + 1] ?? 0;
    rgb[target + 2] = rgba[source + 2] ?? 0;
  }
  return rgb;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function extractColors(
  rgba: Uint8ClampedArray,
  maxColors: number
): MediaColor[] {
  const colorMap = new Map<
    string,
    { r: number; g: number; b: number; count: number }
  >();
  const totalPixels = rgba.length / 4;
  const step = totalPixels > 100_000 ? 3 : totalPixels > 50_000 ? 2 : 1;
  let sampledPixels = 0;

  for (let pixel = 0; pixel < rgba.length; pixel += 4 * step) {
    const alpha = rgba[pixel + 3] ?? 0;
    if (alpha < 128) {
      continue;
    }
    const r = Math.floor((rgba[pixel] ?? 0) / 16) * 16;
    const g = Math.floor((rgba[pixel + 1] ?? 0) / 16) * 16;
    const b = Math.floor((rgba[pixel + 2] ?? 0) / 16) * 16;
    const brightness = (r + g + b) / 3;
    if (brightness < 10 || brightness > 245) {
      continue;
    }
    const key = `${r},${g},${b}`;
    const current = colorMap.get(key);
    if (current) {
      current.count += 1;
    } else {
      colorMap.set(key, { b, count: 1, g, r });
    }
    sampledPixels += 1;
  }

  if (sampledPixels === 0) {
    return [];
  }

  return [...colorMap.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, Math.max(0, maxColors))
    .map((color, rank) => ({
      b: color.b,
      g: color.g,
      hex: `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`,
      is_primary: rank === 0,
      percentage: (color.count / sampledPixels) * 100,
      r: color.r,
      rank,
    }));
}

function valueFrom(
  record: RecordValue | undefined,
  ...keys: string[]
): unknown {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function numberFrom(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringFrom(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function dateFrom(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value
      .trim()
      .replace(
        /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})(.*)$/,
        "$1-$2-$3T$4$5"
      );
    const date = new Date(normalized);
    return Number.isNaN(date.valueOf()) ? value : date.toISOString();
  }
  return undefined;
}

export function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

export function normalizeExif(parsed: RecordValue | undefined, includeRaw = false): ImageExif {
    const gps = parsed;
    const exif: ImageExif = {
      altitude: numberFrom(valueFrom(parsed, "GPSAltitude", "altitude")),
      device_make: stringFrom(
        valueFrom(parsed, "Make", "make", "DeviceManufacturer")
      ),
      device_model: stringFrom(
        valueFrom(parsed, "Model", "model", "DeviceModel")
      ),
      exposure_time: stringFrom(
        valueFrom(parsed, "ExposureTime", "exposure_time")
      ),
      f_number: stringFrom(valueFrom(parsed, "FNumber", "f_number")),
      focal_length: stringFrom(
        valueFrom(parsed, "FocalLength", "focal_length")
      ),
      iso: readExifIso(parsed),
      lat: numberFrom(
        valueFrom(
          gps as RecordValue | undefined,
          "latitude",
          "GPSLatitude",
          "lat"
        ) ?? valueFrom(parsed, "latitude", "GPSLatitude")
      ),
      lens_model: stringFrom(
        valueFrom(parsed, "LensModel", "Lens", "lens_model")
      ),
      lng: numberFrom(
        valueFrom(
          gps as RecordValue | undefined,
          "longitude",
          "GPSLongitude",
          "lng"
        ) ?? valueFrom(parsed, "longitude", "GPSLongitude")
      ),
      orientation: numberFrom(valueFrom(parsed, "Orientation", "orientation")),
      taken_at: dateFrom(
        valueFrom(
          parsed,
          "DateTimeOriginalISO",
          "DateTimeOriginal",
          "CreateDate",
          "CreationDate",
          "creation_time"
        )
      ),
    };
    if (includeRaw && parsed) {
      exif.raw = parsed;
    }
    return removeUndefined(exif);
}
