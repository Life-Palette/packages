import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeMedia, type MediaRuntime } from "../src/media";
import { extractMetaFastSized } from "metaprobe/miniprogram";
import { initArthash } from "../src/generated/arthash.js";
import { UploadCancellation } from "../src/types";

vi.mock("metaprobe/miniprogram", () => ({ default: vi.fn(async () => undefined), extractMetaFastSized: vi.fn() }));
vi.mock("../src/generated/arthash.js", () => ({ initArthash: vi.fn(async () => undefined), encodeRgb: vi.fn(() => new Uint8Array([1, 2, 3])) }));

function fixture() {
  const reader = { name: "photo.jpg", size: 7, checksum: vi.fn(async () => "md5"), read: vi.fn(async () => new Uint8Array(7).buffer), close: vi.fn(async () => undefined) };
  const rgba = new Uint8ClampedArray(4 * 3 * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([48, 96, 160, 255], i);
  const context = { drawImage: vi.fn(), getImageData: () => ({ data: rgba }) };
  const api: MediaRuntime = {
    request: vi.fn(),
    arrayBufferToBase64: (data) => Buffer.from(data).toString("base64"),
    createOffscreenCanvas: vi.fn(() => ({ width: 1, height: 1, getContext: () => context, createImage: () => ({
      width: 4, height: 3, onload: null as (() => void) | null, onerror: null,
      set src(_value: string) { queueMicrotask(() => this.onload?.()); },
    }) })),
  };
  return { reader, api, config: { platform: "mp" as const, uni: api, openFile: async () => reader } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(extractMetaFastSized).mockReturnValue({ kind: "image", format: "jpeg", width: 4, height: 3, colorSpace: "sRGB", icc: {}, metadata: {}, exif: { Make: "Camera", PhotographicSensitivity: "200", GPSLatitude: "12.5", GPSLongitude: "34.5", DateTimeOriginalISO: "2026-10-15T12:00:00+08:00" } });
});

describe("native media analysis", () => {
  it("maps the shared schema, ISO/GPS/EXIF and computes both placeholders", async () => {
    const { config, reader } = fixture();
    const metadata = await analyzeMedia("/photo", config);
    expect(metadata.basic).toMatchObject({ md5: "md5", size: 7, width: 4, height: 3, type: "image/jpeg" });
    expect(metadata.image?.exif).toMatchObject({ device_make: "Camera", iso: 200, lat: 12.5, lng: 34.5, taken_at: "2026-10-15T04:00:00.000Z" });
    expect(metadata.image?.exif.raw).toBeUndefined();
    expect(metadata.image?.colors).toHaveLength(1);
    expect(metadata.image?.blurhash).toBeTruthy();
    expect(metadata.image?.arthash).toBe("AQID");
    expect(metadata.image?.arthash_codec).toBe("rect-v64");
    expect(reader.close).toHaveBeenCalledOnce();
  });
  it("supports explicit metadata-only analysis and supplied checksum", async () => {
    const { config, reader, api } = fixture();
    const metadata = await analyzeMedia("/photo", config, { visualAnalysis: false, checksum: "provided", includeRawExif: true });
    expect(metadata.basic.md5).toBe("provided");
    expect(reader.checksum).not.toHaveBeenCalled();
    expect(api.createOffscreenCanvas).not.toHaveBeenCalled();
    expect(metadata.image?.exif.raw?.Make).toBe("Camera");
    expect(metadata.image?.arthash).toBeUndefined();
  });
  it("maps video fields without creating an image canvas", async () => {
    const { config, api } = fixture();
    vi.mocked(extractMetaFastSized).mockReturnValue({ kind: "video", format: "mp4", width: 1280, height: 720, colorSpace: "Unknown", exif: {}, icc: {}, metadata: { encoder: "Camera" }, duration: 2.5, frameRate: 30, videoBitrate: 123, codec: "H.264" });
    const result = await analyzeMedia("/video", config);
    expect(result.video).toMatchObject({ duration: 2.5, frame_rate: 30, bitrate: 123, width: 1280, height: 720, codec: "H.264" });
    expect(api.createOffscreenCanvas).not.toHaveBeenCalled();
  });
  it("releases its reader on cancellation and propagates placeholder failures", async () => {
    const { config, reader } = fixture();
    const cancellation = new UploadCancellation();
    cancellation.cancel();
    await expect(analyzeMedia("/photo", config, { cancellation })).rejects.toThrow("cancelled");
    expect(reader.read).not.toHaveBeenCalled();
    expect(reader.close).toHaveBeenCalledOnce();
    vi.mocked(initArthash).mockRejectedValueOnce(new Error("WASM failed"));
    await expect(analyzeMedia("/photo", config)).rejects.toThrow("WASM failed");
    expect(reader.close).toHaveBeenCalledTimes(2);
  });
});
