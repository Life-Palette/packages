# @life-palette/media

Browser-side media analysis: dominant colors, BlurHash, ArtHash, EXIF for images; technical metadata for videos (via mediainfo.js WASM). All work happens client-side, no upload required.

## Modules

- `hash` — `hashBlob(blob, onProgress?)` (MD5)
- `analyze` — `analyzeMedia(file, options)` (orchestrator)
- `video-metadata` — `loadMediaInfoVideoMetadata`, `mapMediaInfoResult`

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

## License

MIT
