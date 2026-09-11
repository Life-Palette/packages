---
title: "快速开始"
---

## 安装

按需引入。三个包之间没有强制依赖顺序：

```bash
pnpm add @life-palette/utils @life-palette/media @life-palette/uploader
```

## 用法

```ts
import {
  createOssUploader,
  detectLivePhotoPairs,
  fileParse,
  formatRelativeTime,
  getPageNumbers,
  selectFile,
  sleep,
  stripMarkdown,
} from "@life-palette/utils";
import { analyzeMedia, hashBlob } from "@life-palette/media";
```

```ts
// 文件选择
const files = await selectFile({ accept: "image/*", multiple: true });

// 日期
formatRelativeTime("2024-01-10T10:00:00Z"); // "2小时前"

// Markdown → 纯文本
stripMarkdown("# Hello **world**"); // "Hello world"

// 分页
getPageNumbers(5, 10); // [1, '...', 4, 5, 6, '...', 10]

// OSS 上传
const uploader = createOssUploader({
  apiBaseUrl: "https://api.example.com/api/v1",
  getToken: () => localStorage.getItem("token"),
  partConcurrency: 4, // 默认 4 片并发
  partRetries: 3, // 默认每片重试 3 次
});

const result = await uploader.upload(rawFile, {
  compress: true,
  onProgress: ({ stage, percent }) => console.log(stage, percent),
});
```

## 本地开发

```bash
git clone https://github.com/Life-Palette/packages.git
cd packages
pnpm install
pnpm dev           # 并行启动所有包的 dev script
pnpm play          # 只启动 playground（Vite + Vue）
pnpm docs:dev      # 只启动文档站（Astro Starlight）
```
