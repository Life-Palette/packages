import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    "src/index.ts",
    "src/shared.ts",
    "src/core/index.ts",
    "src/web/index.ts",
    "src/expo/index.ts",
    "src/uniapp/index.ts",
    "src/uniapp/file.ts",
    "src/uniapp/picker.ts",
    "src/uniapp/transport.ts",
    "src/uniapp/media.ts",
    "src/uniapp/browser.ts",
  ],
  format: ["esm", "cjs"],
  treeshake: true,
});
