import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright({
        launchOptions: { channel: process.env.BROWSER_CHANNEL },
      }),
    },
    include: ["test/**/*.browser.test.ts"],
  },
});
