# @life-palette/media

Cross-platform media analysis: dominant colors, BlurHash, ArtHash, EXIF for images; technical metadata for videos (via mediainfo.js WASM). Analysis runs locally, no upload required.

## Modules

- `hash` — `hashBlob(blob, onProgress?)` (MD5)
- `analyze` — `analyzeMedia(file, options)` (orchestrator)
- `video-metadata` — `loadMediaInfoVideoMetadata`, `mapMediaInfoResult`
- `react-native` — `analyzeMediaUri(uri, filename, options)` for Expo / React Native local media URIs

## Install

```bash
pnpm add @life-palette/media
```

## Usage

```ts
import { analyzeMedia } from "@life-palette/media";

const result = await analyzeMedia(file, {
  colorCount: 5,
  includeRawExif: false,
  onProgress: ({ stage, percent }) => console.log(stage, percent),
});

console.log(result.image?.colors, result.image?.blurhash);
```

## React Native

The React Native entry uses `metaprobe`'s Expo native module to read media metadata and a downsampled RGBA image. BlurHash and dominant-color extraction use the same shared TypeScript implementation as the browser entry.

```ts
import { analyzeMediaUri } from "@life-palette/media/react-native";

const result = await analyzeMediaUri(asset.uri, asset.fileName ?? "photo.jpg");
console.log(result.image?.blurhash, result.image?.colors);
```

The app must include Expo Modules and install the native `metaprobe` module, then rebuild its native app after installing it. Video URIs return the extracted metadata without an `image` result.

## License

MIT
