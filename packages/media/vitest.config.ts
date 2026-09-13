import { defineConfig } from "vitest/config";

export default defineConfig({
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
