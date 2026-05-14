import { describe, expect, it } from "vitest";
import { fileParse, isIphoneImg } from "../src";

describe("isIphoneImg", () => {
  it("returns true for Apple device exif", () => {
    const data = {
      url: "https://example.com/photo.jpg",
      exif: JSON.stringify({ Make: { value: "Apple" } }),
    };
    expect(isIphoneImg(data)).toBe(true);
  });

  it("returns false for non-Apple device exif", () => {
    const data = {
      url: "https://example.com/photo.jpg",
      exif: JSON.stringify({ Make: { value: "Samsung" } }),
    };
    expect(isIphoneImg(data)).toBe(false);
  });

  it("returns false when exif is empty", () => {
    const data = { url: "https://example.com/photo.jpg" };
    expect(isIphoneImg(data)).toBe(false);
  });
});

describe("fileParse", () => {
  it("parses image file with default options", () => {
    const data = {
      url: "https://cdn.example.com/photo.jpg",
      type: "image/jpeg",
    };
    const result = fileParse(data);
    expect(result.fileType).toBe("IMAGE");
    expect(result.baseSrc).toBe("https://cdn.example.com/photo.jpg");
    expect(result.thumbnailUrl).toBe(
      "https://cdn.example.com/photo.jpg?x-oss-process=image/resize,l_400"
    );
  });

  it("parses heic file and converts format", () => {
    const data = {
      url: "https://cdn.example.com/photo.heic",
      type: "image/heic",
    };
    const result = fileParse(data);
    expect(result.baseSrc).toContain("format,jpg");
    expect(result.thumbnailUrl).toContain("format,jpg");
  });

  it("parses video file", () => {
    const data = {
      url: "https://cdn.example.com/video.mp4",
      type: "video/mp4",
    };
    const result = fileParse(data);
    expect(result.fileType).toBe("VIDEO");
    expect(result.cover).toContain("video/snapshot");
  });

  it("uses provided cover for video", () => {
    const data = {
      url: "https://cdn.example.com/video.mp4",
      type: "video/mp4",
      cover: "https://cdn.example.com/custom-cover.jpg",
    };
    const result = fileParse(data);
    expect(result.cover).toBe("https://cdn.example.com/custom-cover.jpg");
  });

  it("respects custom format option", () => {
    const data = {
      url: "https://cdn.example.com/photo.heic",
      type: "image/heic",
    };
    const result = fileParse(data, { format: "webp" });
    expect(result.baseSrc).toContain("format,webp");
  });
});
