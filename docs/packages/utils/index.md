# @life-palette/utils

[![npm version](https://img.shields.io/npm/v/@life-palette/utils?color=yellow)](https://npmjs.com/package/@life-palette/utils)
[![npm downloads](https://img.shields.io/npm/dm/@life-palette/utils?color=yellow)](https://npm.chart.dev/@life-palette/utils)

文件处理、文件选择等实用工具库。

## 功能

- **文件选择** — 编程式触发文件选择对话框
- **文件读取** — 支持 DataURL、Text、ArrayBuffer 等多种方式
- **图片处理** — iPhone/HEIC 格式转换、OSS 图片处理
- **TypeScript** — 完整类型定义

## 安装

```bash
pnpm add @life-palette/utils
```

## 快速上手

```typescript
import { selectFile, readFile } from "@life-palette/utils";

const files = await selectFile({
  accept: "image/*",
  multiple: true,
});

if (files && files[0]) {
  const content = await readFile(files[0], "dataURL");
  console.log(content);
}
```

## 在框架中使用

### Vue 3

```vue
<script setup lang="ts">
import { selectFile, readFile } from "@life-palette/utils";

const handleSelect = async () => {
  const files = await selectFile({ accept: "image/*" });
  if (files) {
    for (const file of files) {
      const preview = await readFile(file, "dataURL");
      console.log(preview);
    }
  }
};
</script>

<template>
  <button @click="handleSelect">选择文件</button>
</template>
```

### React

```tsx
import { selectFile, readFile } from "@life-palette/utils";

function FileUploader() {
  const handleClick = async () => {
    const files = await selectFile({ accept: "image/*" });
    if (files && files[0]) {
      const content = await readFile(files[0], "dataURL");
      // ...
    }
  };

  return <button onClick={handleClick}>选择文件</button>;
}
```

## 下一步

查看 [API 文档](./api) 了解完整接口。
