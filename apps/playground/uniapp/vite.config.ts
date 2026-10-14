import { resolve } from "node:path";
import uni from "@dcloudio/vite-plugin-uni";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      "@life-palette/uploader-uniapp": resolve(
        import.meta.dirname,
        "../../../packages/uploader-uniapp/src/index.ts"
      ),
    },
  },
});
