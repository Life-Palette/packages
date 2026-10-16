import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { connectWechat } from "./wechat-automation.mjs";
const { call, close } = await connectWechat();
const fixtureAsset = process.env.METAPROBE_FIXTURE_ASSET || "static/uploader-uniapp/metadata-fixture.jpg";

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
  const visualAnalysis = await call("App.callFunction", {
    args: [fixtureAsset],
    functionDeclaration: `async function (fixtureAsset) {
      const page = getCurrentPages()[getCurrentPages().length - 1].$vm;
      const api = require("common/vendor.js").index;
      const fs = api.getFileSystemManager();
      const path = api.env.USER_DATA_PATH + "/metaprobe-visual-" + Date.now() + ".jpg";
      fs.copyFileSync(fixtureAsset, path);
      const metadata = await page.analyzeFile(path, fixtureAsset.split("/").pop());
      fs.unlinkSync(path);
      return {
        passed: !!metadata?.basic?.width && !!metadata?.image?.blurhash && !!metadata?.image?.arthash && metadata.image.colors.length > 0 && !!metadata.image.exif.device_make,
        basic: metadata?.basic,
        blurhash: metadata?.image?.blurhash,
        arthash: metadata?.image?.arthash,
        arthashCodec: metadata?.image?.arthash_codec,
        colors: metadata?.image?.colors,
        exif: metadata?.image?.exif,
        status: page.status,
      };
    }`,
  });
  report.visualAnalysis = visualAnalysis.result;
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
        const metadata = await page.analyzeFile(path, "large-fixture.jpg", false);
        return { passed: (sourcePath ? metadata?.basic?.width > 0 && metadata?.basic?.height > 0 : metadata?.basic?.width === 32 && metadata?.basic?.height === 24) && !page.busy,
          bytes: size, elapsedMs: Date.now() - started, width: metadata?.basic?.width,
          height: metadata?.basic?.height, busy: page.busy, status: page.status,
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
  await call("App.callFunction", {
    args: [fixtureAsset],
    functionDeclaration: `async function (fixtureAsset) {
      const page = getCurrentPages()[getCurrentPages().length - 1].$vm;
      const api = require("common/vendor.js").index;
      const fs = api.getFileSystemManager();
      const path = api.env.USER_DATA_PATH + "/metaprobe-visual-view-" + Date.now() + ".jpg";
      fs.copyFileSync(fixtureAsset, path);
      try {
        await page.analyzeFile(path, fixtureAsset.split("/").pop());
      } finally {
        fs.unlinkSync(path);
      }
      return true;
    }`,
  });
  await delay(300);
  try {
    const screenshot = await call("App.captureScreenshot");
    if (screenshot.data) {
      await writeFile(
        resolvePath(output, "simulator.png"),
        Buffer.from(screenshot.data, "base64")
      );
    }
    await call("App.callWxMethod", {
      args: [{ scrollTop: 1050, duration: 0 }],
      method: "pageScrollTo",
    });
    await delay(300);
    const detailsScreenshot = await call("App.captureScreenshot");
    if (detailsScreenshot.data) {
      await writeFile(
        resolvePath(output, "simulator-details.png"),
        Buffer.from(detailsScreenshot.data, "base64")
      );
    }
  } catch (error) {
    console.log(`Screenshot unavailable: ${error.message}`);
  }
  assert.equal(report.largeFile.passed, true, JSON.stringify(report.largeFile));
  assert.equal(
    report.visualAnalysis.passed,
    true,
    JSON.stringify(report.visualAnalysis)
  );
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
