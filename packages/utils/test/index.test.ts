import { describe, expect, it } from "vitest";
import {
  debounce,
  formatDistanceToNow,
  formatRelativeTime,
  getPageNumbers,
  isFastClick,
  parseUrl,
  restoreUrl,
  sleep,
  stripMarkdown,
  throttle,
} from "../src";

// ─── date ────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  it("returns 刚刚 for recent time", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("刚刚");
  });

  it("returns X分钟前", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatRelativeTime(tenMinAgo)).toBe("10分钟前");
  });

  it("returns X小时前", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe("2小时前");
  });

  it("returns 昨天", () => {
    const yesterday = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(yesterday)).toBe("昨天");
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

  it("skips undefined values", () => {
    expect(restoreUrl("/pages/home", { id: 1, name: undefined })).toBe(
      "/pages/home?id=1"
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
    expect(result.at(-1)).toBe(10);
  });

  it("shows ellipsis in middle", () => {
    const result = getPageNumbers(5, 10);
    expect(result[1]).toBe("...");
    expect(result.at(-2)).toBe("...");
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
