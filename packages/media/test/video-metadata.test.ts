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
            Duration: 2.066_667,
            Encoded_Date: "UTC 2024-01-02 03:04:05",
            Encoded_Hardware_CompanyName: "Apple",
            Encoded_Hardware_Name: "iPhone 15 Pro Max",
            Format: "MPEG-4",
            Recorded_Location: "29.5789°N 103.4644°E 461.150m",
          },
          {
            "@type": "Video",
            BitRate: 1_234_567,
            Format: "AVC",
            FrameRate: 29.97,
            Height: 720,
            Width: 960,
          },
        ],
      },
    });

    expect(result).toMatchObject({
      bitrate: 1_234_567,
      codec: "AVC",
      creation_time: "2024-01-02T03:04:05.000Z",
      duration: 2.066_667,
      frame_rate: 29.97,
      height: 720,
      width: 960,
    });
    expect(result.exif).toMatchObject({
      altitude: 461.15,
      device_make: "Apple",
      device_model: "iPhone 15 Pro Max",
      lat: 29.5789,
      lng: 103.4644,
      taken_at: "2024-01-02T03:04:05.000Z",
    });
    expect(result.metadata).toMatchObject({
      general: { Format: "MPEG-4" },
      video: { Height: 720, Width: 960 },
    });
  });

  it("returns an empty result when no tracks are available", () => {
    expect(
      mapMediaInfoResult({ media: { "@ref": "empty", track: [] } })
    ).toEqual({});
  });
});
