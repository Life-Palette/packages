import { openUploadFile, type UploadFile } from "@life-palette/uploader-uniapp";

export interface IsoBmffBox {
  name: string;
  offset: number;
  size: number;
}

export interface JpegSegment {
  marker: string;
  offset: number;
  payloadOffset: number;
  payloadSize: number;
  identifier?: string;
  payloadPreviewHex: string;
  printableStrings: string[];
}

export interface ExifDirectoryEntry {
  directory: string;
  tag: string;
  type: number;
  count: number;
  valueOffset?: number;
  valueSize?: number;
  valuePreviewHex: string;
  printableStrings: string[];
}

export interface EmbeddedSignature {
  signature: string;
  offsets: number[];
}

export interface LivePhotoForensics {
  fileSize: number;
  headHex: string;
  tailHex: string;
  jpegEoiOffset?: number;
  bytesAfterJpeg?: number;
  jpegSegments: JpegSegment[];
  exifDirectoryEntries: ExifDirectoryEntry[];
  embeddedSignatures: EmbeddedSignature[];
  videoCandidates: Array<{ offset: number; valid: boolean; boxes: IsoBmffBox[]; reason: string }>;
  markers: Array<{ marker: string; offsets: number[] }>;
  videoBoxes: IsoBmffBox[];
  embeddedVideo?: ArrayBuffer;
  embeddedVideoOffset?: number;
  embeddedVideoSize?: number;
}

const MARKERS = [
  "ContentIdentifier",
  "com.apple.quicktime.content.identifier",
  "com.apple.quicktime.still-image-time",
  "MakerApple",
  "Apple iOS",
  "MotionPhoto",
  "MicroVideo",
  "MicroVideoOffset",
  "GCamera:MotionPhoto",
  "sefd",
];

const VIDEO_BRANDS = new Set(["qt  ", "isom", "iso2", "mp41", "mp42", "M4V ", "avc1", "3gp4"]);
const MEDIA_BOXES = new Set(["mdat"]);
const STRUCTURE_BOXES = new Set(["moov", "moof"]);
const ALLOWED_TOP_LEVEL_BOXES = new Set([
  "ftyp", "moov", "mdat", "free", "wide", "skip", "uuid", "moof", "mfra", "sidx", "pdin",
]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let result = "";
  for (let index = start; index < Math.min(start + length, bytes.length); index += 1) {
    result += String.fromCharCode(bytes[index] ?? 0);
  }
  return result;
}

function findBytes(bytes: Uint8Array, needle: Uint8Array, start = 0): number[] {
  const found: number[] = [];
  for (let index = start; index <= bytes.length - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) found.push(index);
  }
  return found;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) * 0x1000000 + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function printableStrings(bytes: Uint8Array, limit = 8): string[] {
  const values: string[] = [];
  let start = -1;
  for (let index = 0; index <= bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    if (index < bytes.length && byte >= 0x20 && byte <= 0x7e) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0 && index - start >= 4) values.push(ascii(bytes, start, index - start));
    start = -1;
    if (values.length >= limit) break;
  }
  return values;
}

