# UniApp 本地验证

## metaprobe 微信小程序

默认使用相邻的 `../../../../metaprobe` 仓库构建产物，不安装 registry 版本。
Vite 的 `METAPROBE_DIR` 环境变量可覆盖源码路径；TypeScript 的路径映射默认对应相邻仓库。

1. 在 `metaprobe` 仓库运行 `pnpm build:wasm`、`pnpm test:miniprogram`。
2. 在本目录运行 `pnpm build:mp-weixin`。构建前自动复制本地 WASM 和测试数据到 `src/static/metaprobe/`，这些产物不纳入 Git。
3. 微信开发者工具导入 `dist/build/mp-weixin`。从首页进入「metaprobe 小程序验证」，点击「运行内置验证」。
4. 可使用「选择聊天文件解析」验证自己的图片或视频，解析过程不上传文件。

自动化使用 Node.js 22+ 自带的 WebSocket，先启动微信开发者工具自动化接口：

```powershell
# cli.bat 为本机微信开发者工具的 CLI 路径
& '你的微信开发者工具路径\cli.bat' auto --project "$PWD\dist\build\mp-weixin" --auto-port 9420 --trust-project
pnpm test:metaprobe
```

可通过 `WECHAT_AUTOMATION_ENDPOINT` 覆盖默认的 `ws://127.0.0.1:9420`。
结果写入 `dist/metaprobe-validation/report.json`；截图 API 可用时同时保存截图。
重新构建后若模拟器仍运行旧 JS，请关闭并重新打开这个测试项目，再执行验证。

当前模拟器验证：基础库 3.17.3，30 项通过。覆盖 JPEG/PNG/MP4 元数据、中文和 emoji
文件名、EXIF、SHA-256、视频原始大小与码率、批量错误隔离、无效文件，以及真实 PNG 文件读取。
JPEG/MP4 使用已知字段的合成元数据容器；真实 PNG 来自 metaprobe 仓库 Logo。
这不是 Android/iOS 真机或大视频压力测试，也不包含上传后端验证。

文件解析复用上传库的读取器，每次读取 1 MiB，避免开发者工具整文件二进制返回时
在 `coverRes` / `atob` 中报错并丢失回调。页面显示读取进度，完成或失败后恢复按钮。
自动化另生成一个 8 MiB 元数据测试文件，调用选中文件后使用的同一解析方法，验证完成后清理。
`METAPROBE_TEST_FILE` 可指定模拟器中已选中的临时文件路径以替代生成文件；该文件不会被修改或删除。
