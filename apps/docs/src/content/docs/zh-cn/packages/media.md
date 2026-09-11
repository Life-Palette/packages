---
title: "@life-palette/media"
---

浏览器端媒体分析。包含主色提取、BlurHash、ArtHash、EXIF 解析和视频技术元数据（基于 mediainfo.js WASM）。

## API

### `analyzeMedia(file, options?)`

完整分析入口。返回 `MediaAnalysisResult`，包含 `basic`（MD5、尺寸、MIME）以及 `image` 或 `video` 子对象。

```ts
import { analyzeMedia } from "@life-palette/media";

const result = await analyzeMedia(file, {
  colorCount: 5,
  includeRawExif: false,
  analysisMaxDimension: 100,
  onProgress: ({ stage, percent }) => console.log(stage, percent),
});
```

阶段：`md5` → `decode` → `analyze`。

### `hashBlob(blob, onProgress?)`

独立的 MD5 计算。可以单独使用或在自定义 Worker 里复用。

```ts
import { hashBlob } from "@life-palette/media";

const md5 = await hashBlob(file, ({ percent }) =>
  console.log(`hash ${percent}%`)
);
```

### `loadMediaInfoVideoMetadata(file)`

读取视频的 mediainfo 元数据（需 mediainfo.js WASM）。`analyzeMedia` 在视频路径里会自动调用它。

### `mapMediaInfoResult(result)`

把 `MediaInfoResult`（mediainfo.js 原始输出）映射到 `VideoTechnicalMetadata`，方便纯函数化测试。

## 返回类型

```ts
interface MediaAnalysisResult {
  schema_version: 1;
  basic: {
    name: string;
    type: string;
    extension: string;
    size: number;
    md5: string;
    width?: number;
    height?: number;
  };
  image?: {
    blurhash?: string;
    arthash?: string;
    arthash_codec?: "rect-v64";
    colors: { hex: string; percentage: number; is_primary: boolean; rank: number }[];
    exif: ImageExif;
  };
  video?: VideoMediaAnalysis;
}
```

## 安装

```bash
pnpm add @life-palette/media
```

## 浏览器测试

本包使用 Vitest 的 browser mode 在真实 Chromium / Firefox / WebKit 中跑测试：

```bash
pnpm test:browser
```
