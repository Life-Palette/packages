import { resolve } from "node:path";
import uni from "@dcloudio/vite-plugin-uni";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: [
      {
        find: /^@life-palette\/media\/shared$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/media/src/shared.ts"
        ),
      },
      {
        find: /^@life-palette\/media$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/media/src/index.ts"
        ),
      },
      {
        find: /^@life-palette\/uploader\/shared$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/uploader/src/shared.ts"
        ),
      },
      {
        find: /^@life-palette\/uploader$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/uploader/src/index.ts"
        ),
      },
      {
        find: /^@life-palette\/uploader-uniapp\/browser$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/uploader-uniapp/src/browser.ts"
        ),
      },
      {
        find: /^@life-palette\/uploader-uniapp$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/uploader-uniapp/src/index.ts"
        ),
      },
    ],
    preserveSymlinks: false,
  },
});
