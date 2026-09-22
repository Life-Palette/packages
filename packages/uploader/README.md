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

## Go API unified upload contract (V2)

`createUploaderV2` is the provider-neutral client for the current Go API. It
uses `POST /api/v1/uploads`, provider-issued presigned `PUT` URLs, and
`POST /api/v1/uploads/{upload_id}/complete`. The legacy
`createOssUploader` API above remains unchanged.

```ts
import { createUploaderV2 } from "@life-palette/uploader";

const uploader = createUploaderV2({
  apiBaseUrl: "https://api.example.com/api/v1",
  getToken: () => localStorage.getItem("access_token"),
});

const result = await uploader.upload(file, {
  isPrivate: false,
  onProgress: ({ stage, percent }) => console.log(stage, percent),
});

// Cancel a resumable session when the user explicitly cancels it.
await uploader.abort(uploadId);
```

V2 supports direct uploads, multipart uploads, resumable sessions, instant
upload by MD5, per-part retries, and S3-compatible providers such as Amazon
S3, Alibaba Cloud OSS, and Cloudflare R2. Media analysis and image
compression are intentionally outside this API contract.

## API surface

| Export | Description |
| --- | --- |
| `createOssUploader(config)` | Factory returning `{ upload, uploadBatch, uploadToOSS, associateLivePhotos }` |
| `fileParse`, `isVideo`, `isLivePhoto`, `getVideoThumbnailUrl`, `generateOssImageParams`, `parseFileName` | OSS URL/display helpers |
| `detectLivePhotoPairs` | Pair JPG+MOV files by base name |
| `PromisePool`, `withRetry` | Small async utilities |

## License

MIT
