---
title: "发版流程"
---

本仓库使用 [changesets](https://github.com/changesets/changesets) 管理版本和发布。

## 添加变更记录

```bash
pnpm changeset
```

交互式选择：
- 受影响的包（`@life-palette/utils` / `media` / `uploader`）
- 版本 bump 类型（`patch` / `minor` / `major`）
- 变更描述

## 提交并推送

```bash
git add .
git commit -m "feat: ..."
git push
```

## 自动发版

推送到 `main` 后，CI 会自动：

- 检测未消费的 changeset → 创建 Release PR
- 合并 Release PR → 自动 publish 到 npm

## 手动发版

```bash
pnpm changeset       # 记录变更
pnpm version         # bump 版本 + 生成 CHANGELOG
pnpm release         # build + publish
git push --follow-tags
```

## 版本号规则

遵循 [Semantic Versioning](https://semver.org/)：

| 类型 | 说明 | 示例 |
| --- | --- | --- |
| `patch` | 向下兼容的修复 | 0.0.4 → 0.0.5 |
| `minor` | 向下兼容的新功能 | 0.0.4 → 0.1.0 |
| `major` | 不兼容的 API 变更 | 0.0.4 → 1.0.0 |
