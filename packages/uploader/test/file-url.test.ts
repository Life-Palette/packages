import { describe, expect, it } from "vitest";
import {
  detectLivePhotoPairs,
  fileParse,
  generateOssImageParams,
  getVideoThumbnailUrl,
  isLivePhoto,
  isVideo,
  parseFileName,
} from "../src";

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
      extension: ".heic",
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
      extension: ".heic",
    };
    const result = fileParse(data, { format: "webp" });
    expect(result.baseSrc).toContain("format,webp");
  });
});

describe("isVideo / isLivePhoto", () => {
  it("detects video", () => {
    expect(isVideo({ type: "video/mp4" })).toBe(true);
    expect(isVideo({ type: "image/jpeg" })).toBe(false);
  });

  it("detects live photo", () => {
    expect(isLivePhoto({ type: "image/jpeg", videoSrc: "http://x.mov" })).toBe(
      true
    );
    expect(isLivePhoto({ type: "video/mp4", videoSrc: "http://x.mov" })).toBe(
      false
    );
  });
});

describe("getVideoThumbnailUrl", () => {
  it("generates snapshot url", () => {
    const url = getVideoThumbnailUrl("https://cdn.example.com/v.mp4");
    expect(url).toContain("video/snapshot");
  });
});

describe("generateOssImageParams", () => {
  it("generates params with dimensions", () => {
    const params = generateOssImageParams(1920, 1080, 400, 80);
    expect(params).toContain("resize,w_400");
    expect(params).toContain("quality,q_80");
    expect(params).toContain("format,webp");
  });

  it("handles zero dimensions", () => {
    const params = generateOssImageParams(0, 0, 400);
    expect(params).toContain("resize,w_400,m_lfit");
  });
});

describe("parseFileName", () => {
  it("parses image file", () => {
    const r = parseFileName("IMG_001.jpg");
    expect(r.baseName).toBe("IMG_001");
    expect(r.ext).toBe("jpg");
    expect(r.isVideo).toBe(false);
  });

  it("parses video file", () => {
    const r = parseFileName("IMG_001.mov");
    expect(r.isVideo).toBe(true);
  });
});

describe("detectLivePhotoPairs", () => {
  it("pairs same-name image and video", () => {
    const files = [
      { name: "IMG_001.jpg", type: "image/jpeg" },
      { name: "IMG_001.mov", type: "video/quicktime" },
      { name: "IMG_002.png", type: "image/png" },
    ];
    const pairs = detectLivePhotoPairs(files);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].image.name).toBe("IMG_001.jpg");
    expect(pairs[0].video.name).toBe("IMG_001.mov");
  });
});
