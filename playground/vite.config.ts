import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@life-palette/utils": resolve(
        import.meta.dirname,
        "../packages/utils/src/index.ts"
      ),
    },
  },
});
