import { mkdir, copyFile } from 'node:fs/promises'
await mkdir(new URL('../dist/assets/', import.meta.url), { recursive: true })
for (const name of ['arthash.wasm', 'metaprobe.wasm']) {
  await copyFile(new URL(`../src/generated/${name}`, import.meta.url), new URL(`../dist/assets/${name}`, import.meta.url))
}
