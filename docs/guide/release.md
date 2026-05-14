# 发版说明

## 快速发版

```bash
# 1. 提交你的更改（遵循 Conventional Commits 规范）
git add .
git commit -m "feat: 添加新功能"

# 2. 运行发版命令
pnpm release
```

就这么简单！发版脚本会自动处理所有事情。

## 发版流程

当你运行 `pnpm release` 时，会自动执行：

1. ✅ 检查未提交的更改
2. ✅ 运行代码检查（lint）
3. ✅ 运行所有测试
4. ✅ 构建所有包
5. ✅ 分析 git commits 生成 changelog
6. ✅ 自动更新版本号
7. ✅ 创建 git tag
8. ✅ 推送到 GitHub
9. ✅ 发布到 npm
10. ✅ 同步 changelog 到文档

## Commit 规范

为了自动生成有意义的 changelog，请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

### 常用类型

| 类型       | 说明       | 版本影响      |
| ---------- | ---------- | ------------- |
| `feat`     | 新功能     | MINOR (0.x.0) |
| `fix`      | Bug 修复   | PATCH (0.0.x) |
| `feat!`    | 破坏性变更 | MAJOR (x.0.0) |
| `docs`     | 文档更新   | -             |
| `style`    | 代码格式   | -             |
| `refactor` | 重构       | -             |
| `perf`     | 性能优化   | PATCH         |
| `test`     | 测试相关   | -             |
| `chore`    | 构建/工具  | -             |

### 示例

```bash
# 新功能（会增加 minor 版本）
git commit -m "feat: 添加文件批量上传功能"

# 修复 bug（会增加 patch 版本）
git commit -m "fix: 修复 iPhone 图片格式转换问题"

# 破坏性变更（会增加 major 版本）
git commit -m "feat!: 重构文件选择 API"

# 带详细说明
git commit -m "feat: 添加文件预览功能

支持图片、PDF 等文件的在线预览
- 添加预览组件
- 支持缩放和旋转
- 优化加载性能"
```

## 版本号规则

项目遵循 [Semantic Versioning](https://semver.org/)：

- **MAJOR** (x.0.0): 不兼容的 API 修改
- **MINOR** (0.x.0): 向下兼容的功能性新增
- **PATCH** (0.0.x): 向下兼容的问题修正

## 查看 Changelog

所有版本变更都记录在 [Changelog](/changelog) 页面。

## 注意事项

### 发版前

- ✅ 确保所有测试通过
- ✅ 确保代码已经过 lint 检查
- ✅ 确保所有更改已提交
- ✅ 确保 commit 信息符合规范

### npm 权限

首次发版需要：

```bash
# 登录 npm
npm login

# 验证登录状态
npm whoami
```

### GitHub 权限

确保有仓库的推送权限，并且 git remote 配置正确：

```bash
# 查看 remote 配置
git remote -v

# 如果需要，更新 remote
git remote set-url origin https://github.com/Life-Palette/packages.git
```

## 仅生成 Changelog

如果只想生成 changelog 而不发版：

```bash
pnpm changelog
```

## 手动同步 Changelog

如果需要手动同步 changelog 到文档：

```bash
pnpm sync-changelog
```

## 回滚版本

如果发版出现问题：

```bash
# 1. 从 npm 撤回版本（发布后 72 小时内）
npm unpublish @life-palette/utils@版本号

# 2. 删除 git tag
git tag -d v版本号
git push origin :refs/tags/v版本号

# 3. 回退 commit
git reset --hard HEAD~1
git push -f
```

## 更多信息

查看 [RELEASE.md](https://github.com/Life-Palette/packages/blob/main/RELEASE.md) 了解更详细的发版流程和最佳实践。
