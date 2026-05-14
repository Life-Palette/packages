# @life-palette/utils

[![npm version](https://img.shields.io/npm/v/@life-palette/utils?color=yellow)](https://npmjs.com/package/@life-palette/utils)
[![npm downloads](https://img.shields.io/npm/dm/@life-palette/utils?color=yellow)](https://npm.chart.dev/@life-palette/utils)
[![License](https://img.shields.io/npm/l/@life-palette/utils)](https://github.com/Life-Palette/packages/blob/main/LICENSE)

一个实用的工具库，提供文件处理、文件选择等常用功能。

## 功能特性

- 📁 **文件选择** - 通过编程方式触发文件选择对话框
- 📄 **文件读取** - 支持多种文件读取方式（DataURL、Text、ArrayBuffer、BinaryString）
- 🖼️ **图片处理** - 支持 iPhone/HEIC 图片格式转换和处理
- 🎬 **视频处理** - 自动生成视频封面
- 🎯 **TypeScript** - 完整的类型定义支持
- 🌐 **环境检测** - 自动检测浏览器环境，避免 SSR 错误

## 安装

```bash
npm install @life-palette/utils
```

```bash
pnpm add @life-palette/utils
```

```bash
yarn add @life-palette/utils
```

## 快速开始

### 文件选择

```typescript
import { selectFile } from "@life-palette/utils";

// 基础用法 - 选择图片
const files = await selectFile({
  accept: "image/*",
  multiple: true,
});

// 选择特定类型的文件
const pdfFiles = await selectFile({
  accept: ".pdf,.doc,.docx",
  multiple: false,
});

// 使用回调函数
selectFile({
  accept: "image/*",
  onChange: (files) => {
    console.log("选中的文件:", files);
  },
});

// 移动端使用相机拍照
const photo = await selectFile({
  accept: "image/*",
  capture: "environment", // 'user' 前置摄像头, 'environment' 后置摄像头
});
```

### 文件读取

```typescript
import { selectFile, readFile } from "@life-palette/utils";

// 选择并读取图片为 DataURL
const files = await selectFile({ accept: "image/*" });
if (files && files[0]) {
  const dataURL = await readFile(files[0], "dataURL");
  console.log(dataURL); // data:image/png;base64,iVBORw0K...
}

// 读取文本文件
const textFiles = await selectFile({ accept: ".txt" });
if (textFiles && textFiles[0]) {
  const text = await readFile(textFiles[0], "text");
  console.log(text);
}

// 读取为 ArrayBuffer
const file = files[0];
const buffer = await readFile(file, "arrayBuffer");
```

### 图片/视频处理

```typescript
import { fileParse, isIphoneImg } from "@life-palette/utils";

// 检查是否为 iPhone 拍摄的照片
const data = {
  url: "https://example.com/photo.heic",
  exif: '{"Make":{"value":"Apple"}}',
};
const isFromIphone = isIphoneImg(data); // true

// 处理文件（自动转换 HEIC 格式，生成缩略图）
const fileData = {
  url: "https://example.com/photo.heic",
  type: "image/heic",
  fromIphone: true,
};

const parsed = fileParse(fileData, {
  format: "jpg", // 转换格式
  resize: 400, // 缩略图尺寸
});

console.log(parsed);
// {
//   ...fileData,
//   baseSrc: "https://example.com/photo.heic?x-oss-process=image/format,jpg",
//   thumbnailUrl: "https://example.com/photo.heic?x-oss-process=image/resize,l_800/format,jpg",
//   fileType: "IMAGE"
// }

// 视频处理 - 自动生成封面
const videoData = {
  url: "https://example.com/video.mp4",
  type: "video/mp4",
};

const parsedVideo = fileParse(videoData, { format: "jpg" });
console.log(parsedVideo.cover);
// "https://example.com/video.mp4?x-oss-process=video/snapshot,t_7000,f_jpg,w_0,h_0,m_fast"
```

## API 文档

### selectFile(options?)

触发文件选择器。

**参数：**

```typescript
interface FileSelectOptions {
  /** 接受的文件类型，如 'image/*', '.jpg,.png' 等 */
  accept?: string;
  /** 是否允许多选，默认 false */
  multiple?: boolean;
  /** 是否捕获（用于移动设备），'user' | 'environment' | boolean */
  capture?: boolean | string;
  /** 选择文件后的回调函数 */
  onChange?: (files: FileList | null) => void;
  /** 文件选择器的 ID */
  id?: string;
}
```

**返回值：** `Promise<FileList | null>`

**异常：** 在非浏览器环境中会抛出错误

### readFile(file, readAs?)

读取文件内容。

**参数：**

- `file: File` - 要读取的文件对象
- `readAs?: 'dataURL' | 'text' | 'arrayBuffer' | 'binaryString'` - 读取方式，默认 `'dataURL'`

**返回值：** `Promise<string | ArrayBuffer | null>`

**异常：** 在非浏览器环境中会抛出错误

### fileParse(data, options?)

处理文件信息，自动处理 HEIC 格式转换和生成缩略图。

**参数：**

```typescript
interface FileData {
  url?: string;
  type?: string;
  cover?: string;
  fromIphone?: boolean;
  exif?: string;
  [key: string]: any;
}

interface ParseOptions {
  /** 转换格式，默认 'jpg' */
  format?: string;
  /** 缩略图尺寸，默认 400 */
  resize?: number;
}
```

**返回值：** `FileData & { fileType: string; baseSrc?: string; thumbnailUrl?: string; cover?: string }`

### isIphoneImg(data)

检查是否为 iPhone 拍摄的照片。

**参数：**

- `data: FileData` - 包含图片信息的数据对象

**返回值：** `boolean`

## 在线演示

访问 [在线文档](https://life-palette-utils.netlify.app) 查看完整示例。

或者运行本地演示：

```bash
# 克隆仓库
git clone https://github.com/Life-Palette/packages.git
cd life-palette-utils

# 安装依赖
pnpm install

# 运行 playground
pnpm play
```

## 环境要求

- **浏览器环境**：`selectFile` 和 `readFile` 仅在浏览器环境中可用
- **TypeScript**：建议使用 TypeScript 5.0+
- **现代浏览器**：支持 ES2015+ 的浏览器

## 常见问题

### 在 SSR 环境中使用

`selectFile` 和 `readFile` 会自动检测环境，在非浏览器环境中会返回被拒绝的 Promise：

```typescript
import { selectFile } from "@life-palette/utils";

// 在 Node.js 或 SSR 环境中
try {
  await selectFile();
} catch (error) {
  console.error(error.message);
  // "selectFile() can only be used in browser environment"
}
```

建议在客户端组件中使用：

```vue
<template>
  <button @click="handleSelectFile">选择文件</button>
</template>

<script setup lang="ts">
import { selectFile } from "@life-palette/utils";

const handleSelectFile = async () => {
  // 仅在客户端执行
  if (typeof window === "undefined") return;

  const files = await selectFile({ accept: "image/*" });
  console.log(files);
};
</script>
```

### 文件类型 MIME 类型

常用的 `accept` 值：

- 图片：`image/*` 或 `.jpg,.jpeg,.png,.gif,.webp`
- 视频：`video/*` 或 `.mp4,.avi,.mov`
- 文档：`.pdf,.doc,.docx,.txt`
- 所有文件：`*`

## 相关链接

- [完整文档](https://life-palette-utils.netlify.app)
- [GitHub 仓库](https://github.com/Life-Palette/packages)
- [更新日志](https://life-palette-utils.netlify.app/changelog.html)
- [问题反馈](https://github.com/Life-Palette/packages/issues)

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 运行测试
pnpm test

# 开发模式（监听测试）
pnpm dev
```

## License

[MIT](https://github.com/Life-Palette/packages/blob/main/LICENSE) License © 2025 [IceyWu](https://github.com/IceyWu)
