import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const libraryRoot = resolve(
  process.env.METAPROBE_DIR || resolve(appRoot, "../../../../metaprobe")
);
try {
  await access(resolve(libraryRoot, "miniprogram/glue.js"));
  await access(resolve(libraryRoot, "miniprogram/index.js"));
} catch (cause) {
  throw new Error(
    `Build local metaprobe first: cd "${libraryRoot}" && pnpm build:wasm`,
    { cause }
  );
}
const destination = resolve(appRoot, "src/static/metaprobe");
await import(pathToFileURL(resolve(appRoot, "../../../packages/uploader-uniapp/scripts/prepare-media.mjs")).href);
const uploaderAssets = resolve(appRoot, "src/static/uploader-uniapp");
await mkdir(uploaderAssets, { recursive: true });
for (const name of ["metaprobe.wasm", "arthash.wasm"]) {
  await copyFile(resolve(appRoot, "../../../packages/uploader-uniapp/src/generated", name), resolve(uploaderAssets, name));
}
await mkdir(destination, { recursive: true });
await copyFile(
  resolve(libraryRoot, "miniprogram/index_bg.wasm"),
  resolve(destination, "index_bg.wasm")
);
const { createFixtures } = await import(
  pathToFileURL(resolve(libraryRoot, "test/fixtures.mjs")).href
);
const fixtures = createFixtures().map(({ bytes, ...fixture }) => ({
  ...fixture,
  data: Array.from(bytes),
  sha256: createHash("sha256").update(bytes).digest("hex"),
}));
const logo = await readFile(resolve(libraryRoot, "assets/metaprobe-logo.png"));
await copyFile(
  resolve(libraryRoot, "assets/metaprobe-logo.png"),
  resolve(destination, "real-logo.png")
);
fixtures.push({
  expected: {
    format: "png",
    height: logo.readUInt32BE(20),
    kind: "image",
    width: logo.readUInt32BE(16),
  },
  name: "real-logo.png",
  path: "static/metaprobe/real-logo.png",
  sha256: createHash("sha256").update(logo).digest("hex"),
});
await writeFile(
  resolve(destination, "fixtures.json"),
  JSON.stringify(fixtures)
);
const { readImageContainer, replaceExif } = await import(pathToFileURL(resolve(appRoot, "../../../packages/uploader/dist/shared.mjs")).href);
const realJpeg = new Uint8Array(await readFile(resolve(appRoot, "src/static/metadata-fixture.jpg")));
const exifFixture = readImageContainer(new Uint8Array(fixtures[0].data));
await writeFile(resolve(uploaderAssets, "metadata-fixture.jpg"), replaceExif(readImageContainer(realJpeg), exifFixture.exif));
console.log(
  `Prepared local metaprobe WASM and ${fixtures.length} metadata fixtures.`
);
