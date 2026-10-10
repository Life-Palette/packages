type ExifRecord = Record<string, unknown>;

/** Normalize the ISO sensitivity tags emitted by common EXIF readers. */
export function readExifIso(exif?: ExifRecord): number | undefined {
  const value =
    exif?.ISO ??
    exif?.PhotographicSensitivity ??
    exif?.ISOSpeedRatings ??
    exif?.iso;
  if (typeof value !== "number" && typeof value !== "string") {
    return undefined;
  }

  const iso = Number(value);
  return Number.isFinite(iso) ? iso : undefined;
}
