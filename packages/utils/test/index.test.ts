import { describe, expect, it } from "vitest";
import {
  debounce,
  detectLivePhotoPairs,
  fileParse,
  formatDistanceToNow,
  formatRelativeTime,
  generateOssImageParams,
  getPageNumbers,
  getVideoThumbnailUrl,
  isFastClick,
  isLivePhoto,
  isVideo,
  parseFileName,
  parseUrl,
  restoreUrl,
  sleep,
  stripMarkdown,
  throttle,
} from "../src";

// ─── media ───────────────────────────────────────────────

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

// ─── date ────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  it("returns 刚刚 for recent time", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("刚刚");
  });

  it("returns X小时前", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe("2小时前");
  });
});

describe("formatDistanceToNow", () => {
  it("returns 刚刚 for now", () => {
    expect(formatDistanceToNow(new Date())).toBe("刚刚");
  });

  it("returns X分钟前", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatDistanceToNow(fiveMinAgo)).toBe("5分钟前");
  });
});

// ─── url ─────────────────────────────────────────────────

describe("parseUrl", () => {
  it("parses path and query", () => {
    const r = parseUrl("/pages/home/index?id=123&name=test");
    expect(r.name).toBe("index");
    expect(r.path).toBe("/pages/home/index");
    expect(r.query).toEqual({ id: "123", name: "test" });
  });

  it("handles no query", () => {
    const r = parseUrl("/pages/home/index");
    expect(r.query).toEqual({});
  });
});

describe("restoreUrl", () => {
  it("restores url with query", () => {
    expect(restoreUrl("/pages/home", { id: 1, name: "a" })).toBe(
      "/pages/home?id=1&name=a"
    );
  });

  it("returns path only when no query", () => {
    expect(restoreUrl("/pages/home", {})).toBe("/pages/home");
  });
});

describe("isFastClick", () => {
  it("detects fast click", () => {
    isFastClick(); // first call
    expect(isFastClick(1000)).toBe(true);
  });
});

// ─── pagination ──────────────────────────────────────────

describe("getPageNumbers", () => {
  it("returns all pages when total <= 5", () => {
    expect(getPageNumbers(1, 3)).toEqual([1, 2, 3]);
  });

  it("shows ellipsis near beginning", () => {
    const result = getPageNumbers(2, 10);
    expect(result[0]).toBe(1);
    expect(result).toContain("...");
    expect(result[result.length - 1]).toBe(10);
  });

  it("shows ellipsis in middle", () => {
    const result = getPageNumbers(5, 10);
    expect(result[1]).toBe("...");
    expect(result[result.length - 2]).toBe("...");
  });
});

// ─── markdown ────────────────────────────────────────────

describe("stripMarkdown", () => {
  it("strips headings", () => {
    expect(stripMarkdown("# Hello")).toBe("Hello");
  });

  it("strips bold and italic", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });

  it("strips links", () => {
    expect(stripMarkdown("[text](http://url)")).toBe("text");
  });

  it("returns empty for empty input", () => {
    expect(stripMarkdown("")).toBe("");
  });
});

// ─── async ───────────────────────────────────────────────

describe("sleep", () => {
  it("resolves after delay", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe("debounce", () => {
  it("delays execution", async () => {
    let count = 0;
    const fn = debounce(() => count++, 50);
    fn();
    fn();
    fn();
    expect(count).toBe(0);
    await sleep(80);
    expect(count).toBe(1);
  });
});

describe("throttle", () => {
  it("limits execution rate", async () => {
    let count = 0;
    const fn = throttle(() => count++, 50);
    fn();
    fn();
    fn();
    expect(count).toBe(1);
    await sleep(80);
    fn();
    expect(count).toBe(2);
  });
});
