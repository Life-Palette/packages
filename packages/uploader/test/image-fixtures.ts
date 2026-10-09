import { concatBytes } from "../src/image-metadata";
/** TIFF with real camera/date/GPS/MakerNote tags, including an opaque manufacturer payload. */
export function exifTiff(orientation = 6) {
  const bytes = new Uint8Array(512);
  bytes.set([73, 73, 42, 0, 8, 0, 0, 0]);
  const view = new DataView(bytes.buffer);
  const entry = (
    offset: number,
    tag: number,
    type: number,
    count: number,
    value: number
  ) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, value, true);
  };
  view.setUint16(8, 4, true);
  entry(10, 274, 3, 1, orientation);
  entry(22, 271, 2, 7, 70);
  entry(34, 34_665, 4, 1, 80);
  entry(46, 34_853, 4, 1, 120);
  bytes.set(new TextEncoder().encode("Camera\0"), 70);
  view.setUint16(80, 2, true);
  entry(82, 36_867, 2, 20, 200);
  entry(94, 37_500, 7, 16, 240);
  bytes.set(new TextEncoder().encode("2026:10:09 10:00:00\0"), 200);
  bytes.set(
    new Uint8Array([
      0, 255, 0, 127, 65, 66, 67, 0, 92, 88, 201, 188, 0, 1, 2, 3,
    ]),
    240
  );
  view.setUint16(120, 4, true);
  entry(122, 1, 2, 2, 78);
  entry(134, 2, 5, 3, 300);
  entry(146, 3, 2, 2, 69);
  entry(158, 4, 5, 3, 324);
  for (const [offset, degrees] of [
    [300, 12],
    [324, 34],
  ]) {
    view.setUint32(offset, degrees, true);
    view.setUint32(offset + 4, 1, true);
    view.setUint32(offset + 12, 1, true);
    view.setUint32(offset + 20, 1, true);
  }
  return bytes;
}
function crc32(bytes: Uint8Array) {
  let crc = 4_294_967_295;
  for (const byte of bytes) {
    // biome-ignore lint/suspicious/noBitwiseOperators: PNG CRC-32 recurrence
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      // biome-ignore lint/suspicious/noBitwiseOperators: PNG CRC-32 polynomial
      crc = (crc >>> 1) ^ (crc & 1 ? 3_988_292_384 : 0);
    }
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: unsigned CRC-32
  return (crc ^ 4_294_967_295) >>> 0;
}
export function metadataChunk(
  kind: "jpeg" | "png" | "webp",
  tiff = exifTiff()
) {
  if (kind === "jpeg") {
    const payload = concatBytes([
      new Uint8Array([69, 120, 105, 102, 0, 0]),
      tiff,
    ]);
    const bytes = new Uint8Array(payload.length + 4);
    bytes.set([255, 225]);
    new DataView(bytes.buffer).setUint16(2, payload.length + 2);
    bytes.set(payload, 4);
    return bytes;
  }
  const bytes = new Uint8Array(
    tiff.length + (kind === "png" ? 12 : 8 + (tiff.length % 2))
  );
  const view = new DataView(bytes.buffer);
  if (kind === "png") {
    view.setUint32(0, tiff.length);
    bytes.set(new TextEncoder().encode("eXIf"), 4);
    bytes.set(tiff, 8);
    view.setUint32(
      bytes.length - 4,
      crc32(bytes.subarray(4, bytes.length - 4))
    );
  } else {
    bytes.set(new TextEncoder().encode("EXIF"));
    view.setUint32(4, tiff.length, true);
    bytes.set(tiff, 8);
  }
  return bytes;
}
export function jpeg(pixels = 1000, width = 20) {
  const header = new Uint8Array([
    255,
    216,
    255,
    192,
    0,
    8,
    8,
    0,
    10,
    0,
    width,
    1,
  ]);
  const scan = new Uint8Array(pixels + 4);
  scan.set([255, 218]);
  scan.set([255, 217], scan.length - 2);
  return concatBytes([header, scan]);
}
