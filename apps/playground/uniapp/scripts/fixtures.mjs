// Synthetic metadata containers with known expectations; no private media.
function concat(...parts) {
  const output = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
const ascii = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0));
function box(type, payload) {
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, payload.length + 8);
  header.set(ascii(type), 4);
  return concat(header, payload);
}

export function createFixtures() {
  const tiff = new Uint8Array(128);
  const view = new DataView(tiff.buffer);
  tiff.set([73, 73, 42, 0, 8, 0, 0, 0]);
  view.setUint16(8, 3, true);
  const entry = (offset, tag, type, count, value) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, value, true);
  };
  entry(10, 0x01_0f, 2, 8, 60);
  entry(22, 0x01_12, 3, 1, 6);
  entry(34, 0x87_69, 4, 1, 72);
  tiff.set(ascii("TestCam\0"), 60);
  view.setUint16(72, 1, true);
  entry(74, 0x90_03, 2, 20, 100);
  tiff.set(ascii("2026:10:15 12:34:56\0"), 100);
  const exif = concat(ascii("Exif\0\0"), tiff);
  const marker = new Uint8Array([255, 225, 0, 0]);
  new DataView(marker.buffer).setUint16(2, exif.length + 2);
  const jpeg = concat(
    new Uint8Array([255, 216]),
    marker,
    exif,
    new Uint8Array([255, 192, 0, 11, 8, 0, 24, 0, 32, 1, 1, 17, 0, 255, 217])
  );
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(png.buffer).setUint32(16, 7);
  new DataView(png.buffer).setUint32(20, 5);
  png.set([8, 2], 24);
  const mvhd = new Uint8Array(100);
  const movieView = new DataView(mvhd.buffer);
  movieView.setUint32(4, 2_082_844_800);
  movieView.setUint32(12, 1000);
  movieView.setUint32(16, 2500);
  const mp4 = concat(
    box("ftyp", ascii("isom\0\0\0\0isommp42")),
    box("moov", box("mvhd", mvhd))
  );
  return [
    {
      bytes: jpeg,
      exif: { DateTimeOriginal: "2026:10:15 12:34:56", Make: "TestCam" },
      expected: { format: "jpeg", height: 24, kind: "image", width: 32 },
      name: "照片😀.data",
    },
    {
      bytes: png,
      expected: { format: "png", height: 5, kind: "image", width: 7 },
      name: "renamed-png.data",
    },
    {
      bytes: mp4,
      expected: { duration: 2.5, format: "mp4", kind: "video" },
      name: "video.data",
    },
  ];
}
