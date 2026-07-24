<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**A local-first, multi-model desktop AI workbench · Electron + React + TypeScript**

[![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=social)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=social)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing) [![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat-square)](https://github.com/TQSY114514/AetherAI/issues) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]() [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)]() [![electron](https://img.shields.io/badge/electron-31-4781ff.svg)]() [![i18n](https://img.shields.io/badge/i18n-15%20languages-blue.svg)]() [![tools](https://img.shields.io/badge/agent-16%20tools-green.svg)]() [![mcp](https://img.shields.io/badge/MCP-supported-purple.svg)]()

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **Status: beta.** AetherAI is a solo/hobby project. It works, but expect rough
> edges. Bug reports are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and
> [SECURITY.md](./SECURITY.md).

Unify multiple LLM providers — OpenAI / Claude / DeepSeek / local models / any OpenAI-compatible endpoint — into one desktop app. An agent that reads/writes files and runs commands, a workspace sandbox, multi-model arena with ELO voting, skills, and 15 UI languages. Everything stored locally: API keys and conversations never leave your machine except to the providers you configure.

## ⚡ Why AetherAI?

| Feature | AetherAI | ChatGPT Desktop | Claude Code | Continue |
|---------|----------|-----------------|-------------|----------|
| **Local-first** | Full local SQLite, no cloud sync | Minimal local data | CLI, config local | Config local |
| **Multi-provider in one chat** | ✅ Switch providers mid-conversation | ❌ OpenAI only | ❌ Anthropic only | ✅ Multi-provider |
| **Built-in Agent (tool loop)** | ✅ 16 tools + sandbox + permissions | ❌ | ✅ (limited tools) | ✅ |
| **Multi-model Arena + ELO** | ✅ Vote & rank models | ❌ | ❌ | ❌ |
| **Skills system** | ✅ SKILL.md format | ❌ | ✅ SKILL.md | ✅ |
| **Hooks (10 points)** | ✅ Pre/post tool, compact, etc. | ❌ | ✅ | ✅ |
| **Context compaction** | ✅ Pair-preserving | ❌ | ❌ | ❌ |
| **MCP support** | ✅ stdio JSON-RPC 2.0 | ❌ | ❌ | ❌ |
| **Sub-agent delegation** | ✅ Parallel | ❌ | ❌ | ❌ |
| **Auto long-term memory** | ✅ Structured, decay-aware | ❌ | ❌ | ❌ |
| **Planning** | ✅ Hierarchical (DS4) | ❌ | ❌ | ❌ |
| **Permission modes** | ✅ 5 modes (off/plan/ask/auto/yolo) | ❌ | ✅ | ✅ |
| **15 UI languages** | ✅ incl.文言, RTL Arabic | Limited | English | Limited |
| **Platform** | Windows (macOS/Linux planned) | Win/Mac | CLI (cross) | VS Code/IDE |
| **Open source** | ✅ MIT | ❌ | ❌ | ✅ MIT |

> AetherAI combines the agent power of Claude Code, the multi-provider flexibility of Continue, and adds a unique local-first desktop experience with arena voting, structured memory, and deep customization — all in one app.

---

## 📑 Table of Contents

- [✨ Features](#-features)
  - [🖥️ Chat](#️-chat)
  - [🤖 Agent (Function Calling)](#-agent-function-calling)
  - [🧠 Memory & Learning](#-memory--learning)
  - [🏟️ Arena](#️-arena)
  - [🛠️ Skills & Extensibility](#️-skills--extensibility)
  - [⚙️ Customization](#️-customization)
  - [🔒 Privacy](#-privacy)
- [⚡ Why AetherAI?](#-why-aetherai)
- [🚀 Quick Start](#-quick-start)
  - [Windows — prebuilt (recommended)](#windows--prebuilt-recommended)
  - [Build from source](#build-from-source)
  - [Configure your first provider](#configure-your-first-provider)
- [📁 Project Structure](#-project-structure)
- [🔑 Tech Stack](#-tech-stack)
- [🤝 Acknowledgements](#-acknowledgements)
- [📄 License](#-license)

---

## ✨ Features

### 🖥️ Chat

- **Multi-provider abstraction** — a single adapter layer; adding a provider format means one file. Currently OpenAI-compatible (covers OpenRouter, Together, DeepSeek, Ollama's OpenAI shim, LM Studio, …).
- **Concurrent multi-session streaming** — one chat can stream while you keep talking in another.
- **Thinking-effort slider** — real params: OpenAI o-series / gpt-5 / Claude (via relay) → `reasoning_effort`. Only effective on reasoning models (o1/o3/o4/gpt-5/claude/deepseek-r/qwQ); other models ignore it.
- **Attachments** — text files are injected as context; images go multimodal (needs a vision model).
- **Long-paste collapse** — pasting hundreds of lines auto-collapses into an expandable snippet (ChatGPT-style).
- **Message editing** — overwrite + regenerate from any point.
- **Message search** — with highlighting across all messages.
- **Sidebar summaries** — titles are model-generated topic phrases (e.g. "New Eiyuu Angel pull advice"), not copied text.

### 🤖 Agent (Function Calling)

- **16 built-in tools** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) with a Plan→Act→Observe loop, live reasoning trace + task checklist, loop detection, per-tool timeouts, a configurable iteration budget (default 25 rounds), and context compaction.
- **Hierarchical planning** — auto-generates task breakdown for complex requests (DS4-inspired).
- **Sub-agent delegation** — independent sub-tasks run in parallel via `delegate_task`.
- **Permission modes** — a clear risk-ascending ladder:
  - **Off** — plain chat, no tools.
  - **Plan** — read-only tools (investigate without changes).
  - **Ask** — confirm each risky action (recommended).
  - **Auto** — run everything, no confirms, but **inside the workspace sandbox**.
  - **Yolo** — FULL permission, NO sandbox (writes any path, runs any command). Warned on enable.
- **Workspace sandbox** — `write_file`/`edit_file` are refused outside the configured workspace root; `run_command` blocks destructive patterns (format, `rm -rf /`, shutdown, download-and-execute). Configurable in Settings → Agent & Safety. Yolo mode bypasses it.
- **Context compaction** — long conversations auto-summarize older history (tool-call/result pairs kept intact; identifiers like UUIDs/paths/IPs preserved verbatim) so chats don't 400 on context length.
- **Tool call repair** — LLMs occasionally produce malformed JSON; the agent loop auto-repairs missing args, unquoted keys, and truncated calls before execution.

### 🧠 Memory & Learning

- **Auto long-term memory** — before each turn, relevant memories from past chats are injected as context; after the turn, key facts are extracted and saved automatically. The agent recalls your preferences/decisions across sessions without manual note-taking. Toggleable in Settings → Agent.
- **Habit learner** — detects recurring preferences (e.g. "always use Claude") and proposes auto-applied skills.
- **Audit log** — per-turn agent execution trace for debugging.

### 🏟️ Arena

- **Multi-model arena** — one prompt, multiple models answer **concurrently**; vote for the best and an **ELO leaderboard** updates automatically. Models are scored **per intent** (coding / math / translation / summary / general) and the best model for each task type is auto-routed. *No other local-first desktop chat app ships a built-in multi-model arena with ELO.*

### 🛠️ Skills & Extensibility

- **Skills** (Claude-Code `SKILL.md` format) — drop a folder into `<workspace>/.claude/skills/` and the model loads it on demand via the `use_skill` tool. Ships with `release-checklist` and `git-commit` built-in examples.
- **Slash commands** — 6 built-in commands (`/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate`) in `CMD.md` format.
- **Hooks** — extend the agent lifecycle with custom scripts at 10 points: `PreToolUse`, `PostToolUse`, `ToolError`, `PreCompact`, `PostCompact`, `PreSend`, `PostResponse`, `SessionStart`, `SessionEnd`, `SubagentStop`.
- **MCP support** — connect external stdio MCP servers; their tools merge with the built-ins automatically.

### ⚙️ Customization

- **Advanced settings** — max tokens, temperature, top_p, custom system prefix, per-language auto-titles, default thinking effort.
- **Custom background** — upload an image with opacity / blur controls.
- **Personas** — system-prompt presets, switchable per session.
- **Themes** — Light / Dark / Blue / Glass / Retro.
- **15 UI languages** — English (standard + upside-down), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Auto-update** — the NSIS installer checks for new releases on launch and updates in-app (Settings → Updates). Portable builds check too but install manually.
- **Usage tracking** — per-API-call log with token count, cost, latency, cache hit rate breakdown.

### 🔒 Privacy

**All data is stored locally.** AetherAI collects nothing and uploads nothing about you. Your API keys, conversations, and personas live in a local SQLite database. The only outbound network requests are to the LLM providers you configure.

---

## 🚀 Quick Start

### Windows — prebuilt (recommended)

Download the latest [Release](https://github.com/TQSY114514/AetherAI/releases):

- **`AetherAI-Setup-x.y.z.exe`** — NSIS installer. Installs per-user (no admin), auto-updates in-app (Settings → Updates → Check now). **Recommended.**
- **`AetherAI-x.y.z.exe`** — portable single-exe. No install, no auto-update; just run it.

> The installer shows a SmartScreen "unknown publisher" warning on first launch — expected for an unsigned solo app. The app itself is safe; all data stays local.

### Build from source

- Node.js 18+, npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # build the production frontend
npm start        # launch Electron
```

Or run `start.bat` at the repo root on Windows.

### Configure your first provider

1. After launch, click **Models** in the sidebar.
2. Add a provider (name / API URL / API Key).
3. Click **Fetch models** to pull the available model list.
4. Go back to chat and start talking.

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
│   │   ├── toolLoop.js        # Plan→Act→Observe with iteration budget
│   │   ├── planning.js        # Hierarchical task decomposition
│   │   ├── subAgent.js        # Parallel sub-agent delegation
│   │   ├── compaction.js      # Context compaction (pair-preserving)
│   │   ├── autoMemory.js      # Long-term structured memory
│   │   ├── habitLearner.js    # Recurring preference → auto-skills
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
├── commands/              # Built-in slash commands (/code, /explain, /polish, …)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## 🔑 Tech Stack

| Layer | Technology |
|-------|-----------|
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

### Agent frameworks that inspired the tool loop

- [Claude Code](https://github.com/anthropics/claude-code) — agent permission model, thinking-effort slider, tool-call visualization, sub-agent delegation, hook system.
- [Continue](https://github.com/continuedev/continue) — declarative config-as-source-of-truth, provider abstraction, function-calling protocol.
- [OpenClaw](https://github.com/openclaw/openclaw) — context compaction (pair-preserving split, identifier retention), tool-call loop detection, event-stream architecture.
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — iteration budget pattern, structured long-term memory, autonomous skill creation.
- [OpenAI Codex](https://github.com/openai/codex) — sandboxing architecture, context compression, tool-call repair, verification stop.
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) — multi-turn agent execution, sandboxed tool execution, and the Plan→Act→Observe loop.
- [Aider](https://github.com/Aider-AI/aider) — pioneered the LLM coding-assistant tool loop and git integration patterns.
- [Cline](https://github.com/cline/cline) — IDE-embedded agent patterns, MCP tool integration, permission dialog UX.
- [DS4](https://github.com/antirez/ds4) — hierarchical task decomposition before execution.

### UI & UX inspiration

- [shadcn/ui](https://github.com/shadcn-ui/ui) — the `cn()` / `cva` copy-paste component methodology.
- [Magic UI](https://github.com/magicuidesign/magicui) — animation patterns (streaming text, shimmer, blur-fade).

### Infrastructure & data

- [Dify](https://github.com/langgenius/dify) — multi-format provider normalization patterns.
- [Model Context Protocol](https://modelcontextprotocol.io) — the MCP spec AetherAI's agent speaks.
- [cc-switch](https://github.com/farion1231/cc-switch) — usage-statistics dashboard layout (cost/cache/trend/provider/model breakdown).
- [new-api](https://github.com/QuantumNous/new-api) — reasoning-effort relay conversion reference, usage/cost tracking.

---

## 📄 License

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#-aetherai)

</div>
