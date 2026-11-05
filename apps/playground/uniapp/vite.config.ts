import { resolve } from "node:path";
import uni from "@dcloudio/vite-plugin-uni";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [uni()],
  // arthash loads its WASM relative to import.meta.url. Vite's dependency
  // optimizer relocates that module under /node_modules/.vite/deps and the
  // sibling WASM URL then resolves to the SPA fallback HTML instead.
  optimizeDeps: {
    exclude: ["arthash"],
  },
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
          "../../../packages/uploader/src/shared/index.ts"
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
        find: /^@life-palette\/uploader\/uniapp\/browser$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/uploader/src/uniapp/browser.ts"
        ),
      },
      {
        find: /^@life-palette\/uploader\/uniapp\/media$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/uploader/src/uniapp/media.ts"
        ),
      },
      {
        find: /^@life-palette\/uploader\/uniapp$/,
        replacement: resolve(
          import.meta.dirname,
          "../../../packages/uploader/src/uniapp/index.ts"
        ),
      },
    ],
    preserveSymlinks: false,
  },
});
