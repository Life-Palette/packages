import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const libraryRoot = fileURLToPath(
  new URL("../", import.meta.resolve("metaprobe/miniprogram"))
);
const destination = resolve(appRoot, "src/static/metaprobe");
await import(
  pathToFileURL(
    resolve(
      appRoot,
      "../../../packages/uploader-uniapp/scripts/prepare-media.mjs"
    )
  ).href
);
const uploaderAssets = resolve(appRoot, "src/static/uploader-uniapp");
await mkdir(uploaderAssets, { recursive: true });
for (const name of ["metaprobe.wasm", "arthash.wasm"]) {
  await copyFile(
    resolve(appRoot, "../../../packages/uploader-uniapp/src/generated", name),
    resolve(uploaderAssets, name)
  );
}
await mkdir(destination, { recursive: true });
await copyFile(
  resolve(libraryRoot, "miniprogram/index_bg.wasm"),
  resolve(destination, "index_bg.wasm")
);
const { createFixtures } = await import(
  new URL("./fixtures.mjs", import.meta.url).href
);
const fixtures = createFixtures().map(({ bytes, ...fixture }) => ({
  ...fixture,
  data: Array.from(bytes),
  sha256: createHash("sha256").update(bytes).digest("hex"),
}));
const photoPath = resolve(appRoot, "src/static/metadata-fixture.jpg");
const photo = await readFile(photoPath);
await copyFile(photoPath, resolve(destination, "real-photo.jpg"));
fixtures.push({
  expected: { format: "jpeg", kind: "image" },
  name: "real-photo.jpg",
  path: "static/metaprobe/real-photo.jpg",
  sha256: createHash("sha256").update(photo).digest("hex"),
});
await writeFile(
  resolve(destination, "fixtures.json"),
  JSON.stringify(fixtures)
);
const { readImageContainer, replaceExif } = await import(
  pathToFileURL(resolve(appRoot, "../../../packages/uploader/dist/shared.mjs"))
    .href
);
const realJpeg = new Uint8Array(
  await readFile(resolve(appRoot, "src/static/metadata-fixture.jpg"))
);
const exifFixture = readImageContainer(new Uint8Array(fixtures[0].data));
await writeFile(
  resolve(uploaderAssets, "metadata-fixture.jpg"),
  replaceExif(readImageContainer(realJpeg), exifFixture.exif)
);
console.log(
  `Prepared published metaprobe WASM and ${fixtures.length} metadata fixtures.`
);
