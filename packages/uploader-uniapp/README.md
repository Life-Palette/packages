# @life-palette/uploader-uniapp

独立的 uni-app 文件上传包。无 `media`、浏览器压缩、EXIF 或图片分析依赖。文件选择、权限、读取和上传彼此独立。网络仅使用 `uni.request` / `uni.uploadFile`。

## 复用于其他系统：文件信息与分片

文件能力有独立的 `/file` 入口，不需要配置 API 地址、Token 或任何服务端协议：

```ts
import { getFileInfo, getChunkRanges, splitFile } from '@life-palette/uploader-uniapp/file'

const info = await getFileInfo({ path: '/tmp/photo.jpg', name: 'photo.jpg' }, { platform: 'mp' })
// { path, name, size, md5 }

// 仅计算分片范围，是纯函数，不读取文件：
const ranges = getChunkRanges(info.size, 5 * 1024 * 1024)
// [{ partNumber: 1, start: 0, end: ..., size: ... }, ...]

// 大小由你的系统决定，服务端协议由你自行编排：
const split = await splitFile('/tmp/photo.jpg', { platform: 'mp', chunkSize: 5 * 1024 * 1024 })
try {
  // split.name / size / totalParts；split.checksum() 可选，切分不会强制计算 MD5。
  for (const chunk of split.chunks) {
    const data = await chunk.read() // ArrayBuffer，仅当前片；end 为排他字节偏移
    await yourUploadPart({ partNumber: chunk.partNumber, size: chunk.size, data })
  }
} finally {
  await split.close() // 原生文件资源必须释放，重复 close 安全
}
```

默认只返回分片范围和按需读取的二进制数据。需要 `uni.uploadFile` 表单分片时，调用 `chunk.toFile()` 或 `uploadFormChunk(chunk, options)`，才生成临时文件。H5 创建 Blob URL；微信小程序通过原生 `writeFile` 写入沙盒。App Android/iOS 的 HTML5+ FileWriter 只声明字符串写入，表单分片需注入 `createTempFile(data)` 二进制文件适配器；现有 App PUT 分片不需要落盘。

```ts
import { splitFile, uploadFormChunk } from '@life-palette/uploader-uniapp'

const split = await splitFile('/tmp/file', { platform: 'mp', chunkSize: 5 * 1024 * 1024 })
try {
  for (const chunk of split.chunks) {
    const task = uploadFormChunk(chunk, {
      url: 'https://example.com/custom-chunks',
      formData: { partNumber: chunk.partNumber, totalParts: split.totalParts },
    })
    await task.result
  }
  // 业务自行完成其服务端合并流程。
} finally {
  await split.close()
}
```

`uploadFormChunk` 在成功、失败、取消时自动释放自己的临时文件。手动调用 `toFile()` 时，用 `finally` 调用返回值的 `dispose()`；`split.close()` 会回收剩余文件。必须等使用分片文件的上传结束再关闭 split。只删除本库创建的文件，绝不删除用户选择的原始路径。清理失败通过 `onCleanupError` 报告，不覆盖上传结果；进程被系统强制终止时无法保证执行清理。`tempDirectory` 可指定已存在的可写沙盒目录；默认使用微信 `USER_DATA_PATH`。

`getFileMetadata(input, config)` 只获取路径、名称、大小；`getFileInfo()` 同时获取 MD5。底层 `openUploadFile(file, config)` 返回 `name/size/checksum/read/close`，适合复用同一个读取器完成信息获取和上传。同一读取器共享正在计算的 MD5 并缓存成功结果；文件内容应保持不变，变更后重新打开。微信 stat、App HTML5+、H5 File 获取大小不强制计算 MD5；缺少 stat 的兼容运行时回退 getFileInfo，可能同时计算摘要。`close()` 可重复调用，会等待已发起的读取和摘要任务，关闭后拒绝新任务。`openFile` 配置可替换该读取器以支持额外平台。完整 `createUploader` 是针对统一会话协议的可选封装，并非使用文件工具的前提。

根入口导出全部公开 API，作为默认导入方式；`/file`、`/picker`、`/transport` 等子路径可选，用于按能力细分导入。原有 `/selection`、`/permissions`、`/form-upload` 子路径保留为兼容别名。

内部实现收敛为六个文件：`file.ts`、`picker.ts`、`transport.ts`、`uploader.ts`、`types.ts`、`index.ts`。函数仍可独立调用；文件合并不改变服务端协议或上传行为。

