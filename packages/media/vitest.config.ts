import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const metaprobeWasmPath = fileURLToPath(
  new URL("../../node_modules/metaprobe/wasm/index.js", import.meta.url)
);

export default defineConfig({
  resolve: {
    alias: {
      // The published package's Node condition expects an optional native
      // binary that is not shipped for every CI runner. Tests exercise the
      // pure metadata mapper, so use the portable WASM entry instead.
      metaprobe: metaprobeWasmPath,
    },
  },
  test: {
    projects: [
      {
        // Node-environment tests: pure functions only.
        extends: true,
        resolve: {
          alias: {
            metaprobe: metaprobeWasmPath,
          },
        },
        test: {
          environment: "node",
          exclude: ["test/**/*.browser.test.ts"],
          include: ["test/**/*.test.ts"],
          name: "node",
        },
      },
    ],
  },
});
