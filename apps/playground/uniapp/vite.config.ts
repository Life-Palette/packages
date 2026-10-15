import { resolve } from "node:path";
import uni from "@dcloudio/vite-plugin-uni";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      "@life-palette/uploader-uniapp/browser": resolve(import.meta.dirname, "../../../packages/uploader-uniapp/src/browser.ts"),
      "@life-palette/uploader-uniapp": resolve(
        import.meta.dirname,
        "../../../packages/uploader-uniapp/src/index.ts"
      ),
      "metaprobe/miniprogram": resolve(
        process.env.METAPROBE_DIR ||
          resolve(import.meta.dirname, "../../../../metaprobe"),
        "miniprogram/index.js"
      ),
    },
  },
});
