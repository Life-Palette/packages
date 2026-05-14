# Changelog

## 0.1.0

### Minor Changes

- [`b31afab`](https://github.com/Life-Palette/packages/commit/b31afabb8f1d08930d0771ed68133ee1103a409f) Thanks [@IceyWu](https://github.com/IceyWu)! - 重构 utils 包：从 go-shadcn-admin、LifePalette-Web、lp-weapp 提取公共方法

  - 新增 `async` 模块：sleep、debounce、throttle
  - 新增 `browser` 模块：selectFile、readFile、preloadImage(s)、isSlowNetwork、getDeviceType、supportsWebP
  - 新增 `date` 模块：formatRelativeTime、formatDistanceToNow
  - 新增 `markdown` 模块：stripMarkdown
  - 新增 `media` 模块：fileParse、isVideo、isLivePhoto、getVideoThumbnailUrl、generateOssImageParams、parseFileName、detectLivePhotoPairs
  - 新增 `oss` 模块：createOssUploader（秒传/普通/分片/批量上传/实况照片关联）
  - 新增 `pagination` 模块：getPageNumbers
  - 新增 `url` 模块：parseUrl、restoreUrl、isFastClick
  - 移除旧 `file` 模块（功能已拆分到 browser/media）
  - 移除 `@iceywu/utils` 依赖

## v0.0.4

[compare changes](https://github.com/Life-Palette/packages/compare/v0.0.3...v0.0.4)

### 🚀 Enhancements

- Add pnpm workspace configuration and pre-release scripts ([2309b03](https://github.com/Life-Palette/packages/commit/2309b03))
- [utils] 增加浏览器环境检查，防止在非浏览器环境中调用 selectFile 和 readFile 函数 ([7653fa4](https://github.com/Life-Palette/packages/commit/7653fa4))

### 🩹 Fixes

- Lint ([73b8505](https://github.com/Life-Palette/packages/commit/73b8505))

### 📖 Documentation

- 更新文档链接为正式地址 ([f1f7b4b](https://github.com/Life-Palette/packages/commit/f1f7b4b))

### ❤️ Contributors

- IceyWu ([@Life-Palette](https://github.com/Life-Palette))

## v0.0.3

[compare changes](https://github.com/Life-Palette/packages/compare/v0.0.2...v0.0.3)

### 🚀 Enhancements

- 增加 type 导出 ([444a3e9](https://github.com/Life-Palette/packages/commit/444a3e9))

### 🏡 Chore

- Update README.md ([99e28b3](https://github.com/Life-Palette/packages/commit/99e28b3))

### ❤️ Contributors

- IceyWu ([@Life-Palette](http://github.com/Life-Palette))

## v0.0.2

[compare changes](https://github.com/Life-Palette/packages/compare/v0.0.1...v0.0.2)

### 🩹 Fixes

- 调整图片解析逻辑 ([8e06091](https://github.com/Life-Palette/packages/commit/8e06091))

### ❤️ Contributors

- IceyWu ([@Life-Palette](http://github.com/Life-Palette))

## v0.0.1

### 🚀 Enhancements

- 初始化项目结构，添加基本配置文件和示例代码 ([ce11d66](https://github.com/Life-Palette/packages/commit/ce11d66))

### 🩹 Fixes

- 修复代码格式，更新 README 以支持 Deno ([cd59a4e](https://github.com/Life-Palette/packages/commit/cd59a4e))

### ❤️ Contributors

- IceyWu ([@Life-Palette](http://github.com/Life-Palette))
