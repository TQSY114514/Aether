# AETHER.md — 项目核心知识库与架构指南 (Project Knowledge Base)

> **定位**：Aether 是一个 Local-first、Multi-model、Agent-native 的桌面级 AI 工作台（Electron + React/TS + Zustand + better-sqlite3）。
> **核心口号**："The AI Workbench for developers — One workspace. Every model. Every agent."
> **护城河**：竞技场产出评估数据 (Arena) → 模型智能建议 (Model Advisor) → 动态自动路由 (Router)。

---

## 1. 技术栈与架构全景 (Tech Stack & Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AETHER ARCHITECTURE                           │
├────────────────────────────────────────────────────────────────────────┤
│ 渲染层 (Renderer - app/src/)                                           │
│  ├─ UI Framework: React 18 + TypeScript + Vite + Tailwind CSS          │
│  ├─ State: Zustand (chatSlice, sessionSlice, providerSlice, uiSlice...) │
│  ├─ Virtualization: @tanstack/react-virtual (高性能大消息列表虚拟滚动) │
│  ├─ Components: ChatWindow, ChatInput, AgentActionHUD, AgentTaskDeck   │
│  └─ Preload Bridge: window.electronAPI (contextBridge, IPC 契约)       │
├────────────────────────────────────────────────────────────────────────┤
│ 主进程 (Main Process - app/electron/)                                  │
│  ├─ Runtime: Electron Main Process (Node.js 24 / CommonJS)            │
│  ├─ IPC Handlers (ipc/*.js): chat, model, provider, agent, arena, mcp   │
│  ├─ LLM Layer (llm/): providerAdapter, toolLoop, openaiAdapter...      │
│  ├─ Tools Engine (tools/): registry (42+ tools), sandbox, impact       │
│  ├─ Database (database.js): SQLite via better-sqlite3 (WAL mode)       │
│  ├─ Execution Backends (exec/): Local, Docker sandbox, Remote SSH      │
│  ├─ MCP Client & Manager (mcp/): Stdio tool servers & dynamic tools   │
│  └─ Evolution Engine (evolution/): Strategy store, reflect, auto-commit│
├────────────────────────────────────────────────────────────────────────┤
│ 独立终端与 SDK (aether-evolution - app/tui/ & app/electron/sdk/)       │
│  ├─ TUI (app/tui/): Ink v5 终端界面 (aether tui)，Electron-free        │
│  ├─ SDK (app/electron/sdk/): 无 Electron 依赖的纯 Node Agent 运行库    │
│  └─ RPC (app/electron/llm/rpc/): JSONL 帧协议服务 (--mode rpc)         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构与模块索引 (Directory Map)

```text
D:\Aether/
├── AGENTS.md               # 贡献者宪法与极简开发准则
├── AETHER.md               # 项目核心知识库 (本文件)
├── CHANGELOG.md            # 版本演进记录
├── docs/                   # 详细架构、路线图、UI 设计规范
│   ├── roadmap.md          # 2026-08 战略路线图 (P0/P1/P2)
│   ├── ui-design.md        # Anti-AI-Slop 界面视觉硬规范
│   ├── pitfalls.md         # 踩坑记录与防御性编程实践
│   └── competitive-analysis.md # 竞品技术分析 (OpenCode/Hermes/Claude)
├── app/
│   ├── electron/           # Electron 主进程源码 (纯 CommonJS)
│   │   ├── main.js         # 应用入口、生命周期与窗口管理
│   │   ├── preload.js      # ContextBridge 安全隔离层
│   │   ├── database.js     # SQLite WAL 模式数据操作层
│   │   ├── featureFlags.js # 集中式特性开关系统
│   │   ├── ipc/            # 业务领域 IPC Handler (chat, message, session, model...)
│   │   ├── llm/            # LLM 适配、工具循环、规划推理与演进系统
│   │   ├── tools/          # 42+ 内置工具定义、安全沙箱与影响分析
│   │   ├── exec/           # 本地/Docker/SSH 执行后端适配器
│   │   ├── mcp/            # MCP 协议客户端与 stdio 服务器管理器
│   │   ├── context/        # 代码理解、LSP 客户端、符号提取与 RepoMap
│   │   ├── evolution/      # GEP 自进化闭环 (Reflect, Strategies, Arena)
│   │   └── sdk/            # Electron-free SDK 聚合导出
│   ├── src/                # 前端渲染层源码 (React + TypeScript)
│   │   ├── store/          # Zustand 状态切片与事件监听桥接
│   │   ├── components/     # UI 组件 (chat, ui, sidebar, settings...)
│   │   │   └── chat/       # ChatWindow, ChatInput, AgentActionHUD, AgentTaskDeck...
│   │   ├── pages/          # 顶级页面 (ChatPage, ModelPage, SecurityPage...)
│   │   ├── utils/          # i18n 生成管道、Markdown 渲染器、主题引擎
│   │   └── env.d.ts        # 全局 TypeScript IPC 类型契约
│   └── tui/                # Ink v5 终端 TUI (Electron-free)
```

---

## 3. 数据层与存储规范 (SQLite Data Layer)

- **驱动**：`better-sqlite3` 原生驱动，启用 `PRAGMA journal_mode = WAL`。
- **单线程模型**：运行在主进程主线程，天然无跨句柄写入竞争。
- **核心数据表**：
  - `session` / `session_config`：会话元数据与配置（模型 ID、系统前缀、Agent 模式、工作区等）
  - `message`：聊天历史（`id`, `session_id`, `role`, `content`, `model_used`, `status`, `error_message`）
  - `provider` / `model`：AI 供应商（API 地址、安全加密 Key）与模型定义
  - `agent_task`：后台任务持久化（支持中断与崩溃恢复 `restorePendingTasks`）
  - `kg_nodes` / `kg_edges`：项目知识图谱与记忆存储
  - `arena_votes` / `model_scores`：模型竞技场对战记录与 ELO 动态评分
  - `settings`：全局配置与特性开关（`feature_flag.*`）
- **硬规则**：
  1. `db.exec()` 仅用于 DDL / Migration；业务读写一律使用 `db.prepare(sql).get/all/run(...)` 与 `?` 参数化绑定。
  2. `lastInsertRowid` 会返回 `BigInt`，存入内存前必须显式 `Number(lastInsertRowid)`。
  3. 时间戳统一调用 `localNow()`，避免 SQLite `CURRENT_TIMESTAMP` 的 UTC 时区偏差。

---

## 4. Agent 核心执行链路 (Agent Loop & LLM Engine)

### 4.1 工具循环 (`toolLoop.js`)
1. **Plan → Act → Observe**：
   - 接收用户输入 → 注入工作区指令（`AETHER.md`/`AGENTS.md`）与 RepoMap → 请求 LLM。
   - 解析响应中的 `tool_calls` 或 `<think>...</think>`。
   - 权限检查（5 档权限策略：`off` / `plan` / `ask` / `auto_confirm` / `auto` / `yolo`）。
   - 危险工具（`risk: dangerous`）在 `ask` 模式下触发前端确认弹窗。
   - 执行工具 → 结果通过 `toolResultMiddleware` 脱敏截断 → 回传给模型进入下一轮。
2. **循环防卡死与语义守卫**：
   - `LoopGuard`：基于滑窗的无进展/重复工具调用检测器。
   - `SemanticLoopDetector`：检测模型反复重复相同推理模式，自动注入调整策略。
3. **思考与正文分离机制**：
   - `openaiAdapter.js` 内置 `ThinkTagExtractor`，实时剥离 `<think>` 标签，将思考过程推送到 `onThinkingDelta`。
   - 最后一轮生成最终回答时，绝不误发 `onPlanStep`，确保正文气泡纯净无重复。

---

## 5. 交互与 UI 系统 (UI/UX System)

### 5.1 现代 Agent HUD 与任务甲板（对齐 OpenCode / Hermes）
- **`AgentActionHUD.tsx`**：
  - 吸顶固定在输入框（`ChatInput`）正上方。
  - 动态展示当前执行工具（`⚡ write_file (src/...)` / `🧠 深度思考中`）、步骤轮次（`第 3 / 25 轮`）、实时耗时与打字干预提示。
- **`AgentTaskDeck.tsx`**：
  - 输入框上方的可折叠任务甲板。
  - 默认单行紧凑态展示进度条与当前步骤，点击一键展开查看完整子任务清单（`✓ 完成` / `⟳ 执行中` / `○ 待处理`）。
- **`ThinkingBlock.tsx`**：
  - 独立的 Slate-Indigo 暗紫微光配色与等宽代码字体，流式期间自动展开并显示脉冲光标 `▋`，正文开始时平滑收起。

### 5.2 Anti-AI-Slop 视觉规范 (`docs/ui-design.md`)
- 严禁任何紫色/蓝紫渐变大背景、严禁 `bg-clip-text` 渐变大标题。
- 严禁无节制的毛玻璃高斯模糊和发光大投影。
- 严禁使用 Emoji 代替系统图标（统一使用 `lucide-react`）。
- 严禁文案中出现 `→` 符号，所有交互状态必须完整（hover / focus-visible / active / disabled）。

---

## 6. IPC 契约体系 (Three-File IPC Contract)

在 Aether 中新增或修改任何 IPC 通信，**必须同时同步修改以下三处**：
1. **Handler 实现**：`app/electron/ipc/<domain>.handler.js`
2. **ContextBridge 暴露**：`app/electron/preload.js`
3. **TypeScript 类型定义**：`app/src/env.d.ts`

> [!CAUTION]
> 任何一处遗漏都会被 `node scripts/check-ipc.js` 门禁拦截，导致构建直接失败。

---

## 7. 常用开发与测试命令

```bash
# 启动应用
start.bat
# 或
cd app && npm run build && npm start

# 运行前端开发服务器 (带 HMR)
cd app && npm run dev

# 编译验证 (IPC 检查 + TS 类型 + Vite 构建)
cd app && npm run build

# 执行单元测试套件
cd app && npx vitest run

# 独立运行指定模块测试
cd app && npx vitest run src/store/listeners.test.ts test/chat-stop.test.js

# 检查 IPC 契约一致性
cd app && node scripts/check-ipc.js
```

---

## 8. 核心开发铁律 (Hard Rules)

1. **Electron 目录为 CommonJS**：`app/electron/` 下的所有 `.js` 文件禁止使用 `import` / `export`，禁止使用 TypeScript 类型断言。
2. **主进程改动必须重启**：主进程代码不支持热重载，修改后必须完全退出重启 Electron。
3. **敏感信息不入库**：API Key、数据库、用户对话位于系统 `%APPDATA%/aetherai/`，禁止硬编码在代码中。
4. **i18n 严格自动生成**：用户可见文案修改 `app/src/utils/i18n-en-base.json`，运行 `node gen-i18n.js` 生成 `i18n.ts`，严禁手动直接编辑 `i18n.ts`。
