# @life-palette/utils

[![npm version](https://img.shields.io/npm/v/@life-palette/utils?color=yellow)](https://npmjs.com/package/@life-palette/utils)
[![npm downloads](https://img.shields.io/npm/dm/@life-palette/utils?color=yellow)](https://npm.chart.dev/@life-palette/utils)
[![License](https://img.shields.io/npm/l/@life-palette/utils)](https://github.com/Life-Palette/packages/blob/main/LICENSE)

Life Palette 公共工具库：OSS 上传、媒体处理、日期格式化、分页、Markdown 处理等。

## 安装

```bash
pnpm add @life-palette/utils
```

## 模块概览

| 模块 | 导出 | 说明 |
|------|------|------|
| `async` | `sleep`, `debounce`, `throttle` | 异步与节流工具 |
| `browser` | `selectFile`, `readFile`, `preloadImage`, `preloadImages`, `isSlowNetwork`, `getDeviceType`, `supportsWebP` | 浏览器环境工具 |
| `date` | `formatRelativeTime`, `formatDistanceToNow` | 中文相对时间格式化 |
| `markdown` | `stripMarkdown` | 去除 Markdown 语法保留纯文本 |
| `media` | `fileParse`, `isVideo`, `isLivePhoto`, `getVideoThumbnailUrl`, `generateOssImageParams`, `parseFileName`, `detectLivePhotoPairs` | OSS 图片/视频 URL 处理、实况照片配对 |
| `oss` | `createOssUploader` | OSS 上传工厂（秒传/普通/分片/批量/实况关联） |
| `pagination` | `getPageNumbers` | 带省略号的分页页码生成 |
| `url` | `parseUrl`, `restoreUrl`, `isFastClick` | URL 解析与防快速点击 |

## 快速开始

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
```

## API

### async

```ts
// 等待指定毫秒
await sleep(1000);

// 防抖
const debouncedFn = debounce(() => console.log("hi"), 300);

// 节流
const throttledFn = throttle(() => console.log("hi"), 300);
```

### browser

```ts
// 触发文件选择器
const files = await selectFile({ accept: "image/*", multiple: true });

// 读取文件内容
const dataURL = await readFile(files[0], "dataURL");

// 预加载图片
await preloadImage("https://example.com/img.jpg");
await preloadImages(["url1", "url2"]);

// 网络/设备检测
isSlowNetwork();          // boolean
getDeviceType();          // 'mobile' | 'tablet' | 'desktop'
await supportsWebP();     // boolean
```

### date

```ts
formatRelativeTime("2024-01-10T10:00:00Z"); // "2小时前"
formatDistanceToNow(new Date(Date.now() - 5 * 60 * 1000)); // "5分钟前"
```

### markdown

```ts
stripMarkdown("# Hello **world**"); // "Hello world"
```

### media

```ts
// 解析文件 URL（自动处理 HEIC 转格式、生成缩略图、视频封面）
const result = fileParse(
  { url: "https://cdn.example.com/photo.heic", type: "image/heic", extension: ".heic" },
  { format: "jpg", resize: 400 }
);
// result.baseSrc, result.thumbnailUrl, result.fileType

// 判断文件类型
isVideo({ type: "video/mp4" });                    // true
isLivePhoto({ type: "image/jpeg", videoSrc: "..." }); // true

// 视频截帧
getVideoThumbnailUrl("https://cdn.example.com/v.mp4");

// OSS 图片参数
generateOssImageParams(1920, 1080, 400, 80);

// 解析文件名
parseFileName("IMG_001.mov"); // { baseName: "IMG_001", ext: "mov", isVideo: true }

// 检测 Live Photo 配对
detectLivePhotoPairs([
  { name: "IMG_001.jpg", type: "image/jpeg" },
  { name: "IMG_001.mov", type: "video/quicktime" },
]);
// [{ image: ..., video: ... }]
```

### oss

```ts
// 创建上传实例（需要项目自行安装 spark-md5 和 browser-image-compression）
const uploader = createOssUploader({
  apiBaseUrl: "https://api.lpalette.cn/api/v1",
  getToken: () => localStorage.getItem("token"),
});

// 单文件上传
const file = await uploader.upload(rawFile, {
  compress: true,
  isPrivate: false,
  location: { lat: 30.5, lng: 120.1 },
  onProgress: ({ stage, percent }) => console.log(stage, percent),
});

// 批量上传（自动关联实况照片）
const files = await uploader.uploadBatch(fileList, { compress: true });

// 仅上传到 OSS（不创建 DB 记录，用于替换场景）
const ossResult = await uploader.uploadToOSS(rawFile);
```

### pagination

```ts
getPageNumbers(5, 10); // [1, '...', 4, 5, 6, '...', 10]
getPageNumbers(1, 3);  // [1, 2, 3]
```

### url

```ts
parseUrl("/pages/home?id=123&name=test");
// { name: "home", path: "/pages/home", query: { id: "123", name: "test" } }

restoreUrl("/pages/home", { id: 1 }); // "/pages/home?id=1"

isFastClick(1000); // 防止 1s 内重复点击
```

## OSS 模块依赖说明

`createOssUploader` 内部通过动态 `import()` 按需加载 `spark-md5`（MD5 计算）和 `browser-image-compression`（图片压缩），使用 OSS 功能时需确保项目已安装：

```bash
pnpm add spark-md5 browser-image-compression
```

不使用 OSS 功能则无需安装。

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

## License

[MIT](https://github.com/Life-Palette/packages/blob/main/LICENSE) License © 2025 [IceyWu](https://github.com/IceyWu)
