# 自动 PR 审查配置指南

## 概述
此配置为 Aether 项目设置了完整的自动 PR 审查机制。每当创建或更新 PR 时，系统会自动执行一系列检查。

## 检查项目

### 1. 代码质量检查 (ESLint)
- **触发**: 每个 PR 创建或更新时
- **检查内容**: 
  - 代码风格一致性
  - 潜在的代码问题
  - 未使用的变量
  - 代码规范遵循

- **输出**: PR 评论中显示所有 lint 错误和警告

### 2. 构建检查
- **触发**: 每个 PR 创建或更新时
- **检查内容**:
  - 项目能否成功构建
  - 是否有编译错误

- **输出**: 构建失败时添加评论提醒

### 3. 测试覆盖率检查
- **触发**: 每个 PR 创建或更新时
- **检查内容**:
  - 运行单元测试
  - 检查代码覆盖率
  - 上传覆盖率数据到 Codecov

- **输出**: 测试结果和覆盖率报告

### 4. 安全检查
- **触发**: 每个 PR 创建或更新时
- **检查内容**:
  - 检查 npm 依赖的安全漏洞
  - 识别已知的脆弱依赖

- **输出**: 安全问题警告和建议

### 5. PR 审查总结
- **触发**: 所有检查完成后
- **内容**:
  - PR 基本信息
  - 已执行的检查列表
  - 改进建议

## 配置文件位置
- 工作流文件: `.github/workflows/pr-review.yml`
- 此文档: `.github/pr-review-config.md`

## 如何启用更多功能

### A. 启用分支保护规则
1. 访问仓库设置 → Branches
2. 添加分支保护规则到 `master` 分支
3. 启用以下选项:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Require code reviews before merging (建议 1-2 个审查者)
   - ✅ Dismiss stale pull request approvals when new commits are pushed

### B. 启用自动审查员
1. 进入仓库设置 → Code review limits
2. 配置自动审查员规则

### C. 添加 Codecov 集成
1. 访问 https://codecov.io
2. 关联你的 GitHub 仓库
3. 自动上传覆盖率报告

## 自定义审查规则

### 修改 ESLint 规则
编辑 `.eslintrc` 文件调整检查规则

### 修改测试命令
在 `package.json` 中修改 `test` 脚本:
```json
{
  "scripts": {
    "test": "jest --coverage"
  }
}
```

### 添加新的检查步骤
编辑 `.github/workflows/pr-review.yml` 添加新的 job

## PR 审查流程

当 PR 创建/更新时:
1. 代码质量检查 → 如有问题添加评论
2. 构建检查 → 验证项目构建
3. 测试检查 → 运行测试套件
4. 安全检查 → 检查依赖安全
5. 生成审查总结 → 汇总所有结果

## 处理审查失败

如果某个检查失败:

### ESLint 失败
```bash
npm run lint -- --fix  # 自动修复大部分问题
```

### 构建失败
```bash
npm run build  # 本地构建排查问题
```

### 测试失败
```bash
npm test  # 运行本地测试
```

### 安全问题
```bash
npm audit  # 查看详细的安全问题
npm audit fix  # 尝试自动修复
```

## 查看审查结果

每个 PR 的 Checks 标签页会显示:
- ✅ 检查通过
- ❌ 检查失败
- ⏳ 检查进行中

详细日志可在 GitHub Actions 中查看

## 最佳实践

1. **本地测试**: 在推送前本地运行所有检查
2. **及时修复**: 快速响应自动审查的失败
3. **保持代码质量**: 定期更新依赖和规则
4. **审查建议**: 认真对待 PR 审查建议，改进代码质量

## 常见问题

**Q: 为什么我的 PR 检查失败了?**
A: 查看 PR 页面的 Checks 标签，点击失败的检查查看详细日志。

**Q: 我可以跳过某个检查吗?**
A: 不建议跳过。如果有特殊情况，请在 PR 中说明并请求人工审查。

**Q: 多久执行一次检查?**
A: 每次 PR 创建、更新时自动执行。

## 支持和反馈

如有问题或建议，请联系项目维护者。
