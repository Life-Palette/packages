/** Copy metadata containers without parsing or discarding unknown EXIF tags. */
type Bytes = Uint8Array<ArrayBuffer>;
type Kind = "jpeg" | "png" | "webp";
interface Chunk {
  bytes: Bytes;
  type: string;
}
export interface ImageContainer {
  animated: boolean;
  chunks: Chunk[];
  exif: Bytes[];
  header: Bytes;
  height: number;
  kind: Kind;
  mime: string;
  width: number;
}
function text(bytes: Bytes, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
export function concatBytes(parts: Bytes[]): Bytes {
  const result = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function requireBytes(condition: boolean): asserts condition {
  if (!condition) {
    throw new Error("Invalid image container; cannot safely preserve EXIF");
  }
}
function hasFlag(value: number, flag: number) {
  return Math.floor(value / flag) % 2 === 1;
}
function read24(bytes: Bytes, offset: number) {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65_536;
}
export function detectImageKind(bytes: Bytes) {
  if (bytes[0] === 255 && bytes[1] === 216) {
    return "jpeg";
  }
  if (bytes[0] === 137 && text(bytes, 1, 7) === "PNG\r\n\x1a\n") {
    return "png";
  }
  if (text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
}
function jpegChunks(bytes: Bytes): Chunk[] {
  const view = new DataView(bytes.buffer);
  const chunks: Chunk[] = [];
  let offset = 2;
  while (offset < bytes.length) {
    requireBytes(bytes[offset] === 255 && offset + 1 < bytes.length);
    let markerOffset = offset + 1;
    while (bytes[markerOffset] === 255) {
      markerOffset += 1;
    }
    const marker = bytes[markerOffset];
    requireBytes(marker !== undefined && marker !== 0);
    if (marker === 218 || marker === 217) {
      chunks.push({ bytes: bytes.slice(offset), type: "pixels" });
      break;
    }
    requireBytes(markerOffset + 3 <= bytes.length);
    const length = view.getUint16(markerOffset + 1);
    const end = markerOffset + 1 + length;
    requireBytes(length >= 2 && end <= bytes.length);
    // Normalize marker fill bytes so offsets within each segment are stable.
    chunks.push({
      bytes: bytes.slice(markerOffset - 1, end),
      type: marker === 225 ? "exif" : String(marker),
    });
    offset = end;
  }
  return chunks;
}
function rasterChunks(bytes: Bytes, kind: "png" | "webp"): Chunk[] {
  const view = new DataView(bytes.buffer);
  const chunks: Chunk[] = [];
  if (kind === "webp") {
    requireBytes(view.getUint32(4, true) + 8 === bytes.length);
  }
  let offset = kind === "png" ? 8 : 12;
  while (offset < bytes.length) {
    requireBytes(offset + 8 <= bytes.length);
    const length = view.getUint32(
      kind === "png" ? offset : offset + 4,
      kind === "webp"
    );
    const end =
      offset + (kind === "png" ? length + 12 : length + 8 + (length % 2));
    requireBytes(end <= bytes.length);
    chunks.push({
      bytes: bytes.slice(offset, end),
      type: text(bytes, kind === "png" ? offset + 4 : offset, 4),
    });
    offset = end;
  }
  return chunks;
}
function dimensions(chunks: Chunk[]) {
  for (const { bytes, type } of chunks) {
    const view = new DataView(bytes.buffer);
    if (type === "IHDR") {
      requireBytes(bytes.length === 25);
      return { height: view.getUint32(12), width: view.getUint32(8) };
    }
    if (type === "VP8X") {
      requireBytes(bytes.length === 18);
      return { height: read24(bytes, 15) + 1, width: read24(bytes, 12) + 1 };
    }
    if (type === "VP8 ") {
      requireBytes(bytes.length >= 18);
      return {
        height: view.getUint16(16, true) % 16_384,
        width: view.getUint16(14, true) % 16_384,
      };
    }
    if (type === "VP8L") {
      requireBytes(bytes.length >= 13 && bytes[8] === 47);
      const bits = view.getUint32(9, true);
      return {
        height: (Math.floor(bits / 16_384) % 16_384) + 1,
        width: (bits % 16_384) + 1,
      };
    }
    if (
      Number(type) >= 192 &&
      Number(type) <= 207 &&
      ![196, 200, 204].includes(Number(type))
    ) {
      requireBytes(bytes.length >= 10);
      return { height: view.getUint16(5), width: view.getUint16(7) };
    }
  }
  throw new Error("Image dimensions missing; cannot safely preserve EXIF");
}
function isAnimated(chunk: Chunk) {
  if (["acTL", "ANIM", "ANMF"].includes(chunk.type)) {
    return true;
  }
  if (chunk.type === "VP8X") {
    return hasFlag(chunk.bytes[8], 2);
  }
  // Re-encoding JPEG motion photos would invalidate embedded video offsets.
  if (chunk.type === "226") {
    return text(chunk.bytes, 4, 4) === "MPF\0";
  }
  if (chunk.type === "exif") {
    const content = new TextDecoder().decode(chunk.bytes);
    return content.includes("MotionPhoto") || content.includes("MicroVideo");
  }
  return false;
}
function exifType(kind: Kind) {
  return kind === "jpeg" ? "exif" : kind === "png" ? "eXIf" : "EXIF";
}
export function readImageContainer(bytes: Bytes): ImageContainer {
  const kind = detectImageKind(bytes);
  requireBytes(kind !== undefined);
  const chunks =
    kind === "jpeg" ? jpegChunks(bytes) : rasterChunks(bytes, kind);
  const size = dimensions(chunks);
  requireBytes(size.width > 0 && size.height > 0);
  return {
    ...size,
    animated: chunks.some(isAnimated),
    chunks,
    exif: chunks
      .filter((chunk) => chunk.type === exifType(kind))
      .map((chunk) => chunk.bytes),
    header: bytes.slice(0, kind === "jpeg" ? 2 : kind === "png" ? 8 : 12),
    kind,
    mime: `image/${kind}`,
  };
}
function extendedWebp(image: ImageContainer, chunks: Chunk[]) {
  const bytes = new Uint8Array(18);
  bytes.set([86, 80, 56, 88, 10, 0, 0, 0]);
  const lossless = chunks.find((chunk) => chunk.type === "VP8L");
  bytes[8] =
    chunks.some((chunk) => chunk.type === "ALPH") ||
    (lossless && hasFlag(lossless.bytes[12], 16))
      ? 16
      : 0;
  for (let i = 0; i < 3; i += 1) {
    bytes[12 + i] = Math.floor((image.width - 1) / 256 ** i) % 256;
    bytes[15 + i] = Math.floor((image.height - 1) / 256 ** i) % 256;
  }
  return { bytes, type: "VP8X" };
}
function replaceWebpExif(
  image: ImageContainer,
  chunks: Chunk[],
  exif: Bytes[]
): Bytes {
  let extended = chunks.find((chunk) => chunk.type === "VP8X");
  if (!extended && exif.length) {
    extended = extendedWebp(image, chunks);
    chunks.unshift(extended);
  }
  if (extended) {
    extended.bytes = extended.bytes.slice();
    const flags = extended.bytes[8];
    extended.bytes[8] =
      flags - (hasFlag(flags, 8) ? 8 : 0) + (exif.length ? 8 : 0);
  }
  const result = concatBytes([
    image.header,
    ...chunks.map((chunk) => chunk.bytes),
    ...exif,
  ]);
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  return result;
}
/** Strip EXIF before decoding so browsers do not rotate pixels before the original orientation is restored. */
export function replaceExif(image: ImageContainer, exif: Bytes[]): Bytes {
  const chunks = image.chunks
    .filter((chunk) => chunk.type !== exifType(image.kind))
    .map((chunk) => ({ ...chunk }));
  if (image.kind === "jpeg") {
    return concatBytes([
      image.header,
      ...exif,
      ...chunks.map((chunk) => chunk.bytes),
    ]);
  }
  if (image.kind === "webp") {
    return replaceWebpExif(image, chunks, exif);
  }
  const index = chunks.findIndex((chunk) => chunk.type === "IDAT");
  requireBytes(index >= 0);
  return concatBytes([
    image.header,
    ...chunks.slice(0, index).map((chunk) => chunk.bytes),
    ...exif,
    ...chunks.slice(index).map((chunk) => chunk.bytes),
  ]);
}
export function sameExif(before: ImageContainer, after: ImageContainer) {
  return (
    before.exif.length === after.exif.length &&
    before.exif.every((chunk, i) => {
      const other = after.exif[i];
      return (
        other?.length === chunk.length &&
        chunk.every((byte, offset) => byte === other[offset])
      );
    })
  );
}
