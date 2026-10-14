# Playground

- `web/`：现有 Vue + Vite Web 媒体分析及上传演示，`pnpm play:web`。
- `uniapp/`：DCloud 官方 `uni-preset-vue#vite-ts` CLI 模板，演示原生文件选择、权限、统一会话直传/分片，以及 uni.uploadFile 表单上传。

```bash
pnpm play:uniapp # H5
pnpm play:uniapp:weixin # 微信小程序开发构建
pnpm --filter @life-palette/playground-uniapp build:h5
pnpm --filter @life-palette/playground-uniapp build:mp-weixin
```

小程序开发产物：`uniapp/dist/dev/mp-weixin`，用微信开发者工具打开。配置 `src/manifest.json` 的 AppID 和请求域名。App 运行与打包使用 HBuilderX，遵循官方 CLI 项目工作流。

输入可访问的 API 地址和 Token，选择文件后点击统一上传；服务端控制直传或分片。普通表单上传需另填支持 `multipart/form-data POST` 的服务端地址。Token 通过 uni 原生存储持久化，清空输入框即删除缓存。

uniapp demo 还提供统一 API 的文件列表、上传后刷新、二次确认删除与取消；Token 输入框不限制长度，以容纳完整 JWT。开发 API 默认地址为 `http://localhost:9530/api/v1`。

Token 存储键为 `life-palette.playground.uniapp.auth-token`，独立于 Web demo；使用 `uni.getStorageSync` / `uni.setStorageSync` / `uni.removeStorageSync`。