function inspectJpegSegments(bytes: Uint8Array): JpegSegment[] {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];
  const segments: JpegSegment[] = [];
  let offset = 2;
  while (offset + 1 < bytes.length && bytes[offset] === 0xff) {
    const markerOffset = offset;
    while (bytes[offset] === 0xff) offset += 1;
    const markerByte = bytes[offset];
    if (markerByte === undefined || markerByte === 0xda || markerByte === 0xd9) break;
    offset += 1;
    if (markerByte === 0x01 || (markerByte >= 0xd0 && markerByte <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const payloadOffset = offset + 2;
    const payloadSize = segmentLength - 2;
    const payload = bytes.subarray(payloadOffset, payloadOffset + payloadSize);
    const identifier = markerByte === 0xe1 && payload.length >= 6 && ascii(payload, 0, 6) === "Exif\0\0"
      ? "EXIF"
      : markerByte === 0xe2 && ascii(payload, 0, 4) === "MPF\0"
        ? "MPF"
        : markerByte === 0xe1 && ascii(payload, 0, 29).startsWith("http://ns.adobe.com/xap/1.0/")
          ? "XMP"
          : undefined;
    segments.push({
      marker: markerByte >= 0xe0 && markerByte <= 0xef
        ? `APP${markerByte - 0xe0}`
        : `0x${markerByte.toString(16)}`,
      offset: markerOffset,
      payloadOffset,
      payloadSize,
      ...(identifier ? { identifier } : {}),
      payloadPreviewHex: hex(payload.subarray(0, 48)),
      printableStrings: printableStrings(payload),
    });
    offset += segmentLength;
  }
  return segments;
}

function inspectExifDirectories(bytes: Uint8Array, segments: JpegSegment[]): ExifDirectoryEntry[] {
  const segment = segments.find((entry) => entry.identifier === "EXIF");
  if (!segment || segment.payloadSize < 14) return [];
  const tiffStart = segment.payloadOffset + 6;
  const byteOrder = ascii(bytes, tiffStart, 2);
  if (byteOrder !== "II" && byteOrder !== "MM") return [];
  const littleEndian = byteOrder === "II";
  const u16 = (offset: number) => littleEndian
    ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
    : ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  const u32 = (offset: number) => littleEndian
    ? ((bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16) + ((bytes[offset + 3] ?? 0) << 24)) >>> 0
    : readUint32(bytes, offset);
  const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  if (u16(tiffStart + 2) !== 42) return [];
  const pending: Array<{ name: string; offset: number }> = [{ name: "IFD0", offset: u32(tiffStart + 4) }];
  const seen = new Set<number>();
  const result: ExifDirectoryEntry[] = [];
  while (pending.length && result.length < 160) {
    const current = pending.shift()!;
    const directoryOffset = tiffStart + current.offset;
    if (seen.has(directoryOffset) || directoryOffset + 2 > segment.payloadOffset + segment.payloadSize) continue;
    seen.add(directoryOffset);
    const count = u16(directoryOffset);
    if (count > 256 || directoryOffset + 2 + count * 12 > segment.payloadOffset + segment.payloadSize) continue;
    for (let index = 0; index < count; index += 1) {
      const entryOffset = directoryOffset + 2 + index * 12;
      const tagId = u16(entryOffset);
      const type = u16(entryOffset + 2);
      const valueCount = u32(entryOffset + 4);
      const valueSize = (typeSizes[type] ?? 0) * valueCount;
      const inlineValueOffset = entryOffset + 8;
      const valueOffset = valueSize <= 4 ? inlineValueOffset : tiffStart + u32(entryOffset + 8);
      const safeSize = Number.isSafeInteger(valueSize) ? valueSize : 0;
      const inBounds = valueOffset >= tiffStart && valueOffset + safeSize <= segment.payloadOffset + segment.payloadSize;
      const tagName = tagId === 0x927c ? "MakerNote" : tagId === 0x8769 ? "ExifIFDPointer" : tagId === 0x8825 ? "GPSInfoIFDPointer" : tagId === 0xa005 ? "InteroperabilityIFDPointer" : `0x${tagId.toString(16).padStart(4, "0")}`;
      const raw = inBounds ? bytes.subarray(valueOffset, Math.min(valueOffset + safeSize, valueOffset + 256)) : new Uint8Array();
      result.push({
        directory: current.name,
        tag: tagName,
        type,
        count: valueCount,
        ...(inBounds ? { valueOffset, valueSize: safeSize } : {}),
        valuePreviewHex: hex(raw.subarray(0, 96)),
        printableStrings: printableStrings(raw, 12),
      });
      if ([0x8769, 0x8825, 0xa005].includes(tagId) && valueSize === 4) {
        const pointer = u32(entryOffset + 8);
        if (pointer > 0) pending.push({ name: tagName.replace("Pointer", ""), offset: pointer });
      }
    }
  }
  return result;
}

function findJpegEoi(bytes: Uint8Array): number | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const markerOffset = offset;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined) return undefined;
    offset += 1;
    if (marker === 0xd9) return offset;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return undefined;
    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return undefined;
    offset += segmentLength;
    if (marker !== 0xda) continue;

    while (offset + 1 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const entropyMarkerOffset = offset;
      while (bytes[offset] === 0xff) offset += 1;
      const entropyMarker = bytes[offset];
      if (entropyMarker === undefined) return undefined;
      offset += 1;
      if (entropyMarker === 0x00 || (entropyMarker >= 0xd0 && entropyMarker <= 0xd7)) continue;
      if (entropyMarker === 0xd9) return offset;
      offset = entropyMarkerOffset;
      break;
    }
  }
  return undefined;
}

