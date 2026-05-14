# API 文档

## selectFile

通过编程方式触发文件选择对话框。

### 类型签名

```typescript
function selectFile(options?: FileSelectOptions): Promise<FileList | null>;

interface FileSelectOptions {
  accept?: string;
  multiple?: boolean;
  capture?: boolean | string;
  onChange?: (files: FileList | null) => void;
  id?: string;
}
```

### 参数

- `accept` - 接受的文件类型，如 `'image/*'`, `'.jpg,.png'`
- `multiple` - 是否允许多选，默认 `false`
- `capture` - 移动设备摄像头捕获模式
- `onChange` - 文件选择后的回调函数
- `id` - 文件选择器的 ID，默认自动生成

### 示例

```typescript
// 选择单张图片
const files = await selectFile({
  accept: "image/*",
  multiple: false,
});

// 选择多个文档
const files = await selectFile({
  accept: ".pdf,.doc,.docx",
  multiple: true,
  onChange: (files) => {
    console.log("已选择:", files);
  },
});
```

## readFile

读取文件内容。

### 类型签名

```typescript
function readFile(
  file: File,
  readAs?: "dataURL" | "text" | "arrayBuffer" | "binaryString",
): Promise<string | ArrayBuffer | null>;
```

### 参数

- `file` - 要读取的文件对象
- `readAs` - 读取方式，默认 `'dataURL'`
  - `'dataURL'` - 读取为 Data URL（适合图片预览）
  - `'text'` - 读取为文本
  - `'arrayBuffer'` - 读取为 ArrayBuffer
  - `'binaryString'` - 读取为二进制字符串

### 示例

```typescript
const files = await selectFile({ accept: "image/*" });
if (files && files[0]) {
  // 读取为 Data URL
  const dataUrl = await readFile(files[0], "dataURL");

  // 读取为文本
  const text = await readFile(files[0], "text");

  // 读取为 ArrayBuffer
  const buffer = await readFile(files[0], "arrayBuffer");
}
```

## fileParse

处理文件信息，特别是针对 OSS 存储的图片和视频。

### 类型签名

```typescript
function fileParse(data: FileData, options?: ParseOptions): FileData;

interface FileData {
  url?: string;
  type?: string;
  videoSrc?: string | null;
  cover?: string;
  fromIphone?: boolean;
  exif?: string;
  [key: string]: any;
}

interface ParseOptions {
  format?: string;
  resize?: number;
}
```

### 参数

- `data` - 文件数据对象
  - `url` - 文件 URL
  - `type` - 文件类型
  - `exif` - EXIF 信息（JSON 字符串）
  - `fromIphone` - 是否来自 iPhone
- `options` - 处理选项
  - `format` - 目标格式，默认 `'jpg'`
  - `resize` - 缩略图尺寸，默认 `400`

### 返回值

返回处理后的文件数据，包含：

- `baseSrc` - 基础图片 URL（图片类型）
- `thumbnailUrl` - 缩略图 URL（图片类型）
- `cover` - 封面图 URL（视频类型）
- `fileType` - 文件类型（`'IMAGE'` 或 `'VIDEO'`）

### 示例

```typescript
const fileInfo = fileParse(
  {
    url: "https://example.com/image.heic",
    type: "image/heic",
    fromIphone: true,
  },
  {
    format: "jpg",
    resize: 400,
  },
);

console.log(fileInfo.baseSrc); // 转换后的 JPG URL
console.log(fileInfo.thumbnailUrl); // 缩略图 URL
```

## isIphoneImg

检查是否为 iPhone 拍摄的图片。

### 类型签名

```typescript
function isIphoneImg(data: FileData): boolean;
```

### 参数

- `data` - 文件数据对象，需包含 `exif` 字段

### 返回值

如果是 iPhone 拍摄的图片返回 `true`，否则返回 `false`。

### 示例

```typescript
const isFromIphone = isIphoneImg({
  exif: '{"Make":{"value":"Apple"}}',
});

if (isFromIphone) {
  console.log("这是 iPhone 拍摄的图片");
}
```

## 类型定义

### ExifData

```typescript
interface ExifData {
  Make?: {
    value: string;
  };
}
```

### FileSelectOptions

```typescript
interface FileSelectOptions {
  accept?: string;
  multiple?: boolean;
  capture?: boolean | string;
  onChange?: (files: FileList | null) => void;
  id?: string;
}
```

### FileData

```typescript
interface FileData {
  url?: string;
  type?: string;
  videoSrc?: string | null;
  cover?: string;
  fromIphone?: boolean;
  exif?: string;
  [key: string]: any;
}
```

### ParseOptions

```typescript
interface ParseOptions {
  format?: string;
  resize?: number;
}
```