## 原生表单上传

服务器接收 `multipart/form-data POST` 时使用 `uni.uploadFile`。无需构造 `FormData`，也不要手动设置 Content-Type/boundary。

```ts
import { chooseImages, uploadFormFile } from '@life-palette/uploader-uniapp'

const files = await chooseImages({ sourceType: ['album'] })
const task = uploadFormFile(files[0]!, {
  url: 'https://api.example.com/files',
  name: 'file', // 服务端接收的表单字段名
  formData: { folder: 'photos' },
  headers: { Authorization: 'Bearer token' },
  onProgress: ({ percent, loaded, total }) => console.log(percent, loaded, total),
})
const response = await task.result // { statusCode, data: string }; 按业务协议自行解析
// task.abort() 可中断本次原生上传
```

支付宝的表单上传还需要 `fileType: 'image' | 'video' | 'audio'`。此表单工具不依赖文件读取/MD5，也不调用统一会话 API。

## 统一会话上传：直传 / 分片 / 秒传

```ts
import { chooseImages, createUploader } from '@life-palette/uploader-uniapp'

const uploader = createUploader({
  platform: 'mp', // 'h5' | 'mp' | 'app'，由应用条件编译显式选择
  apiBaseUrl: 'https://api.example.com/api/v1',
  getToken: () => token, // 纯 token，不包含 Bearer
  partConcurrency: 2,
  partRetries: 3, // 首次尝试之后的重试次数，0 禁用重试
})

const files = await chooseImages({ sourceType: ['album'] })
const results = await uploader.uploadFiles(files, {
  isPrivate: false,
  onProgress: ({ stage, percent }) => console.log(stage, percent),
})
// 单文件：uploader.upload({ path, name? }, options) 或 uploader.upload(path, options)
// 已知摘要：options.checksum 跳过摘要计算。
// 废弃服务器会话：await uploader.abort(uploadId)
```

协议：

1. `POST /uploads`：`{ checksum, file_name, size }`，返回 `{ data: UploadSession }`。
2. `existing_file` 命中直接返回；否则根据服务端 `mode` 执行上传。
3. `direct` 使用返回的 `upload.url/headers`；`multipart` 使用 `part_size` 和每片的 `parts[].url/headers`。全部为原始二进制 PUT。
4. 保留 `uploaded_parts`，只读取及上传未完成片；验证分片覆盖完整、编号和 ETag，按片号排序。
5. `POST /uploads/{id}/complete`：`{ is_private, parts }`，返回 `{ data: UploadedFile }`。不附带媒体元数据。

`uni.uploadFile` 固定发送 POST 表单，不能替代预签名 PUT。统一协议使用 `uni.request({ method: 'PUT', data: ArrayBuffer })`，不会构造 FormData。API 鉴权仅附加到会话请求，存储请求只使用预签名 headers。服务端决定分片阈值与片大小。

普通失败保留服务器会话供下次初始化续传。`abort(id)` 仍只废弃服务器会话；`uploader.start(file, options)` 返回 `{ result, cancel }`，`cancel()` 会中断当前原生请求、取消退避等待、停止后续分片，并尝试 DELETE 已知会话。也可向 `upload` / `uploadFiles` / 表单工具传入共享的 `UploadCancellation`。无需浏览器 AbortController。取消不能撤销服务端已经完成的操作；初始化请求被取消时，如果尚未取得会话 ID，则无法主动删除该会话。

```ts
const task = uploader.start(file, { onProgress })
// 用户点击取消：task.cancel()
try {
  const uploaded = await task.result
} catch (error) {
  if (error instanceof UploadCancelledError) { /* 显示已取消 */ }
}
```

原生 MD5、文件打开和读取不能强行中断；取消会在当前操作完成后阻止后续上传，并等待资源安全释放。分片失败会停止新任务，并等待已运行任务结束后关闭文件。关闭错误通过 `onCleanupError` 回调报告，不把已经成功的上传变成失败。直接调用底层 reader.close() / temporary.dispose() 则仍返回清理错误，便于业务自行处理。

直传 PUT 与分片 PUT 仅重试网络故障、HTTP 429、5xx；鉴权/参数/文件大小错误和缺少 ETag 不重试。`partRetries` 同时控制这两类 PUT 的重试次数，默认 3 次，指数退避上限 30 秒；重试复用当前片数据。初始化、完成、DELETE 和普通表单 POST 不自动重试，避免不明确的重复副作用。