function parseVideoAt(bytes: Uint8Array, ftypOffset: number): IsoBmffBox[] {
  const boxes: IsoBmffBox[] = [];
  let offset = ftypOffset;
  let hasVideoBrand = false;
  let hasMediaData = false;
  let hasMovieStructure = false;

  while (offset + 8 <= bytes.length) {
    let size = readUint32(bytes, offset);
    const name = ascii(bytes, offset + 4, 4);
    let headerSize = 8;
    if (!ALLOWED_TOP_LEVEL_BOXES.has(name)) break;
    if (size === 1) {
      if (offset + 16 > bytes.length) break;
      const high = readUint32(bytes, offset + 8);
      const low = readUint32(bytes, offset + 12);
      size = high * 0x100000000 + low;
      headerSize = 16;
      if (!Number.isSafeInteger(size)) break;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) break;

    boxes.push({ name, offset, size });
    if (name === "ftyp") {
      const brands = [ascii(bytes, offset + headerSize, 4)];
      for (let brandOffset = offset + headerSize + 8; brandOffset + 4 <= offset + size; brandOffset += 4) {
        brands.push(ascii(bytes, brandOffset, 4));
      }
      hasVideoBrand = brands.some((brand) => VIDEO_BRANDS.has(brand));
    }
    hasMediaData ||= MEDIA_BOXES.has(name);
    hasMovieStructure ||= STRUCTURE_BOXES.has(name);
    offset += size;
  }

  return hasVideoBrand && hasMediaData && hasMovieStructure ? boxes : [];
}

async function readAllBytes(file: UploadFile): Promise<Uint8Array<ArrayBuffer>> {
  const reader = await openUploadFile(file, { platform: "mp" });
  try {
    const bytes = new Uint8Array(reader.size);
    for (let start = 0; start < reader.size; start += 1024 * 1024) {
      const end = Math.min(start + 1024 * 1024, reader.size);
      const chunk = await reader.read(start, end);
      bytes.set(new Uint8Array(chunk), start);
    }
    return bytes;
  } finally {
    await reader.close();
  }
}

export function inspectLivePhotoBytes(bytes: Uint8Array): LivePhotoForensics {
  const ftypSignature = new Uint8Array([0x66, 0x74, 0x79, 0x70]);
  const candidates = findBytes(bytes, ftypSignature)
    .map((signatureOffset) => signatureOffset - 4)
    .filter((offset) => offset >= 0);
  const videoCandidates = candidates.slice(0, 32).map((offset) => {
    const boxes = parseVideoAt(bytes, offset);
    return {
      offset,
      valid: boxes.length > 0,
      boxes,
      reason: boxes.length ? "recognized ISO-BMFF video box sequence" : "ftyp signature found but top-level boxes/brands were not accepted",
    };
  });
  const videoBoxes = videoCandidates.find((candidate) => candidate.valid)?.boxes ?? [];
  const videoStart = videoBoxes[0]?.offset;
  const lastVideoBox = videoBoxes[videoBoxes.length - 1];
  const videoEnd = lastVideoBox ? lastVideoBox.offset + lastVideoBox.size : undefined;
  const jpegEoiOffset = findJpegEoi(bytes);
  const jpegSegments = inspectJpegSegments(bytes);
  const exifDirectoryEntries = inspectExifDirectories(bytes, jpegSegments);
  const signatureNames = ["ftyp", "moov", "mdat", "moof", "MPF\0", "sefd", "uuid", "ContentIdentifier", "com.apple.quicktime.content.identifier", "com.apple.quicktime.still-image-time", "Apple", "MakerApple", "MotionPhoto", "MicroVideo"];
  const embeddedSignatures = signatureNames.map((signature) => ({
    signature: signature.replace(/\0/g, "\\0"),
    offsets: findBytes(bytes, Uint8Array.from(signature, (character) => character.charCodeAt(0))).slice(0, 32),
  })).filter(({ offsets }) => offsets.length > 0);
  const markers = MARKERS.map((marker) => ({
    marker,
    offsets: findBytes(bytes, Uint8Array.from(marker, (character) => character.charCodeAt(0))).slice(0, 20),
  })).filter(({ offsets }) => offsets.length > 0);

  return {
    fileSize: bytes.byteLength,
    headHex: hex(bytes.slice(0, 32)),
    tailHex: hex(bytes.slice(-32)),
    ...(jpegEoiOffset === undefined ? {} : { jpegEoiOffset, bytesAfterJpeg: bytes.byteLength - jpegEoiOffset }),
    jpegSegments,
    exifDirectoryEntries,
    embeddedSignatures,
    videoCandidates,
    markers,
    videoBoxes,
    ...(videoStart === undefined || videoEnd === undefined
      ? {}
      : {
          embeddedVideo: bytes.slice(videoStart, videoEnd).buffer,
          embeddedVideoOffset: videoStart,
          embeddedVideoSize: videoEnd - videoStart,
        }),
  };
}

export async function inspectLivePhotoFile(file: UploadFile): Promise<LivePhotoForensics> {
  return inspectLivePhotoBytes(await readAllBytes(file));
}
