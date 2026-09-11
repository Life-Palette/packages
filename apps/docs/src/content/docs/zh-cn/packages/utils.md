---
title: "@life-palette/utils"
---

零运行时依赖的纯函数工具集。可在任何框架、任何 JS 运行时里跑。

## Modules

### `async`

| 函数 | 用途 |
| --- | --- |
| `sleep(ms?)` | 等待指定毫秒数 |
| `debounce(fn, wait)` | 防抖 |
| `throttle(fn, limit)` | 节流 |

### `date`

| 函数 | 用途 |
| --- | --- |
| `formatRelativeTime(dateString)` | ISO 字符串 → 中文相对时间 |
| `formatDistanceToNow(date)` | `Date` 对象 → 中文相对时间 |

### `url`

| 函数 | 用途 |
| --- | --- |
| `parseUrl(fullPath)` | 解析 path + query |
| `restoreUrl(path, query)` | 把 query 拼回 path |
| `isFastClick(threshold?)` | 全局防快速点击 |

### `pagination`

| 函数 | 用途 |
| --- | --- |
| `getPageNumbers(current, total)` | 带省略号的分页页码列表 |

### `markdown`

| 函数 | 用途 |
| --- | --- |
| `stripMarkdown(content)` | 去除 Markdown 语法，保留可读纯文本 |

### `browser`

| 函数 | 用途 |
| --- | --- |
| `selectFile(options?)` | 编程式触发文件选择对话框 |
| `readFile(file, as?)` | 通过 `FileReader` 读取文件内容 |
| `preloadImage(src)` / `preloadImages(srcs)` | 图片预加载 |
| `isSlowNetwork()` | 通过 `navigator.connection` 判定慢速网络 |
| `getDeviceType()` | 返回 `mobile` / `tablet` / `desktop` |
| `supportsWebP()` | 探测 WebP 支持 |

## 安装

```bash
pnpm add @life-palette/utils
```
