import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/file.ts", "src/picker.ts", "src/transport.ts", "src/media.ts", "src/browser.ts"],
  format: ["esm", "cjs"],
  treeshake: true,
});
