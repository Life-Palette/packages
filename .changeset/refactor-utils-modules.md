---
"@life-palette/utils": minor
---

重构 utils 包：从 go-shadcn-admin、LifePalette-Web、lp-weapp 提取公共方法

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
