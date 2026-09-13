import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The published package's Node condition expects an optional native
      // binary that is not shipped for every CI runner. Tests exercise the
      // pure metadata mapper, so use the portable WASM entry instead.
      metaprobe: new URL("../../node_modules/metaprobe/wasm/index.js", import.meta.url).pathname,
    },
  },
  test: {
    projects: [
      {
        // Node-environment tests: pure functions only.
        extends: true,
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
