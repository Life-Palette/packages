#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(process.cwd());
const rootPkgPath = resolve(rootDir, "package.json");
const utilsPkgPath = resolve(rootDir, "packages/utils/package.json");

try {
  // 读取 utils 包的版本（作为主版本）
  const utilsPkg = JSON.parse(readFileSync(utilsPkgPath, "utf8"));
  const version = utilsPkg.version;

  // 更新根目录的版本
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  rootPkg.version = version;
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);

  console.log(`✅ Version synced to ${version}`);
} catch (error) {
  console.error("❌ Failed to sync version:", error.message);
  process.exit(1);
}
