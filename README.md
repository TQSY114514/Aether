<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### Chat with any model, run a safe coding agent, compare models side-by-side — on your desktop or in your terminal

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 43](https://img.shields.io/badge/Electron-43-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Status: Beta.** AetherAI is a solo/hobby project. It works, but expect rough
> edges. Bug reports are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and
> [SECURITY.md](./SECURITY.md).

Unify multiple LLM providers — OpenAI / Claude / DeepSeek / local models / any OpenAI-compatible endpoint — into one desktop app. Chat, run a coding agent, and compare models head-to-head in a multi-model arena with ELO voting.

**Local-first by design.** API keys and conversations live in a local SQLite database and never leave your machine — except to the providers you configure.

**Safe by default.** The built-in agent runs inside a workspace sandbox with a permission ladder: file and command access is confirmed before it happens, and every tool call is auditable.

---

## What makes AetherAI different

AetherAI combines several capabilities that are typically spread across multiple tools into one local desktop app:

| Capability | Description | Maturity |
|---|---|:---:|
| **Multi-provider Chat** | Switch between OpenAI, Claude, DeepSeek, and any OpenAI-compatible endpoint mid-conversation. | `Stable` |
| **Agent Tool Loop** | 42 built-in tools with Plan-Act-Observe loop, sandboxing, permission ladder. | `Beta` |
| **Multi-model Arena** | Send one prompt to multiple models, vote on the best, track ELO rankings. | `Beta` |
| **Skills & Extensibility** | Drop-in `SKILL.md` files, MCP servers, 10-point hook system. | `Experimental` |
| **Structured Memory** | Agent recalls preferences and past decisions across sessions. | `Beta` |
| **Hierarchical Planning** | Complex requests auto-decompose into parallel sub-tasks. | `Experimental` |
| **Context Compaction** | Long conversations auto-summarize without losing tool-call pairs. | `Beta` |
| **Local-First Privacy** | Conversations, keys, personas in local SQLite. Nothing leaves your machine. | `Stable` |
| **15 UI Languages** | Including Classical Chinese (文言) and RTL Arabic. | `Beta` |
| **Terminal TUI** | Ink v5 交互终端：会话流、工具卡、diff 审阅/回滚、键盘权限门、`/fork` 会话树、`/memory`、运行中 steering 回注。 | `Beta` |
| **Headless CLI · RPC · SDK** | 四模式 CLI（单发 / NDJSON / JSONL RPC / 管道）、Electron-free SDK（`aetherai/sdk`）、机器可调用的 JSONL 协议。 | `Beta` |
| **MIT Licensed** | Fully open source. | `Stable` |

---

## Download

### Windows — Prebuilt Installer (Recommended for most users)

Download the latest [Release](https://github.com/TQSY114514/Aether/releases):

| Build | Description |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS installer. Per-user (no admin), auto-updates in-app. **Recommended.** |
| **`AetherAI-x.y.z.exe`** | Portable single-exe. No install, no auto-update; just run it. |

> The installer shows a SmartScreen "unknown publisher" warning on first launch — expected for an unsigned solo app. All data stays local.
>
> ⚠️ Some antivirus software may quarantine the unpacked `electron.exe` during packaging because the app is unsigned. If the installer is removed by your AV, add an exclusion or use the portable build.

### Run from source (developers / power users)

If you prefer to run from source, or want to modify the code, use `start.bat` (requires [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

See [Quick Start](#-quick-start) for the manual step-by-step.

> **exe vs start.bat** — both are supported and serve different audiences:
> - **Installer exe** — for end users: double-click to install, Start Menu entry, in-app auto-update, no Node.js needed.
> - **start.bat** — for developers / tinkerers: transparent `npm install` → `vite build` → `electron .` pipeline, edit-and-run, requires Node.js.

---

## Quick Start

**Prerequisites:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

Or run `start.bat` at the repo root on Windows.

### Try the terminal (no Electron window needed)

```bash
cd app && npm install
node cli.js tui              # 交互终端 UI（Node ≥ 22；Windows Terminal 体验最佳）
node cli.js "你好"           # 单发 prompt
echo "总结一下" | node cli.js  # 管道 stdin 作为 prompt
node cli.js --mode json "x"  # NDJSON 事件流（脚本/CI）
node cli.js tui --smoke      # headless 状态机冒烟
```

### Configure provider

1. After launch, click **Models** in the sidebar.
2. Add a provider (name / API URL / API Key).
3. Click **Fetch models** to pull the available model list.
4. Go back to chat and start talking.

### Enable Ask mode

1. Open **Settings - Agent & Safety**.
2. Set agent permission mode to **Ask**.
3. Confirm the workspace root is the folder you want the agent to read/write.
4. Keep **Yolo** disabled unless you want unrestricted access.

### Run your first agent task

1. Open a new chat.
2. Ask: `List the files in this project and summarize what the app does.`
3. Review each proposed tool call. Approve safe reads; deny anything unexpected.
4. Check the live reasoning trace and final answer.

---

## Features

**Status labels:** `Stable` = daily-use ready, `Beta` = usable with known rough edges, `Experimental` = new/advanced behavior may change, `Planned` = documented roadmap item.

### Chat

| Feature | Status | Description |
|---|:---:|---|
| **Multi-provider** | `Stable` | Single adapter layer; adding a provider = one file. Covers OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Concurrent streaming** | `Stable` | One chat streams while you keep talking in another. |
| **Thinking-effort slider** | `Beta` | Real params: OpenAI o-series / gpt-5 / Claude via relay. Only effective on reasoning models. |
| **Attachments** | `Beta` | Text files as context; images for multimodal (needs a vision model). |
| **Long-paste collapse** | `Stable` | Hundreds of lines auto-collapse into an expandable snippet (ChatGPT-style). |
| **Message editing** | `Stable` | Overwrite + regenerate from any point. |
| **Message search** | `Stable` | With highlighting across all messages. |
| **Sidebar summaries** | `Beta` | Model-generated topic phrases, not copied text. |

### Agent (Function Calling)

- `Beta` **42 built-in tools** — file ops (`read_file`, `list_dir`, `glob_find`, `grep_search`, `write_file`, `edit_file`, `apply_patch`), web (`web_search`, `web_fetch`), shell (`run_command`), git & GitHub (`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_create_branch`, `github_pr_create/list/merge/review`, `github_issue_create/list`, `github_release_create`, `github_actions_status`), code intelligence (`find_symbol`, `lsp_definition`, `lsp_references`, `lsp_diagnostics`, `lsp_code_actions`, `lsp_rename`), agent meta (`use_skill`, `ask_user`, `todo_write`, `delegate_task`, `task`, `memory_save/list/search`, `get_project_context`, `review_code`, `debug_loop`, `test_first`) — with a Plan-Act-Observe loop, live reasoning trace + task checklist, loop detection, per-tool timeouts, configurable iteration budget (default 25 rounds), and context compaction.
- `Experimental` **Hierarchical planning** — auto-generates task breakdown for complex requests (DS4-inspired).
- `Experimental` **Sub-agent delegation** — independent sub-tasks run in parallel via `delegate_task`.
- `Stable` **Permission modes** — risk-ascending ladder:

| Mode | Description | Sandbox |
|---|---|:---:|
| **Off** | Plain chat, no tools | N/A |
| **Plan** | Read-only tools (investigate without changes) | - |
| **Ask** | Confirm each risky action (recommended) | - |
| **Auto** | Run everything, no confirms | Yes |
| **Yolo** | Full permission, no sandbox | No |

- `Stable` **Workspace sandbox** — `write_file`/`edit_file` are refused outside the configured workspace root; `run_command` blocks destructive patterns. Configurable in Settings - Agent & Safety.
- `Beta` **Context compaction** — auto-summarizes older history (tool-call/result pairs kept intact; identifiers preserved verbatim).
- `Beta` **Tool call repair** — auto-repairs malformed JSON, missing args, unquoted keys, and truncated calls.

### Memory & Learning

- `Beta` **Auto long-term memory** — relevant memories injected before each turn; key facts extracted and saved automatically. Toggleable in Settings - Agent.
- `Experimental` **Habit learner** — detects recurring preferences (e.g. "always use Claude") and proposes auto-applied skills.
- `Beta` **Audit log** — per-turn agent execution trace for debugging.

### Arena

- `Beta` **Multi-model arena** — one prompt, multiple models answer **concurrently**; vote for the best and an **ELO leaderboard** updates automatically. Models are scored **per intent** (coding / math / translation / summary / general). *No other local-first desktop chat app ships a built-in multi-model arena with ELO.*

### Skills & Extensibility

| Component | Format | Status | Details |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | Drop into `<workspace>/.claude/skills/`; ships with `release-checklist` and `git-commit` |
| **Slash Commands** | `CMD.md` | `Stable` | 6 built-in: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 lifecycle points: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | External MCP servers merge with built-in tools automatically |

### Customization

| Setting | Status | Description |
|---|:---:|---|
| **Advanced model settings** | `Stable` | Max tokens, temperature, top_p, custom system prefix, per-language auto-titles, thinking effort |
| **Custom background** | `Stable` | Upload image with opacity / blur controls |
| **Personas** | `Stable` | System-prompt presets, switchable per session |
| **Themes** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 UI languages** | `Beta` | English, Chinese (简/繁/文言), Japanese, Spanish, French, German, Portuguese, Russian, Ukrainian, Arabic (RTL), Hindi, Korean |
| **Auto-update** | `Beta` | NSIS installer checks on launch; portable checks too (manual install) |
| **Usage tracking** | `Beta` | Per-API-call log with tokens, cost, latency, cache hit rate |

### Privacy

> **All data stays local.** AetherAI collects nothing and uploads nothing about you. Your API keys, conversations, and personas live in a local SQLite database. The only outbound network requests go to the LLM providers you configure.

---

## VS Code Extension & Headless CLI

Beyond the desktop app, AetherAI ships the same agent as a CLI and an editor extension:

- **Headless CLI** (`app/cli.js`) — run the agent non-interactively, feed NDJSON events to scripts/CI:
  ```bash
  node app/cli.js "fix the failing test" --workspace . --mode auto --max-iterations 30 --json-lines
  ```
- **VS Code extension** (`extension/`) — spawns the CLI in a chat panel: live tool-call stream, code-block actions (Insert / Write file), and **file-diff cards**: every `write_file` / `edit_file` / `apply_patch` call renders a line-level diff against the pre-change file content, with one-click **Revert** (restores the snapshot taken before the tool ran). Requires the extension setting `aether.cliPath` (auto-detected when the repo is cloned locally).
- **Local Gateway** (`127.0.0.1:35791`) — OpenAI-compatible REST API backed by the desktop app (Settings → Local Gateway → token); a second extension (`extensions/vscode-aether/`) connects through it.

---

## Terminal TUI, RPC & SDK

Beyond the desktop app and the plain CLI, AetherAI ships an interactive terminal UI, a machine-callable JSONL RPC mode, and an Electron-free SDK. All three share the same agent core, memory, personas, MCP tools, and permission rules as the desktop.

### Quick start — dual form

```bash
# Interactive terminal UI (Ink v5; requires Node ≥ 22)
node app/cli.js tui                # real terminal: type, approve tools, review diffs
node app/cli.js tui --smoke        # headless state-machine smoke (CI-safe, prints JSON)

# Single-shot prompt (same as before)
node app/cli.js "fix the failing test" --mode auto --max-iterations 30

# NDJSON event stream for scripts/CI (compat: --json-lines)
echo "summarize README.md" | node app/cli.js --mode json --model deepseek

# JSONL RPC loop over stdin/stdout
printf '{"type":"request","reqId":"c1","method":"listModels","params":{}}\n' \
  | node app/cli.js --mode rpc --db path\to\aetherai.db
```

### TUI (`aether tui`)

Interactive terminal agent: message stream, tool-call cards, diff review with **Enter** accept / **r** rollback (pre-write snapshot restore — works in non-git folders; `git restore` fallback in git repos), keyboard permission gate (`y` allow / `n` deny / `a` always-for-this-session), ask/plan/auto mode switching, `/fork` session tree, `/memory` search, `/persona` switch, Ctrl+C mid-run steering (type a follow-up and it injects into the loop). Full keymap: [docs/tui-keys.md](./docs/tui-keys.md).

### RPC (`aether --mode rpc`)

Machine-callable JSONL protocol over stdin/stdout: `request` frames in, `event`/`result`/`error` frames out — one JSON object per line, no human text. Methods: `run` (streams `text`/`tool`/`plan`/`status` events), `listModels`, `listProviders`, `models.default`, `listSessions`, `session.load`, `session.fork`, `task.derive`, `task.status`. Frame reference: [docs/rpc.md](./docs/rpc.md).

### SDK (`require('aetherai/sdk')`)

Electron-free aggregation of the agent core for external Node projects: `runAgent`, `openDatabase`, `resolveProviderModel`, `taskDbAdapter`, `memory` (prefetch/recall/search/…), `classifyAgentMode`, `rpc` frames, `sessionContext` (persona + memory injection). Type declarations included (`app/electron/sdk/index.d.ts`).

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Windows Native

| 能力 | 说明 |
|---|---|
| **托盘菜单** | 显示/隐藏窗口、新建会话、**新建任务**（直接打开 TaskPanel）；托盘点击切换显隐。 |
| **全局快捷键** | `Ctrl+Alt+A` 唤出主窗口（未启动则创建）；注册结果写入启动日志。 |
| **`aetherai://` 协议** | `aetherai://new` / `chat` 新建会话；`aetherai://tui` 提示终端形态；`aetherai://open/?path=<编码路径>` 把文件夹设为工作区并新建会话（右键"用 Aether 打开"链路）。 |
| **右键注册** | `app/resources/register-protocol.reg`（替换 `<AETHER_EXE>` 后管理员导入）：`.cs/.js/.ts/.tsx/.md/.json` + 文件夹 → 右键"用 Aether 打开"。 |
| **终端引导** | `app/resources/term/aether.ps1`（别名 + 启动 `aether tui`）；`node app/cli.js --setup-term` 写入 Windows Terminal profile（深/浅两套配色）。 |
| **沙箱强化** | Windows 路径防御：`\\?\` 长路径、UNC `\\server\share`、重解析点/junction 逃逸、`.lnk/.scr/.msi` 等危险扩展名。 |

---

## Project Structure

```
app/
├── electron/              # main process (Node)
│   ├── database.js        # better-sqlite3 data layer — 25+ tables (WAL)
│   ├── ipc/               # IPC handlers (chat / arena / session / mcp / ...)
│   │   ├── chat.handler.js    # THE central handler (540 lines)
│   │   ├── arena.handler.js   # Multi-model arena with ELO
│   │   ├── agent.handler.js   # Workspace management
│   │   └── ...
│   ├── llm/               # LLM abstraction (~3,700 lines, 19 files)
│   │   ├── providerAdapter.js # Dispatch by api_format (openai/anthropic)
│   │   ├── openaiAdapter.js   # OpenAI-compatible SSE streaming + retry
│   │   ├── anthropicAdapter.js# Anthropic Messages API
│   │   ├── credentialPool.js  # Multi-key rotation + cooldown
│   │   ├── toolLoop.js        # Plan-Act-Observe with iteration budget
│   │   ├── planning.js        # Hierarchical task decomposition
│   │   ├── subAgent.js        # Parallel sub-agent delegation
│   │   ├── compaction.js      # Context compaction (pair-preserving)
│   │   ├── autoMemory.js      # Long-term structured memory
│   │   ├── habitLearner.js    # Recurring preference -> auto-skills
│   │   ├── hooks.js           # 10-point extensibility hooks
│   │   ├── skills.js          # SKILL.md loader (Claude Code format)
│   │   ├── modelAdvisor.js    # Heuristic model suggestion
│   │   ├── toolCallRepair.js  # Malformed tool-call recovery
│   │   ├── auditLog.js        # Per-turn agent execution trace
│   │   └── ...
│   ├── tools/             # built-in tool registry + sandbox
│   │   ├── registry.js       # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js        # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # MCP client + server manager
│   ├── main.js / preload.js
├── src/                   # renderer (React + TS + Zustand)
│   ├── store/index.ts     # Zustand global state (~1,000 lines)
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 locales) / theme / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, ...)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 43 |
| Frontend | React 18.3 + TypeScript 5.8 |
| State | Zustand 4.5 |
| Build | Vite 8 + electron-builder |
| Database | better-sqlite3 (native SQLite, WAL mode) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |

---

## Acknowledgements

AetherAI stands on the shoulders of these projects — their ideas shaped the architecture and UX:

### Agent frameworks

| Project | Inspiration |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent permission model, thinking slider, tool-call visualization, sub-agent delegation, hooks |
| [OpenClaw](https://github.com/openclaw/openclaw) | Context compaction, tool-call loop detection, event-stream architecture |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Iteration budget, structured long-term memory, autonomous skills |
| [OpenAI Codex](https://github.com/openai/codex) | Sandboxing, context compression, tool-call repair |
| [DS4](https://github.com/antirez/ds4) | Hierarchical task decomposition |

### UI & UX

| Project | Inspiration |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva copy-paste component methodology |
| [Magic UI](https://github.com/magicuidesign/magicui) | Animation patterns (shimmer, blur-fade) |

### Infrastructure

| Project | Inspiration |
|---|---|
| [Dify](https://github.com/langgenius/dify) | Multi-format provider normalization |
| [MCP](https://modelcontextprotocol.io) | The spec AetherAI's agent speaks |
| [cc-switch](https://github.com/farion1231/cc-switch) | Usage-stats dashboard layout |
| [new-api](https://github.com/QuantumNous/new-api) | Reasoning-effort relay, usage/cost tracking |
| [Continue](https://github.com/continuedev/continue) | Config-as-source-of-truth, provider abstraction |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Multi-turn agent execution, sandboxed tool execution |
| [Aider](https://github.com/Aider-AI/aider) | LLM coding-assistant tool loop, git integration |
| [Cline](https://github.com/cline/cline) | IDE-embedded agent, MCP integration, permission UX |

### Comparative analysis

A competitive analysis of AetherAI vs [SonettoHere](https://github.com/Miso2233/SonettoHere) — positioning, architecture, engineering quality, growth potential, and more — is available at [competitive-analysis.md](./docs/competitive-analysis.md).

---

## Contributing

All contributions are welcome! Whether it's a bug fix, feature request, translation improvement, or documentation update — please open an issue or submit a PR.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -am 'Add feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## License

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>