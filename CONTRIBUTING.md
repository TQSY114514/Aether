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

# 1. Fast static verification gate (~65s)
npm run check
# Runs: check-ipc -> check-deps -> check-architecture -> check-ui-tokens -> tsc --noEmit

# 2. Run unit & integration tests
npm test

# 3. Smoke-check TUI & headless RPC (if touching TUI/CLI/SDK)
node cli.js tui --smoke
node scripts/smoke-rpc.js
```

### 5. Pull Request Guidelines & PR Discipline

To protect maintainer bandwidth and keep the review process smooth, all PRs must adhere to the following principles:

1. **Single Responsibility**: One PR should solve exactly one issue or feature. Do not bundle unrelated refactorings with feature implementations.
2. **Granularity & Scope Limit**: Keep PRs focused. Pull requests modifying > 1,000 lines (excluding auto-generated artifacts) should be decomposed into smaller, sequential PRs.
3. **Align New Features Upfront**: Before writing code for significant new features, check [`docs/roadmap.md`](./docs/roadmap.md) or open an Issue to confirm alignment with current project goals, preventing unnecessary rejection.
4. **Dependency Defense (Think Three Times)**:
   - *Can this be implemented cleanly with standard Web/Node.js APIs?*
   - *Will this dependency bloat desktop installer size or slow cold boot?*
   - *Does it violate architectural boundaries?* (e.g. `app/tui/` and `app/electron/sdk/` must remain strictly Electron-free).
5. **Clean Logging & Outputs**: Strip out temporary `console.log` statements before submitting. Raw unmanaged stdout outputs disrupt Ink TUI terminal layouts and corrupt the `--mode rpc` JSONL streaming protocol.
6. **Constructive Review & Rejection Policy**: If a PR is closed or declined, it is usually due to performance overhead, architectural non-conformance, security/privacy risks, or misalignment with the roadmap. It is never a dismissal of your effort—we sincerely value every contributor's time.

### 6. AI-Assisted Contribution & Anti-AI Slop Policy

We welcome contributors leveraging modern AI tools (including Aether, Claude, Cursor, Copilot, etc.) to enhance productivity. However, **dumping unvetted AI-generated code (Vibe Coding -> AI Slop) is strictly prohibited.**

1. **Transparency**: If AI was used to assist in authoring the PR, disclose the tool and exact model in the PR description (e.g., `AI Assistant: Claude 3.7 Sonnet` or `OpenAI o3-mini`).
2. **Complete Ownership**: You must personally understand every single line of code submitted and be capable of answering reviewer questions regarding design trade-offs and edge cases.
3. **Human-Authored PR Descriptions**: The PR summary, rationale, and notes must be written by you. AI may be used to polish phrasing, but do not rely on LLMs to hallucinate the entire description.
4. **No Blind Retry Loops**: Avoid submitting code shaped by uninspected `AI generate -> error -> ask AI again -> commit` cycles. Test locally and verify the root cause yourself before submitting.

PRs that violate these principles and shift AI review burdens onto maintainers will be deferred or closed.

### 7. Commit Messages & Reporting Bugs

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

# 1. 运行快速静态门禁 (~65秒)
npm run check
# 依次执行：IPC契约检查 -> 依赖引用检查 -> 架构纯洁性检查 -> UI反AI套话令牌检查 -> TypeScript静态类型检查

# 2. 运行单元测试与集成测试套件
npm test

# 3. 终端 TUI 与 RPC 冒烟测试（若涉及 CLI/TUI/SDK 变动）
node cli.js tui --smoke
node scripts/smoke-rpc.js
```

### 5. PR 提交纪律与质量边界

为保障审阅效率与软件演进秩序，所有提交的 PR 须遵守以下协作纪律：

1. **单 PR 单职责**：一个 PR 只解决一件事；严禁在“代码重构”中夹带新功能，也请避免在新功能 PR 中包含大面积无关联格式化。
2. **体量与行数控制**：除自动化生成的代码/本地化文件外，建议单 PR 变更代码行数控制在合理范围（原则上不超过 1000 行），更提倡拆分成独立小 PR 渐进提交。
3. **新特性前置对齐**：开发重大新功能前，请先查阅 [`docs/roadmap.md`](./docs/roadmap.md) 或提前发起 Issue 探讨，避免因不符合当前规划路线而被婉拒。
4. **依赖引入“防御三问”**：
   - *是否可以通过原生 Web/Node.js API 简洁实现？*
   - *是否会导致打包体积暴增或显著拖慢冷启动？*
   - *是否破坏了架构纯洁性？*（例如 `app/tui/` 和 `app/electron/sdk/` 绝对严禁引入 Electron 依赖）。
5. **日志与输出清理**：提交前务必清理所有临时 `console.log`。原生裸露的标准输出会扰乱 Ink TUI 终端渲染排版，更会导致 `--mode rpc` 模式下的 JSONL 协议流解析损毁。
6. **理性看待 PR 评审与关闭**：若 PR 未被合并，通常是由于性能开销、架构不符、安全隐私顾虑或未在路线图中。这绝非否定您的付出，维护者真诚感谢每一位贡献者的劳动与支持。

### 6. AI 辅助开发与反 AI Slop 规范

Aether 欢迎开发者借助现代 AI 工具（包括 Aether 本身、Claude、Cursor 等）提升开发效率。但我们**坚决抵制不加思考、盲目生成的垃圾代码堆砌（Vibe Coding -> AI Slop）**：

1. **透明声明**：若在开发中使用了 AI 辅助，请在 PR 描述中如实注明所使用的工具与具体模型（例如 `AI 辅助模型: Claude 3.7 Sonnet`）。
2. **完全理解与答辩责任**：您必须彻底理解提交代码中的每一行逻辑与潜在副作用。当审阅者询问某处改动的考量时，您需要能作出合理解释，不可推脱为“这是 AI 生成的”。
3. **人类主笔 PR 描述**：PR 的修改背景、核心意图与测试说明必须由您亲自撰写。可以使用 AI 润色文字，但严禁直接复制 AI 虚构的假大空套话。
4. **严禁死循环盲修**：禁止在本地出现多次 `AI 生成 -> 报错 -> 让 AI 盲猜修复 -> 再报错` 且未经人工理解就直接提交的行为。必须在本地明确根因并自测通过后再行提交。

违反上述规则、将 AI 审查与调试成本转嫁给社区维护者的 PR，将被延后处理或直接关闭。

### 7. Commit 规范与 Bug 反馈

- **Commit 规范**：使用 Conventional Commits 标准（`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`），保持首行简洁（≤ 72 字符），并在 Body 中详细解释改动原因。
- **Bug 报告**：请提交 [GitHub Issue](https://github.com/TQSY114514/Aether/issues/new)，附带 Aether 版本、操作系统环境、复现步骤及错误日志（注意遮蔽敏感 Token 与私密路径）。
