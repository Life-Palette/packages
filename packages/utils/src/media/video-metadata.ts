import type { GeneralTrack, MediaInfoFactoryOptions, MediaInfoResult, VideoTrack } from "mediainfo.js";

export interface VideoTechnicalMetadata {
  width?: number;
  height?: number;
  duration?: number;
  creation_time?: string;
  codec?: string;
  bitrate?: number;
  frame_rate?: number;
  exif?: VideoExifMetadata;
  metadata?: Record<string, unknown>;
}

export interface VideoExifMetadata {
  lat?: number;
  lng?: number;
  altitude?: number;
  taken_at?: string;
  device_make?: string;
  device_model?: string;
  lens_model?: string;
  f_number?: string;
  exposure_time?: string;
  iso?: number;
  focal_length?: string;
}

type MediaInfoTrack = GeneralTrack | VideoTrack;

function firstValue(record: MediaInfoTrack | undefined, ...keys: string[]): unknown {
  if (!record) {
    return undefined;
  }
  const source = record as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateValue(value: unknown): string | undefined {
  const text = stringValue(value)?.replace(/^UTC\s+/i, "");
  if (!text) {
    return undefined;
  }
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function parseRecordedLocation(value: unknown): Pick<VideoExifMetadata, "lat" | "lng" | "altitude"> {
  const text = stringValue(value);
  if (!text) {
    return {};
  }

  const match = text.match(
    /([+-]?\d+(?:\.\d+)?)\s*°?\s*([NS])\s+([+-]?\d+(?:\.\d+)?)\s*°?\s*([EW])(?:\s+([+-]?\d+(?:\.\d+)?)\s*m)?/i,
  );
  if (!match) {
    return {};
  }

  const latitude = numberValue(match[1]);
  const longitude = numberValue(match[3]);
  const altitude = numberValue(match[5]);
  return removeUndefined({
    lat: latitude === undefined ? undefined : /S/i.test(match[2] ?? "") ? -Math.abs(latitude) : Math.abs(latitude),
    lng: longitude === undefined ? undefined : /W/i.test(match[4] ?? "") ? -Math.abs(longitude) : Math.abs(longitude),
    altitude,
  });
}

function compactTrack(track: MediaInfoTrack | undefined): Record<string, unknown> | undefined {
  if (!track) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(track).filter(([, value]) => value !== undefined && value !== null),
  );
}

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function mapMediaInfoResult(result: MediaInfoResult): VideoTechnicalMetadata {
  const tracks = result.media?.track ?? [];
  const general = tracks.find((track): track is GeneralTrack => track["@type"] === "General");
  const video = tracks.find((track): track is VideoTrack => track["@type"] === "Video");
  const location = parseRecordedLocation(firstValue(general, "Recorded_Location"));
  const creationTime = dateValue(
    firstValue(general, "Recorded_Date", "Encoded_Date", "Tagged_Date") ??
      firstValue(video, "Encoded_Date", "Tagged_Date"),
  );
  const exif = removeUndefined({
    ...location,
    taken_at: creationTime,
    device_make: stringValue(firstValue(general, "Encoded_Hardware_CompanyName", "Encoded_Library_CompanyName")),
    device_model: stringValue(firstValue(general, "Encoded_Hardware_Name", "Encoded_Application_Name")),
  });
  const metadata = removeUndefined({
    general: compactTrack(general),
    video: compactTrack(video),
  });

  return removeUndefined({
    width: numberValue(firstValue(video, "Width", "Width_Original")),
    height: numberValue(firstValue(video, "Height", "Height_Original")),
    duration: numberValue(firstValue(video, "Duration") ?? firstValue(general, "Duration")),
    creation_time: creationTime,
    codec: stringValue(
      firstValue(video, "Format_Commercial", "Format_String", "Format", "CodecID_String", "CodecID"),
    ),
    bitrate: numberValue(firstValue(video, "BitRate", "BitRate_Nominal")),
    frame_rate: numberValue(firstValue(video, "FrameRate", "FrameRate_Nominal")),
    exif: Object.keys(exif).length > 0 ? exif : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });
}

export async function loadMediaInfoVideoMetadata(file: Blob): Promise<VideoTechnicalMetadata> {
  const { default: mediaInfoFactory } = await import("mediainfo.js");
  const factoryOptions: MediaInfoFactoryOptions<"object"> = { format: "object" };
  // 源码被 Vite 打包时显式引入 WASM；发布包则使用 mediainfo.js 自己的路径解析。
  if (!/[\\/]dist[\\/]index\.(?:mjs|cjs)$/.test(import.meta.url)) {
    const wasmUrl = new URL("mediainfo.js/MediaInfoModule.wasm", import.meta.url).href;
    factoryOptions.locateFile = () => wasmUrl;
  }
  const mediaInfo = await mediaInfoFactory(factoryOptions);
  try {
    const result = await mediaInfo.analyzeData(file.size, async (size, offset) => {
      const buffer = await file.slice(offset, offset + size).arrayBuffer();
      return new Uint8Array(buffer);
    });
    return mapMediaInfoResult(result);
  } finally {
    mediaInfo.close();
  }
}
