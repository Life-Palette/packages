import { extractMetaFastSized } from "metaprobe/miniprogram";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initArthash } from "../src/generated/arthash.js";
import { analyzeMedia, type MediaRuntime } from "../src/media";
import { UploadCancellation } from "../src/types";

vi.mock("metaprobe/miniprogram", () => ({
  default: vi.fn(async () => undefined),
  extractMetaFastSized: vi.fn(),
}));
vi.mock("../src/generated/arthash.js", () => ({
  encodeRgb: vi.fn(() => new Uint8Array([1, 2, 3])),
  initArthash: vi.fn(async () => undefined),
}));

function fixture() {
  const reader = {
    checksum: vi.fn(async () => "md5"),
    close: vi.fn(async () => undefined),
    name: "photo.jpg",
    read: vi.fn(async () => new Uint8Array(7).buffer),
    size: 7,
  };
  const rgba = new Uint8ClampedArray(4 * 3 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba.set([48, 96, 160, 255], i);
  }
  const context = { drawImage: vi.fn(), getImageData: () => ({ data: rgba }) };
  const api: MediaRuntime = {
    arrayBufferToBase64: (data) => Buffer.from(data).toString("base64"),
    createOffscreenCanvas: vi.fn(() => ({
      createImage: () => ({
        height: 3,
        onerror: null,
        onload: null as (() => void) | null,
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        },
        width: 4,
      }),
      getContext: () => context,
      height: 1,
      width: 1,
    })),
    request: vi.fn(),
  };
  return {
    api,
    config: { openFile: async () => reader, platform: "mp" as const, uni: api },
    reader,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(extractMetaFastSized).mockReturnValue({
    colorSpace: "sRGB",
    exif: {
      DateTimeOriginalISO: "2026-10-15T12:00:00+08:00",
      GPSLatitude: "12.5",
      GPSLongitude: "34.5",
      Make: "Camera",
      PhotographicSensitivity: "200",
    },
    format: "jpeg",
    height: 3,
    icc: {},
    kind: "image",
    metadata: {},
    width: 4,
  });
});

describe("native media analysis", () => {
  it("maps the shared schema, ISO/GPS/EXIF and computes both placeholders", async () => {
    const { config, reader } = fixture();
    const metadata = await analyzeMedia("/photo", config);
    expect(metadata.basic).toMatchObject({
      height: 3,
      md5: "md5",
      size: 7,
      type: "image/jpeg",
      width: 4,
    });
    expect(metadata.image?.exif).toMatchObject({
      device_make: "Camera",
      iso: 200,
      lat: 12.5,
      lng: 34.5,
      taken_at: "2026-10-15T04:00:00.000Z",
    });
    expect(metadata.image?.exif.raw).toBeUndefined();
    expect(metadata.image?.colors).toHaveLength(1);
    expect(metadata.image?.blurhash).toBeTruthy();
    expect(metadata.image?.arthash).toBe("AQID");
    expect(metadata.image?.arthash_codec).toBe("rect-v64");
    expect(reader.close).toHaveBeenCalledOnce();
  });
  it("supports explicit metadata-only analysis and supplied checksum", async () => {
    const { config, reader, api } = fixture();
    const metadata = await analyzeMedia("/photo", config, {
      checksum: "provided",
      includeRawExif: true,
      visualAnalysis: false,
    });
    expect(metadata.basic.md5).toBe("provided");
    expect(reader.checksum).not.toHaveBeenCalled();
    expect(api.createOffscreenCanvas).not.toHaveBeenCalled();
    expect(metadata.image?.exif.raw?.Make).toBe("Camera");
    expect(metadata.image?.arthash).toBeUndefined();
  });
  it("maps video fields without creating an image canvas", async () => {
    const { config, api } = fixture();
    vi.mocked(extractMetaFastSized).mockReturnValue({
      codec: "H.264",
      colorSpace: "Unknown",
      duration: 2.5,
      exif: {},
      format: "mp4",
      frameRate: 30,
      height: 720,
      icc: {},
      kind: "video",
      metadata: { encoder: "Camera" },
      videoBitrate: 123,
      width: 1280,
    });
    const result = await analyzeMedia("/video", config);
    expect(result.video).toMatchObject({
      bitrate: 123,
      codec: "H.264",
      duration: 2.5,
      frame_rate: 30,
      height: 720,
      width: 1280,
    });
    expect(api.createOffscreenCanvas).not.toHaveBeenCalled();
  });
  it("releases its reader on cancellation and propagates placeholder failures", async () => {
    const { config, reader } = fixture();
    const cancellation = new UploadCancellation();
    cancellation.cancel();
    await expect(
      analyzeMedia("/photo", config, { cancellation })
    ).rejects.toThrow("cancelled");
    expect(reader.read).not.toHaveBeenCalled();
    expect(reader.close).toHaveBeenCalledOnce();
    vi.mocked(initArthash).mockRejectedValueOnce(new Error("WASM failed"));
    await expect(analyzeMedia("/photo", config)).rejects.toThrow("WASM failed");
    expect(reader.close).toHaveBeenCalledTimes(2);
  });
});
