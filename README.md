# Life Palette Packages

[![CI](https://github.com/Life-Palette/packages/actions/workflows/ci.yml/badge.svg)](https://github.com/Life-Palette/packages/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-online-blue)](https://life-palette-packages.netlify.app/)

拾色 (Life Palette) 的工具包集合，monorepo 管理。

📖 **文档地址**：https://life-palette-packages.netlify.app/

## Packages

| 包 | 描述 |
| --- | --- |
| [@life-palette/utils](./packages/utils) | 纯函数工具集，零运行时依赖 |
| [@life-palette/media](./packages/media) | 浏览器端媒体分析 |
| [@life-palette/uploader](./packages/uploader) | Web OSS 上传器（并发分片 + 重试） |
| [@life-palette/uploader-uniapp](./packages/uploader-uniapp) | uni-app 原生表单上传、预签名直传与分片上传 |

## 开发

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 启动 Web playground
pnpm play:web

# 启动 uni-app H5 / 微信小程序 playground
pnpm play:uniapp
pnpm play:uniapp:weixin

# 启动文档站
pnpm docs:dev
```

## 发版

本项目使用 [changesets](https://github.com/changesets/changesets) 管理版本和发布。

```bash
pnpm changeset       # 记录变更
pnpm version         # bump 版本 + 生成 CHANGELOG
pnpm release         # build + publish
```

推送到 `main` 分支后，CI 会自动创建 Release PR 或发布到 npm。

## 项目结构

```
apps/
├── playground/
│   ├── web/      # 原 Web 演示应用
│   └── uniapp/   # DCloud 官方 Vue 3 + Vite + TS CLI 模板
└── docs/         # Astro Starlight 文档站
packages/
├── utils/        # @life-palette/utils 纯函数
├── media/        # @life-palette/media 媒体分析
├── uploader/     # @life-palette/uploader Web OSS 上传
└── uploader-uniapp/ # @life-palette/uploader-uniapp
```

## License

[MIT](https://github.com/Life-Palette/packages/blob/main/LICENSE) License © [Life-Palette](https://github.com/Life-Palette)
