<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

---

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Status: Beta.** AetherAI is a solo/hobby project. It works, but expect rough
> edges. Bug reports are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and
> [SECURITY.md](./SECURITY.md).

Unify multiple LLM providers — OpenAI / Claude / DeepSeek / local models / any OpenAI-compatible endpoint — into one desktop app. An agent that reads/writes files and runs commands, a workspace sandbox, multi-model arena with ELO voting, skills, and 15 UI languages. Everything stored locally: API keys and conversations never leave your machine except to the providers you configure.

---

## 🎯 What makes AetherAI different

AetherAI combines several capabilities that are typically spread across multiple tools into one local desktop app:

| Capability | Description | Maturity |
|---|---|:---:|
| **Multi-provider Chat** | Switch between OpenAI, Claude, DeepSeek, and any OpenAI-compatible endpoint mid-conversation. | `Stable` |
| **Agent Tool Loop** | 16 built-in tools with Plan-Act-Observe loop, sandboxing, permission ladder. | `Beta` |
| **Multi-model Arena** | Send one prompt to multiple models, vote on the best, track ELO rankings. | `Beta` |
| **Skills & Extensibility** | Drop-in `SKILL.md` files, MCP servers, 10-point hook system. | `Experimental` |
| **Structured Memory** | Agent recalls preferences and past decisions across sessions. | `Beta` |
| **Hierarchical Planning** | Complex requests auto-decompose into parallel sub-tasks. | `Experimental` |
| **Context Compaction** | Long conversations auto-summarize without losing tool-call pairs. | `Beta` |
| **Local-First Privacy** | Conversations, keys, personas in local SQLite. Nothing leaves your machine. | `Stable` |
| **15 UI Languages** | Including Classical Chinese (文言) and RTL Arabic. | `Beta` |
| **MIT Licensed** | Fully open source. | `Stable` |

---

## ✨ Features

**Status labels:** `Stable` = daily-use ready, `Beta` = usable with known rough edges, `Experimental` = new/advanced behavior may change, `Planned` = documented roadmap item.

### 🖥️ Chat

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

### 🤖 Agent (Function Calling)

- `Beta` **16 built-in tools** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) with a Plan-Act-Observe loop, live reasoning trace + task checklist, loop detection, per-tool timeouts, configurable iteration budget (default 25 rounds), and context compaction.
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

### 🧠 Memory & Learning

- `Beta` **Auto long-term memory** — relevant memories injected before each turn; key facts extracted and saved automatically. Toggleable in Settings - Agent.
- `Experimental` **Habit learner** — detects recurring preferences (e.g. "always use Claude") and proposes auto-applied skills.
- `Beta` **Audit log** — per-turn agent execution trace for debugging.

### 🏟️ Arena

- `Beta` **Multi-model arena** — one prompt, multiple models answer **concurrently**; vote for the best and an **ELO leaderboard** updates automatically. Models are scored **per intent** (coding / math / translation / summary / general). *No other local-first desktop chat app ships a built-in multi-model arena with ELO.*

### 🛠️ Skills & Extensibility

| Component | Format | Status | Details |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | Drop into `<workspace>/.claude/skills/`; ships with `release-checklist` and `git-commit` |
| **Slash Commands** | `CMD.md` | `Stable` | 6 built-in: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `Experimental` | 10 lifecycle points: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | External MCP servers merge with built-in tools automatically |

### ⚙️ Customization

| Setting | Status | Description |
|---|:---:|---|
| **Advanced model settings** | `Stable` | Max tokens, temperature, top_p, custom system prefix, per-language auto-titles, thinking effort |
| **Custom background** | `Stable` | Upload image with opacity / blur controls |
| **Personas** | `Stable` | System-prompt presets, switchable per session |
| **Themes** | `Stable` | Light / Dark / Blue / Glass / Retro |
| **15 UI languages** | `Beta` | English, Chinese (简/繁/文言), Japanese, Spanish, French, German, Portuguese, Russian, Ukrainian, Arabic (RTL), Hindi, Korean |
| **Auto-update** | `Beta` | NSIS installer checks on launch; portable checks too (manual install) |
| **Usage tracking** | `Beta` | Per-API-call log with tokens, cost, latency, cache hit rate |

### 🔒 Privacy

> **All data stays local.** AetherAI collects nothing and uploads nothing about you. Your API keys, conversations, and personas live in a local SQLite database. The only outbound network requests go to the LLM providers you configure.

---

## 📸 Screenshots

> Capture screenshots under `assets/screenshots/` and update the paths below.

| Flow | Preview |
|---|:---:|
| Chat streaming | `assets/screenshots/chat-streaming.gif` — _TODO_ |
| Agent tool execution | `assets/screenshots/agent-tool-execution.gif` — _TODO_ |
| Arena voting | `assets/screenshots/arena-voting.gif` — _TODO_ |
| Provider settings | `assets/screenshots/provider-settings.png` — _TODO_ |

---

## 📦 Download

### Windows — Prebuilt (Recommended)

Download the latest [Release](https://github.com/TQSY114514/AetherAI/releases):

| Build | Description |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS installer. Per-user (no admin), auto-updates in-app. **Recommended.** |
| **`AetherAI-x.y.z.exe`** | Portable single-exe. No install, no auto-update; just run it. |

> The installer shows a SmartScreen "unknown publisher" warning on first launch — expected for an unsigned solo app. All data stays local.

---

## 🚀 Quick Start

### Install from source

**Prerequisites:** Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

Or run `start.bat` at the repo root on Windows.

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

## 📁 Project Structure

```
app/
├── electron/              # main process (Node)
│   ├── database.js        # SQLite (sql.js) data layer — 14 tables
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

## 🔑 Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 31 |
| Frontend | React 18.3 + TypeScript 5.5 |
| State | Zustand 4.5 |
| Build | Vite 5.4 + electron-builder |
| Database | sql.js (SQLite in-memory, persisted to disk) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |

---

## 🤝 Acknowledgements

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

---

## 🤝 Contributing

All contributions are welcome! Whether it's a bug fix, feature request, translation improvement, or documentation update — please open an issue or submit a PR.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -am 'Add feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#-aetherai)

</div>
