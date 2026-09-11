import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const pkg = (name: string) =>
  resolve(import.meta.dirname, `../../packages/${name}/src/index.ts`);

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@life-palette/utils": pkg("utils"),
      "@life-palette/media": pkg("media"),
      "@life-palette/uploader": pkg("uploader"),
    },
  },
});
