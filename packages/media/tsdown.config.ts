import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  // SparkMD5 / mediainfo.js / arthash / blurhash / exifr are pulled in by
  // dynamic imports — keep them bundled because consumers don't install them.
  noExternal: ["spark-md5", "mediainfo.js", "arthash", "blurhash", "exifr"],
});
