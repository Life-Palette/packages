import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/shared.ts", "src/react-native.ts"],
  format: ["esm", "cjs"],
  // SparkMD5 / mediainfo.js / arthash / blurhash / exifr are pulled in by
  // dynamic imports — keep them bundled because consumers don't install them.
  noExternal: [
    "spark-md5",
    "mediainfo.js",
    "arthash",
    "blurhash",
    "exifr",
    "base64-js",
  ],
  treeshake: true,
});
