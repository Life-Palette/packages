import imageCompression from "browser-image-compression";
import { describe, expect, it, vi } from "vitest";
import { compressImage } from "../src/compress";
import { readImageContainer, replaceExif } from "../src/image-metadata";
import { jpeg, metadataChunk } from "./image-fixtures";

vi.mock("browser-image-compression", () => ({ default: vi.fn() }));
function input(type = "image/jpeg") {
  const bytes = replaceExif(readImageContainer(jpeg()), [
    metadataChunk("jpeg"),
  ]);
  return new File([bytes], "photo.jpg", { lastModified: 123, type });
}
describe("compressImage", () => {
  it("preserves EXIF bytes, orientation, filename and timestamps", async () => {
    const file = input();
    vi.mocked(imageCompression).mockImplementationOnce(
      async (stripped, options) => {
        expect(
          readImageContainer(new Uint8Array(await stripped.arrayBuffer())).exif
        ).toEqual([]);
        expect(options.alwaysKeepResolution).toBe(true);
        expect(options.exifOrientation).toBe(1);
        options.onProgress?.(100);
        return new File([jpeg(30)], "blob", { type: "image/jpeg" });
      }
    );
    const progress: number[] = [];
    const output = await compressImage(file, {
      maxSizeMB: 1,
      onProgress: (percent) => progress.push(percent),
    });
    expect(output.size).toBeLessThan(file.size);
    expect(output.name).toBe(file.name);
    expect(output.lastModified).toBe(123);
    expect(
      readImageContainer(new Uint8Array(await output.arrayBuffer())).exif
    ).toEqual([metadataChunk("jpeg")]);
    expect(progress).toEqual([95, 100]);
  });
  it("sniffs actual bytes when MIME is incorrect", async () => {
    vi.mocked(imageCompression).mockResolvedValueOnce(
      new File([jpeg(30)], "blob")
    );
    expect((await compressImage(input("application/octet-stream"))).type).toBe(
      "image/jpeg"
    );
  });
  it.each(["image/gif", "image/heic", "image/avif", "video/quicktime"])(
    "retains unsupported containers (%s)",
    async (type) => {
      const file = new File(["unsupported bytes"], "media", { type });
      expect(await compressImage(file)).toBe(file);
    }
  );
  it("retains original when output including restored EXIF is larger", async () => {
    const file = input();
    vi.mocked(imageCompression).mockResolvedValueOnce(
      new File([jpeg(1200)], "blob")
    );
    expect(await compressImage(file)).toBe(file);
  });
  it("rejects empty output, changed dimensions and invalid targets", async () => {
    vi.mocked(imageCompression).mockResolvedValueOnce(new File([], "blob"));
    await expect(compressImage(input())).rejects.toThrow("empty file");
    vi.mocked(imageCompression).mockResolvedValueOnce(
      new File([jpeg(30, 15)], "blob")
    );
    await expect(compressImage(input())).rejects.toThrow("dimensions");
    await expect(compressImage(input(), { maxSizeMB: 0 })).rejects.toThrow(
      RangeError
    );
  });
  it("rejects corrupt container lengths", async () => {
    const bytes = jpeg();
    bytes[4] = 255;
    await expect(
      compressImage(new File([bytes], "corrupt.jpg"))
    ).rejects.toThrow("Invalid image container");
  });
});
