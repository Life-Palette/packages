import { describe, expect, it } from "vitest";
import { mapMediaInfoResult } from "../src/video-metadata";

describe("mapMediaInfoResult", () => {
  it("maps technical video metadata and keeps raw tracks", () => {
    const result = mapMediaInfoResult({
      media: {
        "@ref": "IMG_6920.MOV",
        track: [
          {
            "@type": "General",
            Format: "MPEG-4",
            Duration: 2.066667,
            Encoded_Date: "UTC 2024-01-02 03:04:05",
            Recorded_Location: "29.5789°N 103.4644°E 461.150m",
            Encoded_Hardware_CompanyName: "Apple",
            Encoded_Hardware_Name: "iPhone 15 Pro Max",
          },
          {
            "@type": "Video",
            Width: 960,
            Height: 720,
            Format: "AVC",
            BitRate: 1_234_567,
            FrameRate: 29.97,
          },
        ],
      },
    });

    expect(result).toMatchObject({
      width: 960,
      height: 720,
      duration: 2.066667,
      creation_time: "2024-01-02T03:04:05.000Z",
      codec: "AVC",
      bitrate: 1_234_567,
      frame_rate: 29.97,
    });
    expect(result.exif).toMatchObject({
      lat: 29.5789,
      lng: 103.4644,
      altitude: 461.15,
      taken_at: "2024-01-02T03:04:05.000Z",
      device_make: "Apple",
      device_model: "iPhone 15 Pro Max",
    });
    expect(result.metadata).toMatchObject({
      general: { Format: "MPEG-4" },
      video: { Width: 960, Height: 720 },
    });
  });

  it("returns an empty result when no tracks are available", () => {
    expect(mapMediaInfoResult({ media: { "@ref": "empty", track: [] } })).toEqual({});
  });
});
