import { describe, expect, it } from "vitest";
import { compressImage } from "../src/compress";
import { readImageContainer, replaceExif } from "../src/image-metadata";
import { exifTiff, metadataChunk } from "./image-fixtures";

async function photo(kind: "jpeg" | "png" | "webp", orientation = 6) {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 240;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas unavailable");
  }
  const pixels = context.createImageData(canvas.width, canvas.height);
  let random = 123;
  for (let i = 0; i < pixels.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      random = (random * 16_807) % 2_147_483_647;
      pixels.data[i + channel] = random % 256;
    }
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  for (const [color, x, y] of [
    ["red", 0, 0],
    ["lime", 352, 0],
    ["blue", 0, 192],
    ["yellow", 352, 192],
  ] as const) {
    context.fillStyle = color;
    context.fillRect(x, y, 48, 48);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("Encoding failed")),
      `image/${kind}`,
      1
    );
  });
  const image = readImageContainer(new Uint8Array(await blob.arrayBuffer()));
  const bytes = replaceExif(image, [
    metadataChunk(kind, exifTiff(orientation)),
  ]);
  return new File([bytes], `photo.${kind}`, { type: `image/${kind}` });
}
describe("real browser image compression", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "compresses %s retaining every EXIF byte and display orientation",
    async (kind) => {
      const file = await photo(kind);
      const output = await compressImage(file, { maxSizeMB: 0.015 });
      const before = readImageContainer(
        new Uint8Array(await file.arrayBuffer())
      );
      const after = readImageContainer(
        new Uint8Array(await output.arrayBuffer())
      );
      expect(after.exif).toEqual(before.exif);
      expect(output.size).toBeLessThan(file.size);
      expect([after.width, after.height]).toEqual([
        before.width,
        before.height,
      ]);
      const original = await createImageBitmap(file);
      const compressed = await createImageBitmap(output);
      expect([compressed.width, compressed.height]).toEqual([
        original.width,
        original.height,
      ]);
      original.close();
      compressed.close();
    },
    60_000
  );
  it.each([1, 2, 3, 4, 5, 7, 8])(
    "retains JPEG orientation %i without double rotation",
    async (orientation) => {
      const file = await photo("jpeg", orientation);
      const output = await compressImage(file, { maxSizeMB: 0.015 });
      expect(
        readImageContainer(new Uint8Array(await output.arrayBuffer())).exif
      ).toEqual([metadataChunk("jpeg", exifTiff(orientation))]);
      const original = await createImageBitmap(file);
      const compressed = await createImageBitmap(output);
      expect([compressed.width, compressed.height]).toEqual([
        original.width,
        original.height,
      ]);
      const sample = (bitmap: ImageBitmap) => {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas unavailable");
        }
        context.drawImage(bitmap, 0, 0);
        return [...context.getImageData(10, 10, 1, 1).data];
      };
      const before = sample(original);
      const after = sample(compressed);
      for (let channel = 0; channel < 4; channel += 1) {
        expect(Math.abs(before[channel] - after[channel])).toBeLessThan(30);
      }
      original.close();
      compressed.close();
    },
    60_000
  );
});
