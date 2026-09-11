import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Node-environment tests: pure functions only.
        extends: true,
        test: {
          name: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.browser.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
