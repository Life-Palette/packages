# @life-palette/utils

[![npm version](https://img.shields.io/npm/v/@life-palette/utils?color=yellow)](https://npmjs.com/package/@life-palette/utils)
[![npm downloads](https://img.shields.io/npm/dm/@life-palette/utils?color=yellow)](https://npm.chart.dev/@life-palette/utils)

Life Palette 公共工具库：OSS 上传、媒体处理、日期格式化、分页、Markdown 处理等。

## 功能

- **OSS 上传** — 秒传/普通/分片/批量上传，自动关联实况照片
- **媒体处理** — HEIC 转格式、缩略图、视频截帧、Live Photo 配对
- **文件选择** — 编程式触发文件选择对话框
- **日期格式化** — 中文相对时间（"3小时前"、"昨天"）
- **Markdown** — 去除语法保留纯文本
- **分页** — 带省略号的页码生成
- **异步工具** — sleep、debounce、throttle
- **TypeScript** — 完整类型定义

## 安装

```bash
pnpm add @life-palette/utils
```

## 快速上手

```ts
import {
  createOssUploader,
  fileParse,
  formatRelativeTime,
  getPageNumbers,
  selectFile,
  stripMarkdown,
} from "@life-palette/utils";

// 文件选择
const files = await selectFile({ accept: "image/*", multiple: true });

// 日期格式化
formatRelativeTime("2024-01-10T10:00:00Z"); // "2小时前"

// Markdown → 纯文本
stripMarkdown("# Hello **world**"); // "Hello world"

// 分页
getPageNumbers(5, 10); // [1, '...', 4, 5, 6, '...', 10]

// OSS 上传
const uploader = createOssUploader({
  apiBaseUrl: "https://api.lpalette.cn/api/v1",
  getToken: () => localStorage.getItem("token"),
});
const result = await uploader.upload(rawFile, { compress: true });
```

## 下一步

查看 [API 文档](./api) 了解完整接口。
