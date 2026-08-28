# 自动审查（CI 验证体系）实际配置

> 本文件描述 Aether 仓库**当前真实落地**的自动验证机制。
> （历史版本曾承诺 ESLint / jest / Codecov / pr-review.yml，均未实现；现已按
> hermes-agent 的编排模式重做为下面的真实配置，文档与代码保持一致。）

## 验证总览

| 触发时机 | 检查 | 工作流 |
| --- | --- | --- |
| push / PR | 分类器 → 类型检查 + IPC 契约 | `.github/workflows/ci.yml`（job: `detect` → `typecheck-ipc`） |
| push / PR | 单元 / 集成测试（vitest 串行 30s 超时） | `ci.yml`（job: `tests`） |
| push / PR | 渲染层构建 + npm 打包 dry-run | `ci.yml`（job: `build`） |
| push / PR | Electron 启动冒烟（Windows，非阻塞） | `ci.yml`（job: `smoke`） |
| push / PR | **汇总 gate：all-checks-pass**（分支保护只认这一个） | `ci.yml`（job: `all-checks-pass`） |
| push / PR | Gitleaks 密钥扫描（非阻塞） | `ci.yml`（job: `detect` 首步） |
| push / PR | CodeQL 静态分析 | `.github/workflows/codeql.yml` |
| 依赖变更 | OSV 漏洞扫描（lockfile，SARIF 上传 Security） | `.github/workflows/osv-scanner.yml` |
| 依赖变更 | npm audit（--audit-level=high） | `.github/workflows/supply-chain-audit.yml` |
| 每日 | stale 清理（90 天标记 + 30 天关闭） | `.github/workflows/stale.yml` |
| PR | 按路径自动打标签 | `.github/workflows/labeler.yml` + `.github/labeler.yml` |
| PR | 🤖 CI 检查汇总评论（自动刷新） | `ci.yml`（`all-checks-pass` 末步） |
| 打 tag | Release / npm publish | `release.yml` / `npm-publish.yml` |
| 依赖更新 | Dependabot（双目录分组，weekly） | `.github/dependabot.yml` |

## 编排模型（hermes 模式）

- **分类器** `scripts/ci/classify_changes.mjs` 按改动路径计算 lane：
  `core / renderer / tui / tests / deps / docs / ci`。
- **PR = 增量触发**：只跑受影响的 lane，跳过的不占 runner。
- **push 到主干（master/main）= fail-open 全跑**：主干永远全量验证。
- **all-checks-pass gate**：`success` / `skipped` 都算通过，仅 `failure` 失败；
  分支保护（若开启）只需认这一个检查。

## 与历史文档的差异（已纠正）

- ❌ 曾声称 `.github/workflows/pr-review.yml` → ✅ 实际不存在，检查全部在 `ci.yml` 编排内。
- ❌ 曾声称 ESLint → ✅ 无 ESLint；以 `tsc --noEmit`（TypeScript 严格检查）为准，
  不为引进 lint 引入海量噪音。
- ❌ 曾声称 jest --coverage / Codecov → ✅ 实际为 vitest；覆盖率需用户提供
  Codecov token 后另配（见下）。

## 可选增强（需用户操作，非代码改动）

1. **CodeRabbit**（逐行 AI 审查 bot）：GitHub Marketplace 安装即可。
2. **Codecov**：提供 token 后可在 `tests` lane 加
   `vitest --coverage` + `codecov/codecov-action@v4`。
3. **分支保护**：仓库 Settings → Branches，为 master 加保护规则并勾选
   `all-checks-pass` 为 required check。

## 本地复现检查

```bash
cd app
npm run typecheck        # 类型检查（tsc --noEmit）
npm test                 # 单元/集成测试（vitest 串行 30s）
npx vite build           # 渲染层构建
npm run test:e2e         # Electron 冒烟（Windows）
npm audit --audit-level=high  # 依赖审计
node scripts/ci/classify_changes.mjs --base HEAD~1 --head HEAD  # 分类器本地调试
```