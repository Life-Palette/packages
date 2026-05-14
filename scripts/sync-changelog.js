#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(process.cwd());
const sources = [
  resolve(rootDir, "packages/utils/CHANGELOG.md"),
  resolve(rootDir, "CHANGELOG.md"),
];
const docsChangelogPath = resolve(rootDir, "docs/changelog.md");

try {
  const source = sources.find((s) => existsSync(s));
  if (!source) {
    console.log("⚠️ No CHANGELOG.md found, skipping sync.");
    process.exit(0);
  }
  const changelog = readFileSync(source, "utf8");
  writeFileSync(docsChangelogPath, changelog);
  console.log("✅ Changelog synced to docs successfully!");
} catch {
  console.error("❌ Failed to sync changelog");
  process.exit(1);
}
