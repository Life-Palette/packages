import { resolve } from "node:path";
import uni from "@dcloudio/vite-plugin-uni";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      "@life-palette/media": resolve(
        import.meta.dirname,
        "../../../packages/media/src/index.ts"
      ),
      "@life-palette/media/shared": resolve(
        import.meta.dirname,
        "../../../packages/media/src/shared.ts"
      ),
      "@life-palette/uploader": resolve(
        import.meta.dirname,
        "../../../packages/uploader/src/index.ts"
      ),
      "@life-palette/uploader-uniapp": resolve(
        import.meta.dirname,
        "../../../packages/uploader-uniapp/src/index.ts"
      ),
      "@life-palette/uploader-uniapp/browser": resolve(
        import.meta.dirname,
        "../../../packages/uploader-uniapp/src/browser.ts"
      ),
      "@life-palette/uploader/shared": resolve(
        import.meta.dirname,
        "../../../packages/uploader/src/shared.ts"
      ),
    },
    preserveSymlinks: false,
  },
});
