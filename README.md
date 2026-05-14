# Life Palette Packages

[![CI](https://github.com/Life-Palette/packages/actions/workflows/ci.yml/badge.svg)](https://github.com/Life-Palette/packages/actions/workflows/ci.yml)

Life Palette 生态的工具包集合，采用 monorepo 架构管理。

## Packages

| 包名 | 版本 | 描述 |
| --- | --- | --- |
| [@life-palette/utils](./packages/utils) | [![npm](https://img.shields.io/npm/v/@life-palette/utils?color=yellow)](https://npmjs.com/package/@life-palette/utils) | 文件处理、文件选择等实用工具库 |

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

# 运行 playground
pnpm play

# 运行文档站点
pnpm docs:dev
```

## 发版

本项目使用 [changesets](https://github.com/changesets/changesets) 管理版本和发布。

```bash
# 添加变更记录
pnpm changeset

# 更新版本号和 changelog
pnpm version

# 构建并发布
pnpm release
```

推送到 main 分支后，CI 会自动创建 Release PR 或发布到 npm。

## 项目结构

```
packages/
├── packages/utils/     # @life-palette/utils 核心工具库
├── playground/         # Vite + Vue 3 演示应用
├── docs/               # VitePress 文档站点
└── scripts/            # 构建脚本
```

## License

[MIT](https://github.com/Life-Palette/packages/blob/main/LICENSE) License © [Life-Palette](https://github.com/Life-Palette)
