# 快速开始

## 概览

Life Palette Packages 是一组服务于 Life Palette 生态的工具库，采用 monorepo 架构管理。

## 可用的包

| 包名 | 描述 |
| --- | --- |
| [@life-palette/utils](/packages/utils/) | OSS 上传、媒体处理、日期格式化、分页、Markdown 等公共工具 |

## 安装

::: code-group

```sh [pnpm]
pnpm add @life-palette/utils
```

```sh [npm]
npm install @life-palette/utils
```

```sh [yarn]
yarn add @life-palette/utils
```

:::

## 基础用法

```ts
import {
  createOssUploader,
  fileParse,
  formatRelativeTime,
  getPageNumbers,
  selectFile,
  sleep,
  stripMarkdown,
} from "@life-palette/utils";

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
  apiBaseUrl: "https://api.lpalette.cn/api/v1",
  getToken: () => localStorage.getItem("token"),
});
const result = await uploader.upload(rawFile, { compress: true });
```

## 本地开发

```bash
git clone https://github.com/Life-Palette/packages.git
cd packages
pnpm install
pnpm dev
```
