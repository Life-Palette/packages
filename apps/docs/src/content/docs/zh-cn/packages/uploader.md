---
title: "@life-palette/uploader"
---

OSS 上传器：压缩 → 媒体分析 → 校验 → 并发分片（带单片重试）→ 完成 → 实况照片关联。

:::caution[OSS CORS]
分片 PUT 完成后从响应头读取 ETag。OSS bucket 必须配置
`Access-Control-Expose-Headers: ETag`，否则 ETag 会拿不到。
:::

## `createOssUploader(config)`

```ts
import { createOssUploader } from "@life-palette/uploader";

const uploader = createOssUploader({
  apiBaseUrl: "https://api.example.com/api/v1",
  getToken: () => localStorage.getItem("access_token"),

  // 可选
  chunkSize: 5 * 1024 * 1024,    // 分片大小，默认 5MB
  multipartThreshold: 5 * 1024 * 1024, // 超过该大小走分片，默认 5MB
  partConcurrency: 4,            // 分片并发数，默认 4
  partRetries: 3,                // 单片重试次数，默认 3
  completeEndpoint: "/file/upload/complete",
});
```

返回的对象：

```ts
{
  upload(file, options?): Promise<OSSFile>;
  uploadBatch(files, options?, concurrency?, maxRetries?): Promise<OSSFile[]>;
  uploadToOSS(file, options?): Promise<UploadToOSSResult>;
  associateLivePhotos(results): Promise<OSSFile[]>;
}
```

## `upload(file, options?)`

完整流程：

1. `compress`（可选）— `browser-image-compression`，仅图片。
2. `analyze`（默认开启）— 调用 `analyzeMedia`。
3. `init` — 调用 `/file/upload/init`。后端可以返回 `exists: true` 直接走秒传。
4. `upload` — `multipartThreshold` 以下走 FormData simple upload，否则走并发分片。
5. `complete` — 调 `/file/upload/complete` 提交 `metadata`。

```ts
const result = await uploader.upload(file, {
  compress: true,
  maxSizeMB: 1,
  isPrivate: false,
  location: { lat: 30.5, lng: 114.3 }, // 可选，覆盖 EXIF
  analyze: true,                       // 默认 true
  precomputedAnalysis: undefined,      // 复用已分析结果
  onProgress: ({ stage, percent }) => {
    console.log(stage, percent);
  },
});
```

## `uploadBatch(files, options?, concurrency?, maxRetries?)`

并发批量上传；上传完成后自动调用 `associateLivePhotos`，把同名 `.jpg + .mov` 关联起来。

```ts
const files = await selectFile({ accept: "image/*,video/*", multiple: true });
const results = await uploader.uploadBatch(files, { compress: true });
```

## URL / 文件处理工具

`fileParse(data, options?)` 把 OSS 后端返回的 `FileData` 转成展示用的 `FileParseResult`，处理：

- HEIC/HEIF → 后端强制转 `jpg`（默认）/ `webp`
- 原图、缩略图、实况视频 URL
- 视频封面（`x-oss-process=video/snapshot,...`）

```ts
import { fileParse, isVideo, isLivePhoto, parseFileName, detectLivePhotoPairs } from "@life-palette/uploader";

const view = fileParse({ url: "https://cdn/.../IMG_001.HEIC", type: "image/heic" });
console.log(view.baseSrc, view.thumbnailUrl);

const pairs = detectLivePhotoPairs(files);
```

## 安装

```bash
pnpm add @life-palette/uploader @life-palette/media
```

`browser-image-compression` 是可选 peer dependency —— 仅当你要用 `compress: true` 才需要装。
