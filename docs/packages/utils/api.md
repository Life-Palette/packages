# API 文档

## async

### sleep

```ts
function sleep(ms?: number): Promise<void>;
```

等待指定毫秒数，默认 1000ms。

### debounce

```ts
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void;
```

### throttle

```ts
function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void;
```

---

## browser

### selectFile

```ts
function selectFile(options?: FileSelectOptions): Promise<FileList | null>;

interface FileSelectOptions {
  accept?: string;
  multiple?: boolean;
  capture?: boolean | string;
  onChange?: (files: FileList | null) => void;
  id?: string;
}
```

编程式触发文件选择对话框。仅浏览器环境可用。

### readFile

```ts
function readFile(
  file: File,
  readAs?: "dataURL" | "text" | "arrayBuffer" | "binaryString"
): Promise<string | ArrayBuffer | null>;
```

读取文件内容，默认以 DataURL 方式读取。

### preloadImage / preloadImages

```ts
function preloadImage(src: string): Promise<void>;
function preloadImages(srcs: string[]): Promise<void>;
```

### isSlowNetwork

```ts
function isSlowNetwork(): boolean;
```

检测是否为慢速网络（2G/3G 或下行 < 1Mbps）。

### getDeviceType

```ts
function getDeviceType(): "mobile" | "tablet" | "desktop";
```

### supportsWebP

```ts
function supportsWebP(): Promise<boolean>;
```

---

## date

### formatRelativeTime

```ts
function formatRelativeTime(dateString: string): string;
```

ISO 字符串 → 中文相对时间（"刚刚"、"3小时前"、"2天前"、"1周前"）。

### formatDistanceToNow

```ts
function formatDistanceToNow(date: Date): string;
```

Date 对象 → 中文相对时间，超过 7 天显示"X月X日"。

---

## markdown

### stripMarkdown

```ts
function stripMarkdown(content: string): string;
```

去除 Markdown 语法（标题、加粗、链接、代码块等），保留可读纯文本。

---

## media

### fileParse

```ts
function fileParse(data: FileData, options?: FileParseOptions): FileParseResult;

interface FileData {
  url?: string;
  type?: string;
  extension?: string;
  cover?: string;
  live_photo_video?: { url?: string; video_variants?: Array<{ quality?: string; url?: string }> };
  [key: string]: unknown;
}

interface FileParseOptions {
  format?: string;  // 默认 'jpg'
  resize?: number;  // 默认 400
}

interface FileParseResult extends FileData {
  fileType: "IMAGE" | "VIDEO";
  baseSrc: string;
  thumbnailUrl: string;
  cover: string;
  videoSrc: string;
}
```

解析文件数据，自动处理 HEIC 转格式、生成缩略图、视频封面、实况视频 URL。

### isVideo

```ts
function isVideo(file: { type?: string }): boolean;
```

### isLivePhoto

```ts
function isLivePhoto(file: { type?: string; videoSrc?: string | null }): boolean;
```

### getVideoThumbnailUrl

```ts
function getVideoThumbnailUrl(videoUrl: string): string;
```

生成 OSS 视频截帧 URL（1s 处，JPG 格式）。

### generateOssImageParams

```ts
function generateOssImageParams(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  quality?: number
): string;
```

生成 OSS 图片处理参数字符串（resize + quality + webp）。

### parseFileName

```ts
function parseFileName(fileName: string): {
  baseName: string;
  ext: string;
  isVideo: boolean;
};
```

### detectLivePhotoPairs

```ts
function detectLivePhotoPairs<T extends { name: string; type?: string }>(
  files: T[]
): Array<{ image: T; video: T }>;
```

检测文件列表中同名的 image + video 配对（Live Photo）。

---

## oss

### createOssUploader

```ts
function createOssUploader(config: UploaderConfig): {
  upload: (file: File, options?: UploadOptions) => Promise<OSSFile>;
  uploadBatch: (files: File[], options?: UploadOptions, maxRetries?: number) => Promise<OSSFile[]>;
  uploadToOSS: (file: File, options?: UploadOptions) => Promise<UploadToOSSResult>;
  associateLivePhotos: (results: OSSFile[]) => Promise<void>;
};

interface UploaderConfig {
  apiBaseUrl: string;
  getToken: () => string | null;
  chunkSize?: number;          // 默认 5MB
  multipartThreshold?: number; // 默认 5MB
}

interface UploadOptions {
  compress?: boolean;
  isPrivate?: boolean;
  location?: { lat: number; lng: number };
  maxSizeMB?: number;
  onProgress?: (progress: UploadProgress) => void;
}

interface UploadProgress {
  stage: "compress" | "md5" | "upload" | "complete";
  percent: number;
}
```

::: warning 依赖说明
使用 OSS 模块需要项目自行安装 `spark-md5` 和 `browser-image-compression`。
:::

---

## pagination

### getPageNumbers

```ts
function getPageNumbers(
  currentPage: number,
  totalPages: number
): Array<number | "...">;
```

生成带省略号的分页页码列表。

---

## url

### parseUrl

```ts
function parseUrl(fullPath: string): {
  name: string;
  path: string;
  query: Record<string, string>;
};
```

简易 URL 解析（支持带 query 的相对/绝对路径）。

### restoreUrl

```ts
function restoreUrl(path: string, query?: Record<string, unknown>): string;
```

把 query 对象拼回 path。

### isFastClick

```ts
function isFastClick(threshold?: number): boolean;
```

防止快速重复点击，默认阈值 1000ms。
