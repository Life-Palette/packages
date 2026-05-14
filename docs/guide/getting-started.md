# 快速开始

## 概览

Life Palette Packages 是一组服务于 Life Palette 生态的工具库，采用 monorepo 架构管理。

## 可用的包

| 包名 | 描述 |
| --- | --- |
| [@life-palette/utils](/packages/utils/) | 文件处理、文件选择等实用工具库 |

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

```typescript
import { selectFile, readFile } from "@life-palette/utils";

// 选择文件
const files = await selectFile({
  accept: "image/*",
  multiple: true,
});

// 读取文件
if (files && files[0]) {
  const content = await readFile(files[0], "dataURL");
  console.log(content);
}
```

## 本地开发

```bash
git clone https://github.com/Life-Palette/packages.git
cd packages
pnpm install
pnpm dev
```
