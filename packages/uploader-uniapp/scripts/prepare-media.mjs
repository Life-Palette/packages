import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'

const entry = new URL(import.meta.resolve('arthash'))
const glueUrl = new URL('../wasm/pkg/arthash_wasm.js', entry)
const source = await readFile(glueUrl, 'utf8')
const boundary = source.indexOf('\nasync function __wbg_load(')
if (boundary < 0 || !source.includes('function __wbg_get_imports()') || !source.includes('function __wbg_finalize_init(')) {
  throw new Error('Unsupported arthash wasm-bindgen output; review the mini-program adapter.')
}
const target = new URL('../src/generated/', import.meta.url)
await mkdir(target, { recursive: true })
const adapted = `// Generated from the installed arthash version. Do not edit.
import { Utf8Encoder as TextEncoder, Utf8Decoder as TextDecoder } from 'metaprobe/miniprogram';
${source.slice(0, boundary)}
let pending;
let loadedPath;
export function initArthash(path) {
  if (pending) {
    if (path !== loadedPath) return Promise.reject(new Error('Arthash WASM path changed after initialization'));
    return pending;
  }
  if (typeof WXWebAssembly === 'undefined') return Promise.reject(new Error('WXWebAssembly is unavailable'));
  loadedPath = path;
  pending = Promise.resolve().then(() => WXWebAssembly.instantiate(path, __wbg_get_imports()))
    .then(result => __wbg_finalize_init(result.instance || result, result.module))
    .catch(error => { pending = undefined; loadedPath = undefined; throw error; });
  return pending;
}
`
if (/\bfetch\(|import\.meta|new WebAssembly\b/.test(adapted)) throw new Error('Browser loader leaked into arthash glue')
await writeFile(new URL('arthash.js', target), adapted)
const types = await readFile(new URL('arthash_wasm.d.ts', glueUrl), 'utf8')
await writeFile(new URL('arthash.d.ts', target), types.slice(0, types.indexOf('export type InitInput')) + '\nexport function initArthash(path: string): Promise<unknown>;\n')
await copyFile(new URL('arthash_wasm_bg.wasm', glueUrl), new URL('arthash.wasm', target))
const metaEntry = new URL(import.meta.resolve('metaprobe/miniprogram'))
await copyFile(new URL('index_bg.wasm', metaEntry), new URL('metaprobe.wasm', target))
console.log('Prepared matched mini-program WASM assets.')
