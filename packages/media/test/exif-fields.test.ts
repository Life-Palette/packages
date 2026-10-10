import { describe, expect, it } from "vitest";
import { readExifIso } from "../src/exif-fields";

describe("readExifIso", () => {
  it("normalizes PhotographicSensitivity from camera EXIF", () => {
    expect(readExifIso({ PhotographicSensitivity: "160" })).toBe(160);
  });

  it("accepts ISO aliases from other EXIF readers", () => {
    expect(readExifIso({ ISOSpeedRatings: 400 })).toBe(400);
    expect(readExifIso({ ISO: "800" })).toBe(800);
  });

  it("ignores missing or invalid ISO values", () => {
    expect(readExifIso({})).toBeUndefined();
    expect(readExifIso({ PhotographicSensitivity: "unknown" })).toBeUndefined();
  });
});
