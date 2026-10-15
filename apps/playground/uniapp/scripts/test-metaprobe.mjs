import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { connectWechat } from "./wechat-automation.mjs";
const { call, close } = await connectWechat();

try {
  let page;
  const readyDeadline = Date.now() + 30_000;
  while (Date.now() < readyDeadline) {
    try {
      page = await call("App.getCurrentPage");
      if (page?.path) {
        break;
      }
    } catch {
      // The IDE can expose its automation port before page metadata is ready.
    }
    await delay(1000);
  }
  assert.ok(page?.path, "The mini-program did not finish launching");
  if (page.path !== "pages/metaprobe/index") {
    await call("App.callWxMethod", {
      args: [{ url: "/pages/metaprobe/index" }],
      method: "reLaunch",
    });
  }
  const response = await call("App.callFunction", {
    args: [],
    functionDeclaration:
      "async function () { const pages = getCurrentPages(); const page = pages[pages.length - 1]; return await page.$vm.runValidation(); }",
  });
  const report = response.result;
  const largeFile = await call("App.callFunction", {
    args: [process.env.METAPROBE_TEST_FILE || null],
    functionDeclaration: `async function (sourcePath) {
      const api = require("common/vendor.js").index;
      const fs = api.getFileSystemManager();
      const fixtures = JSON.parse(fs.readFileSync("static/metaprobe/fixtures.json", "utf8"));
      const fixture = fixtures[0];
      const path = sourcePath || api.env.USER_DATA_PATH + "/metaprobe-large-read-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".jpg";
      const size = sourcePath ? fs.statSync(path).size : 8 * 1024 * 1024;
      let created = false;
      try {
        if (!sourcePath) {
          fs.writeFileSync(path, new Uint8Array(fixture.data).buffer);
          created = true;
          const chunk = new ArrayBuffer(1024 * 1024);
          let written = fixture.data.length;
          while (written < size) {
            const length = Math.min(chunk.byteLength, size - written);
            fs.appendFileSync(path, length === chunk.byteLength ? chunk : chunk.slice(0, length));
            written += length;
          }
        }
        const pages = getCurrentPages();
        const page = pages[pages.length - 1].$vm;
        const started = Date.now();
        const metadata = await page.analyzeFile(path, "large-fixture.jpg");
        return { passed: (sourcePath ? metadata?.width > 0 && metadata?.height > 0 : metadata?.width === 32 && metadata?.height === 24) && !page.busy,
          bytes: size, elapsedMs: Date.now() - started, width: metadata?.width,
          height: metadata?.height, busy: page.busy, status: page.status,
          ...(metadata ? {} : { error: page.result }) };
      } finally {
        if (created) fs.unlinkSync(path);
      }
    }`,
  });
  report.largeFile = largeFile.result;
  const output = resolvePath(
    fileURLToPath(new URL("../", import.meta.url)),
    "dist/metaprobe-validation"
  );
  await mkdir(output, { recursive: true });
  await writeFile(
    resolvePath(output, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  try {
    const screenshot = await call("App.captureScreenshot");
    if (screenshot.data) {
      await writeFile(
        resolvePath(output, "simulator.png"),
        Buffer.from(screenshot.data, "base64")
      );
    }
  } catch (error) {
    console.log(`Screenshot unavailable: ${error.message}`);
  }
  assert.equal(report.largeFile.passed, true, JSON.stringify(report.largeFile));
  assert.equal(
    report.status,
    "passed",
    report.error || "Mini-program metadata checks failed"
  );
  assert.ok(report.checks.length >= 20);
  console.log(
    `PASS: ${report.checks.length} checks in WeChat simulator. Evidence: ${output}`
  );
} finally {
  close();
}
