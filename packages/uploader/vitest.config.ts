import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@life-palette\/media\/shared$/,
        replacement: fileURLToPath(
          new URL("../media/src/shared.ts", import.meta.url)
        ),
      },
      {
        find: "@life-palette/media",
        replacement: fileURLToPath(
          new URL("../media/src/index.ts", import.meta.url)
        ),
      },
      {
        find: /^metaprobe$/,
        replacement: fileURLToPath(
          new URL(
            "../media/node_modules/metaprobe/wasm/index.js",
            import.meta.url
          )
        ),
      },
    ],
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "test/**/*.browser.test.ts"],
  },
});
