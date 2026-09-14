import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@life-palette/media": fileURLToPath(
        new URL("../media/src/index.ts", import.meta.url)
      ),
      metaprobe: fileURLToPath(
        new URL(
          "../media/node_modules/metaprobe/wasm/index.js",
          import.meta.url
        )
      ),
    },
  },
  test: {
    environment: "node",
  },
});
