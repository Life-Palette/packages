import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  packageRoot,
  "node_modules/arthash/wasm/pkg/arthash_wasm_bg.wasm"
);
const target = resolve(packageRoot, "dist/arthash_wasm_bg.wasm");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

console.log(`Copied arthash WASM to ${target}`);