## 平台与文件读取

| 运行环境 | MD5 | 文件读取 |
| --- | --- | --- |
| H5 | 按 2 MiB 增量计算 SparkMD5 | 优先使用 chooseImage 返回的原始 File；仅路径时通过 uni.request 获取 ArrayBuffer |
| 微信小程序 | FileSystemManager.getFileInfo 原生摘要 | 原生 open/read/close 按 position/length 读取当前分片 |
| App Android/iOS | uni.getFileInfo 原生摘要 | HTML5+ File.slice + FileReader + uni.base64ToArrayBuffer |

没有原生摘要时才回退增量 JS MD5。App 的 ArrayBuffer 请求要求 3.3.7+。微信小程序需要文件系统 open/read/close 的基础库支持。其他小程序/鸿蒙未做设备验证，能力缺失会明确报错；可通过 `openFile(file)` 注入返回 `FileReaderAdapter` 的平台适配器，不假设所有平台具有相同 API。

分片内存约为并发数 × 分片大小，App 原生 Base64 桥接有额外编码开销；普通 PUT 会读取整个文件，建议服务端为大文件返回 multipart。H5 仅路径读取也会缓存整文件，建议保留 `chooseImages()` 返回的 `sourceFile`。

进度按阶段报告；PUT 分片进度在片完成时按字节更新，包含已续传的字节，不是原生网络实时进度。表单上传提供 `onProgressUpdate` 对应的实时进度。批量文件顺序上传，进度回调对应当前文件。

## 选择与权限

```ts
import { chooseImages, ensurePermission, openPermissionSettings } from '@life-palette/uploader-uniapp'

const files = await chooseImages({
  sourceType: ['camera'],
  // 按目标平台和业务设置前置检查，不自动申请无关 scope。
  beforeChoose: async () => {
    await ensurePermission('camera', { platform: 'app' })
  },
})
// 用户点击“打开设置”按钮时：
await openPermissionSettings({ platform: 'app' })
```

- 默认 `sizeType: ['original']`，保留源文件名，不进行自动压缩。
- 拍照、相册选择会由原生选择器处理必要权限和隐私提示；相册选图不等于保存相册，不能强制请求 `scope.writePhotosAlbum`。
- 小程序权限工具接收具体 `scope.xxx`，查询 getSetting，未申请时调用 authorize，拒绝时抛出 `PermissionError`。
- App 接收 `camera` / `album`，使用 getAppAuthorizeSetting 查询；未申请时由选择器触发系统提示。
- H5 检查返回 `unsupported`，浏览器/选择器负责授权。工具不会将 unsupported 误报为 authorized。
- H5 选择器必须在用户点击触发的同步调用栈中打开，因此 `beforeChoose` 仅在 App/小程序执行；H5 由浏览器选择器处理授权。
- 用户取消选择抛出 `SelectionCancelledError`，不应作为上传故障展示。
- 打开权限设置始终是单独调用，不隐式弹窗。

## 开发

```bash
pnpm --filter @life-palette/uploader-uniapp test
pnpm --filter @life-palette/uploader-uniapp typecheck
pnpm --filter @life-palette/uploader-uniapp build
pnpm play:uniapp
pnpm play:uniapp:weixin
```

uni-app playground 来自官方 `pnpm dlx degit dcloudio/uni-preset-vue#vite-ts`，位于 `apps/playground/uniapp`。Web 演示位于同级 `web`。

小程序需要配置 API 和存储请求域名白名单、填写 AppID；H5 存储 CORS 需允许 PUT 和预签名 headers，并暴露 ETag。原生设备/开发者工具联调需使用设备能访问的 API 地址。App 还需在 manifest 中声明相机模块、系统权限和 iOS 隐私用途。

官方资料：[CLI 模板](https://uniapp.dcloud.net.cn/quickstart-cli.html)、[uni.uploadFile](https://uniapp.dcloud.net.cn/api/request/network-file.html)、[uni.request](https://uniapp.dcloud.net.cn/api/request/request.html)、[文件信息](https://uniapp.dcloud.net.cn/api/file/file.html#getfileinfo)、[HTML5+ 文件切片](https://www.html5plus.org/doc/zh_cn/io.html#plus.io.File.slice)、[App 授权状态](https://uniapp.dcloud.net.cn/api/system/getappauthorizesetting.html)。
