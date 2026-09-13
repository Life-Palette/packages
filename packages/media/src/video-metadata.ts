/** Video metadata extracted by the local metaprobe WASM package. */
import initMetaprobe, { extractMetaFastSized } from "metaprobe";

export interface VideoExifMetadata {
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
  taken_at?: string;
}
export interface VideoTechnicalMetadata {
  bitrate?: number;
  codec?: string;
  creation_time?: string;
  duration?: number;
  exif?: VideoExifMetadata;
  frame_rate?: number;
  height?: number;
  metadata?: Record<string, unknown>;
  width?: number;
}
interface Meta {
  codec?: string;
  containerCreationTime?: string;
  creationTime?: string;
  duration?: number;
  exif?: Record<string, unknown>;
  frameRate?: number;
  height?: number;
  metadata?: Record<string, unknown>;
  overallBitrate?: number;
  width?: number;
}
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const date = (v: unknown) => {
  const s = str(v);
  if (!s) {
    return;
  }
  const normalized =
    s.replace(/^UTC\s+/i, "").replace(" ", "T") +
    (s.match(/^UTC\s+/i) ? "Z" : "");
  const d = new Date(normalized);
  return Number.isNaN(d.valueOf()) ? s : d.toISOString();
};
const clean = <T extends object>(v: T) =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as T;

/** Compatibility mapper for callers that still provide the old MediaInfo shape. */
export function mapMediaInfoResult(input: {
  media?: { track?: Record<string, unknown>[] };
}): VideoTechnicalMetadata {
  const tracks = input.media?.track ?? [];
  if (!tracks.length) {
    return {};
  }
  const general = tracks.find((t) => t["@type"] === "General") ?? {};
  const video = tracks.find((t) => t["@type"] === "Video") ?? {};
  const location = str(general.Recorded_Location)?.match(
    /([+-]?\d+(?:\.\d+)?)°?\s*([NS]).*?([+-]?\d+(?:\.\d+)?)°?\s*([EW]).*?(\d+(?:\.\d+)?)m/i
  );
  return clean({
    bitrate: num(video.BitRate),
    codec: str(video.Format),
    creation_time: date(general.Encoded_Date),
    duration: num(general.Duration),
    exif: location
      ? {
          altitude: num(location[5]),
          device_make: str(general.Encoded_Hardware_CompanyName),
          device_model: str(general.Encoded_Hardware_Name),
          lat: num(location[1]),
          lng: num(location[3]),
          taken_at: date(general.Encoded_Date),
        }
      : undefined,
    frame_rate: num(video.FrameRate),
    height: num(video.Height),
    metadata: { general, video },
    width: num(video.Width),
  });
}

function mapExif(e?: Record<string, unknown>): VideoExifMetadata | undefined {
  if (!e) {
    return undefined;
  }
  const v = clean({
    altitude: num(e.altitude ?? e.GPSAltitude),
    device_make: str(e.Make),
    device_model: str(e.Model),
    exposure_time: str(e.ExposureTime),
    f_number: str(e.FNumber),
    focal_length: str(e.FocalLength),
    iso: num(e.ISO ?? e.PhotographicSensitivity),
    lat: num(e.latitude ?? e.GPSLatitude),
    lens_model: str(e.LensModel),
    lng: num(e.longitude ?? e.GPSLongitude),
    taken_at: date(e.DateTimeOriginalISO ?? e.DateTimeOriginal),
  });
  return Object.keys(v).length ? v : undefined;
}

export async function loadMediaInfoVideoMetadata(
  file: Blob & { name?: string }
): Promise<VideoTechnicalMetadata> {
  await initMetaprobe();
  const m = extractMetaFastSized(
    new Uint8Array(await file.arrayBuffer()),
    file.name ?? "",
    file.size
  ) as Meta;
  return clean({
    bitrate: num(m.overallBitrate),
    codec: str(m.codec),
    creation_time: date(m.creationTime ?? m.containerCreationTime),
    duration: num(m.duration),
    exif: mapExif(m.exif),
    frame_rate: num(m.frameRate),
    height: num(m.height),
    metadata: m.metadata,
    width: num(m.width),
  });
}
