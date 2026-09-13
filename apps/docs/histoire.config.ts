import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HstVue } from "@histoire/plugin-vue";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "histoire";

const r = (p: string) =>
  resolve(fileURLToPath(new URL(".", import.meta.url)), p);

export default defineConfig({
  outDir: "dist",
  plugins: [HstVue()],
  setupFile: "./src/setup.ts",
  storyMatch: ["src/stories/**/*.story.vue"],
  theme: {
    colors: {
      primary: {
        50: "#faf6f1",
        100: "#f3e9dd",
        200: "#e5d0b8",
        300: "#d4b28c",
        400: "#c29468",
        500: "#a67c52",
        600: "#8b6b4a",
        700: "#6f563c",
        800: "#57432f",
        900: "#3f3023",
      },
    },
    title: "Life Palette",
  },
  tree: {
    groups: [
      { id: "top", title: "" },
      { id: "utils", title: "@life-palette/utils" },
      { id: "media", title: "@life-palette/media" },
      { id: "uploader", title: "@life-palette/uploader" },
    ],
  },
  vite: {
    plugins: [vue()],
    resolve: {
      alias: {
        "@life-palette/media": r("../../packages/media/src/index.ts"),
        "@life-palette/uploader": r("../../packages/uploader/src/index.ts"),
        "@life-palette/utils": r("../../packages/utils/src/index.ts"),
        metaprobe: r("../../node_modules/metaprobe/wasm/index.js"),
      },
    },
  },
});
