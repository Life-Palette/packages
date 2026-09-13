import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const pkg = (name: string) =>
  resolve(import.meta.dirname, `../../packages/${name}/src/index.ts`);

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    // arthash imports its wasm-bindgen glue via a relative package path;
    // excluding it prevents Vite's dep optimizer from rewriting the wasm URL.
    exclude: ["arthash", "metaprobe"],
  },
  plugins: [vue()],
  resolve: {
    alias: {
      "@life-palette/media": pkg("media"),
      "@life-palette/uploader": pkg("uploader"),
      "@life-palette/utils": pkg("utils"),
    },
  },
  server: {
    fs: {
      allow: ["D:/dev/lp/packages"],
      strict: false,
    },
  },
});
