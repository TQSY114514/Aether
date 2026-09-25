# Contributing to Aether / 参与贡献指南

[English](#english) · [简体中文](#简体中文)

---

<a id="english"></a>

## English

Aether is a local-first, multi-model AI workbench (Electron Desktop GUI + Ink v5 Terminal TUI + Electron-free SDK). Contributions, bug reports, and architectural improvements are welcome.

### 1. Architecture & Tech Stack Overview

Before touching the codebase, read [`AGENTS.md`](./AGENTS.md) and [`docs/roadmap.md`](./docs/roadmap.md):

- **Renderer (`app/src/`)**: React + TypeScript + Zustand (`store/index.ts`) + Tailwind CSS. Must strictly follow [`docs/ui-design.md`](./docs/ui-design.md) (clean engineering UI, full keyboard/focus states, `prefers-reduced-motion` support, zero AI-template clichés).
- **Main Process & Agent Runtime (`app/electron/`)**: Plain Node.js CommonJS (`require` / `module.exports` — no TypeScript syntax in `.js` files) + `better-sqlite3` (WAL mode).
- **Terminal UI (`app/tui/`)**: ESM (`"type": "module"`) + Ink v5 (`react.createElement` without JSX bundlers). Must remain 100% Electron-free.
- **SDK (`app/electron/sdk/`)**: Electron-free aggregation exported as `aetherai/sdk`.

> **Data Privacy Rule**: All runtime state (API keys, SQLite database `aetherai.db`, chat history, custom background) lives in `%APPDATA%/aetherai/` at runtime. **Never commit `*.db`, `.env`, `background.img`, `dist/`, or real API keys.**

### 2. Local Development Setup

Requires **Node.js ≥ 22** (and build tools for `better-sqlite3` if prebuilt binaries are unavailable):

```bash
cd app
npm install

# Build the React frontend into app/dist/
npm run build

# Launch the Electron Desktop Workbench
npm start
```

Or run `start.bat` (Windows) / `./start.sh --desktop` (macOS/Linux) from the repository root.

### 3. Hard Engineering Rules for Pull Requests

1. **The 3-File IPC Contract**: Every IPC channel change must update all three files in lockstep:
   - Handler: `app/electron/ipc/<domain>.handler.js`
   - Bridge: `app/electron/preload.js`
   - Types: `app/src/env.d.ts`
2. **Parameterized SQLite Queries**: `db.exec()` is restricted to DDL/migrations only. Every read/write query must use `db.prepare(sql).get/all/run(...)` with `?` parameter bindings. Convert `lastInsertRowid` via `Number()` before persisting.
3. **Tool Permission Gate**: New built-in tools in `app/electron/tools/registry.js` that mutate files, execute commands, or access external networks must declare `risk: 'dangerous'` and appropriate capability axes (`READ`, `WRITE`, `EXECUTE`, `NETWORK`, `GIT`, `EXTERNAL`). All tool outputs must pass through `toolResultMiddleware`.
4. **Feature Flags**: Gate experimental capabilities in `app/electron/featureFlags.js` with conservative defaults (`false` for experimental features).
5. **i18n Pipeline**: Do not hand-edit `app/src/utils/i18n.ts`. Add new user-visible strings to `app/src/utils/i18n-en-base.json` (and `i18n-translations.json`), then regenerate via `node app/src/utils/gen-i18n.js`.

### 4. Verification & Test Suite

Before opening a Pull Request, verify that the build and relevant checks pass from `app/`:

```bash
cd app

# 1. Frontend TypeScript & Vite bundle build
npm run build

# 2. Static IPC contract & UI token verification
node scripts/check-ipc.js
node scripts/check-ui-tokens.js

# 3. Run unit & integration tests
npm test

# 4. Smoke-check TUI & headless RPC (if touching TUI/CLI/SDK)
node cli.js tui --smoke
node scripts/smoke-rpc.js
```

### 5. Commit Messages & Reporting Bugs

- **Commit Format**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Keep the subject line ≤ 72 characters and explain *why* in the commit body.
- **Bug Reports**: Open a [GitHub Issue](https://github.com/TQSY114514/Aether/issues/new) including Aether version, OS, reproduction steps, and error logs (redact any sensitive tokens or private paths).

---

<a id="简体中文"></a>

## 简体中文

Aether 是一个本地优先的多模型 AI Agent 工作台（Windows 桌面端 Electron GUI + 跨平台终端 Ink v5 TUI + Electron-free SDK）。欢迎提交 Issue、Bug 修复与架构改进 PR。

### 1. 架构概览与目录规范

在修改代码前，请先阅读 [`AGENTS.md`](./AGENTS.md)（工程宪法）与 [`docs/roadmap.md`](./docs/roadmap.md)（路线图与优先级）：

- **渲染进程 (`app/src/`)**：React + TypeScript + Zustand (`store/index.ts`) + Tailwind CSS。UI 改动须严格遵循 [`docs/ui-design.md`](./docs/ui-design.md)（克制工程美学、禁止廉价紫蓝渐变与模板感、补齐 hover/focus-visible/disabled 状态及减少动态效果降级）。
- **主进程与 Agent 运行时 (`app/electron/`)**：纯 Node.js CommonJS（禁止在 `.js` 中写入 TypeScript 类型注解或 `import/export`）+ `better-sqlite3`（WAL 模式）。
- **终端交互界面 (`app/tui/`)**：ESM 模块 + Ink v5（纯 `react.createElement` 实现，不引入额外编译打包依赖，且严禁依赖 `electron`）。
- **独立 SDK (`app/electron/sdk/`)**：对外导出 `aetherai/sdk`，所有聚合模块必须保持 Electron-free。

> **隐私与安全底线**：运行时产生的数据库（`aetherai.db`）、API 密钥、聊天记录均位于 `%APPDATA%/aetherai/`。**严禁将任何 `.db`、`.env`、`background.img` 或真实密钥提交至 Git 仓库。**

### 2. 本地开发环境启动

需安装 **Node.js ≥ 22**：

```bash
cd app
npm install

# 编译前端工程至 app/dist/
npm run build

# 启动 Electron 桌面工作台
npm start
```

Windows 用户也可直接双击或运行仓库根目录的 `start.bat`。

### 3. 核心工程红线（PR 必检项）

1. **IPC 三文件同步契约**：新增或修改任何 IPC 通道时，必须同步更新以下三个文件，缺一不可：
   - 处理器：`app/electron/ipc/<domain>.handler.js`
   - 桥接暴露：`app/electron/preload.js`
   - 类型声明：`app/src/env.d.ts`
2. **SQLite 参数化查询**：`db.exec()` 仅限建表与迁移（DDL）使用；所有读写查询必须使用 `db.prepare(sql).get/all/run(...)` 配合 `?` 占位符绑定。`lastInsertRowid` 需经 `Number()` 转换后再持久化。
3. **工具权限门与脱敏中间件**：在 `app/electron/tools/registry.js` 中注册任何会修改文件、执行命令或访问网络的工具时，必须标记 `risk: 'dangerous'` 并声明对应能力轴；所有工具输出必须经过 `toolResultMiddleware` 脱敏与截断处理。
4. **多语言生成管道 (i18n)**：请勿手动修改 `app/src/utils/i18n.ts`。新增用户可见文案请写入 `app/src/utils/i18n-en-base.json`（及对应翻译文件），并运行 `node app/src/utils/gen-i18n.js` 重新生成。

### 4. 提交前验证清单

提交 PR 前请在 `app/` 目录下执行以下验证命令：

```bash
cd app

# 1. 前端构建门禁
npm run build

# 2. IPC 契约与 UI 设计令牌静态检查
node scripts/check-ipc.js
node scripts/check-ui-tokens.js

# 3. 运行单元测试与集成测试套件
npm test

# 4. 终端 TUI 与 RPC 冒烟测试
node cli.js tui --smoke
node scripts/smoke-rpc.js
```
