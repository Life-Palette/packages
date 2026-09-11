# @life-palette/uploader

OSS uploader for the Life Palette stack: image compression → media analysis → multipart upload (concurrent, retryable per part) → server-side completion → live-photo pairing. Browser-only, framework-agnostic.

## Highlights

- **Concurrent multipart upload** — `partConcurrency` parts in flight at once.
- **Per-part retry with backoff** — defaults to 3 attempts.
- **Resumable** — `init` returns `uploaded_part_etags` so retries only re-upload what's missing.
- **Live-photo pairing** — auto-associates `.jpg + .mov` pairs after a batch upload.
- **Pure factory** — no Vue/React/Svelte dependency.

## Install

```bash
pnpm add @life-palette/uploader @life-palette/media
```

## Usage

```ts
import { createOssUploader } from "@life-palette/uploader";

const uploader = createOssUploader({
  apiBaseUrl: "https://api.example.com/api/v1",
  getToken: () => localStorage.getItem("access_token"),
});

const file = await selectFile({ accept: "image/*,video/*" });
if (!file) return;

const result = await uploader.upload(file, {
  compress: true,
  onProgress: ({ stage, percent }) => console.log(stage, percent),
});
console.log(result.url);
```

## API surface

| Export | Description |
| --- | --- |
| `createOssUploader(config)` | Factory returning `{ upload, uploadBatch, uploadToOSS, associateLivePhotos }` |
| `fileParse`, `isVideo`, `isLivePhoto`, `getVideoThumbnailUrl`, `generateOssImageParams`, `parseFileName` | OSS URL/display helpers |
| `detectLivePhotoPairs` | Pair JPG+MOV files by base name |
| `PromisePool`, `withRetry` | Small async utilities |

## License

MIT
