# @life-palette/uploader

Browser uploader for the Life Palette presigned upload contract. Direct and concurrent multipart uploads support resumable sessions, per-part retries, instant uploads by checksum, and cancellation.

## Install

```bash
pnpm add @life-palette/uploader @life-palette/media
```

## Usage

```ts
import { analyzeMedia } from "@life-palette/media";
import { compressImage, createOssUploader } from "@life-palette/uploader";

const uploader = createOssUploader({
  apiBaseUrl: "https://api.example.com/api/v1",
  getToken: () => localStorage.getItem("access_token"),
});

// Optional compression: always analyze the bytes that will actually be uploaded.
const processed = await compressImage(file, { maxSizeMB: 1 });
const metadata = await analyzeMedia(processed, { colorCount: 5 });
const result = await uploader.upload(processed, {
  checksum: metadata.basic.md5,
  metadata,
  isPrivate: false,
  onProgress: ({ stage, percent }) => console.log(stage, percent),
});
console.log(result.uid, result.url);
await uploader.abort(uploadId);
```

The upload sequence is `POST /uploads`, `PUT` to presigned URLs, and
`POST /uploads/{upload_id}/complete`. The API base URL includes `/api/v1`.
Initialization sends `file_name`, `size`, and `checksum`; completion sends
`parts`, `is_private`, and optional browser-produced `metadata`.
Server responses use the `data` envelope and files expose `uid`.

Use `compressImage(file, { maxSizeMB, onProgress })` before analysis for optional
JPEG, PNG and WebP compression. Formats are detected from the actual file bytes.
Original EXIF blocks (including GPS, camera tags, unknown tags and MakerNotes)
are restored byte-for-byte and verified after encoding. JPEG APP1/XMP blocks are
also retained. EXIF is removed only from the temporary decoder input to avoid
automatic rotation, then restored with the original orientation. Compression
keeps dimensions and format; unexpected changes fail rather than losing EXIF.
It preserves filenames, uses a worker when available, and retains the original
if the output including restored EXIF increases size.
The default target is 1 MB; it is a compression target rather than a guaranteed
maximum. Unsupported formats, animated PNG/WebP, GIF, HEIC, AVIF, embedded
motion photos and videos pass through unchanged. Other metadata types such as
PNG text chunks and ICC profiles are not covered by the EXIF guarantee. Failures are reported
instead of silently uploading an uncompressed image.

Analysis and compression are outside the transport API. If neither `checksum`
nor `metadata.basic.md5` is supplied, the media package is loaded lazily to hash
the original file. Progress stages are `md5`, `initializing`, `uploading`, and
`completing`, with stage-local percentages.

## API

| Export | Description |
| --- | --- |
| `createOssUploader(config)` | Returns `{ upload, abort }` |
| `compressImage`, `CompressionOptions` | Optional image compression before analysis |
| `UploadedFile`, `UploadOptions`, `UploadProgress`, `UploaderConfig`, `UploadSession`, `UploadPart` | Current contract types |
| `UploadError` | Error with optional HTTP status and details |
| `detectLivePhotoPairs` | Match image/video names; callers persist the relationship |
| File display helpers | `fileParse`, `isVideo`, `isLivePhoto`, `getVideoThumbnailUrl`, `generateOssImageParams`, `parseFileName` |
| `PromisePool`, `withRetry` | Concurrency and retry helpers |

`createUploaderV2`, legacy `/file/upload/*` requests, `uploadBatch`,
`uploadToOSS`, `associateLivePhotos`, legacy types, and in-uploader compression
options have been removed. No compatibility aliases are provided.

## Validation

```bash
pnpm test
pnpm test:browser
pnpm build
pnpm exec publint --strict
```

## License

MIT
