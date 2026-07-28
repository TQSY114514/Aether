<div align="center">

<p align="center">
  <img src="./assets/banner.svg" width="420" alt="AetherAI Banner" />
</p>

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)
---

---

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)


---

> **स्थिति: बीटा।** AetherAI एक व्यक्तिगत/शौकिया परियोजना है। यह काम करता है, लेकिन खुरदरापन होगा। बग रिपोर्ट का स्वागत है — [CONTRIBUTING.md](./CONTRIBUTING.md) और [SECURITY.md](./SECURITY.md) देखें।


AetherAI कई LLM प्रदाताओं (OpenAI / Claude / DeepSeek / स्थानीय मॉडल / कोई भी OpenAI-संगत एंडपॉइंट) को एक ही डेस्कटॉप ऐप में एकीकृत करता है। सब कुछ स्थानीय रूप से संग्रहीत होता है — आपकी API कुंजियाँ और वार्तालाप आपके द्वारा विन्यस्त प्रदाताओं को छोड़कर कहीं और नहीं जाते।

---

## 🎯 AetherAI अलग क्यों है

AetherAI कई capabilities को एक ही local desktop app में जोड़ता है जो आमतौर पर कई tools में फैली होती हैं:

| capability | description | maturity |
|---|---|:---:|
| **Multi-provider Chat** | Switch between OpenAI, Claude, DeepSeek, and any OpenAI-compatible endpoint mid-conversation. | `स्थिर` |
| **Agent Tool Loop** | 16 built-in tools with Plan-Act-Observe loop, sandboxing, permission ladder. | `बीटा` |
| **Multi-model Arena** | Send one prompt to multiple models, vote on the best, track ELO rankings. | `बीटा` |
| **Skills & Extensibility** | Drop-in `SKILL.md` files, MCP servers, 10-point hook system. | `प्रयोगात्मक` |
| **Structured Memory** | Agent recalls preferences and past decisions across sessions. | `बीटा` |
| **Hierarchical Planning** | Complex requests auto-decompose into parallel sub-tasks. | `प्रयोगात्मक` |
| **Context Compaction** | Long conversations auto-summarize without losing tool-call pairs. | `बीटा` |
| **Local-First Privacy** | Conversations, keys, personas in local SQLite. Nothing leaves your machine. | `स्थिर` |
| **15 UI Languages** | Including Classical Chinese (文言) and RTL Arabic. | `बीटा` |
| **MIT Licensed** | Fully open source. | `स्थिर` |

---

## ✨ विशेषताएँ

**Status labels:** `स्थिर` = daily-use ready, `बीटा` = usable with known rough edges, `प्रयोगात्मक` = new/advanced behavior may change, `योजनाबद्ध` = documented roadmap item.

### 🖥️ चैट

| Feature | Status | Description |
|---|:---:|---|
| **Multi-provider** | `स्थिर` | Single adapter layer; adding a provider = one file. Covers OpenRouter, Together, DeepSeek, Ollama, LM Studio, ... |
| **Concurrent streaming** | `स्थिर` | One chat streams while you keep talking in another. |
| **Thinking-effort slider** | `बीटा` | Real params: OpenAI o-series / gpt-5 / Claude via relay. Only effective on reasoning models. |
| **Attachments** | `बीटा` | Text files as context; images for multimodal (needs a vision model). |
| **Long-paste collapse** | `स्थिर` | Hundreds of lines auto-collapse into an expandable snippet (ChatGPT-style). |
| **Message editing** | `स्थिर` | Overwrite + regenerate from any point. |
| **Message search** | `स्थिर` | With highlighting across all messages. |
| **Sidebar summaries** | `बीटा` | Model-generated topic phrases, not copied text. |

### 🤖 एजेंट (function calling)

- `बीटा` **16 built-in tools** (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) with a Plan-Act-Observe loop, live reasoning trace + task checklist, loop detection, per-tool timeouts, configurable iteration budget (default 25 rounds), and context compaction.
- `प्रयोगात्मक` **Hierarchical planning** — auto-generates task breakdown for complex requests (DS4-inspired).
- `प्रयोगात्मक` **Sub-agent delegation** — independent sub-tasks run in parallel via `delegate_task`.
- `स्थिर` **Permission modes** — risk-ascending ladder:

| Mode | Description | Sandbox |
|---|---|:---:|
| **बंद** | Plain chat, no tools | N/A |
| **योजना** | Read-only tools (investigate without changes) | - |
| **पूछें** | Confirm each risky action (recommended) | - |
| **स्वचालित** | Run everything, no confirms | Yes |
| **Yolo** | Full permission, no sandbox | No |

- `स्थिर` **Workspace sandbox** — `write_file`/`edit_file` are refused outside the configured workspace root; `run_command` blocks destructive patterns. Configurable in Settings - Agent & Safety.
- `बीटा` **Context compaction** — auto-summarizes older history (tool-call/result pairs kept intact; identifiers preserved verbatim).
- `बीटा` **Tool call repair** — auto-repairs malformed JSON, missing args, unquoted keys, and truncated calls.

### 🧠 Memory & Learning

- `बीटा` **Auto long-term memory** — relevant memories injected before each turn; key facts extracted and saved automatically. Toggleable in Settings - Agent.
- `प्रयोगात्मक` **Habit learner** — detects recurring preferences (e.g. "always use Claude") and proposes auto-applied skills.
- `बीटा` **Audit log** — per-turn agent execution trace for debugging.

### 🏟️ Arena

- `बीटा` **Multi-model arena** — one prompt, multiple models answer **concurrently**; vote for the best and an **ELO leaderboard** updates automatically. Models are scored **per intent** (coding / math / translation / summary / general). *No other local-first desktop chat app ships a built-in multi-model arena with ELO.*

### 🛠️ Skills & Extensibility

| Component | Format | Status | Details |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `प्रयोगात्मक` | Drop into `<workspace>/.claude/skills/`; ships with `release-checklist` and `git-commit` |
| **Slash Commands** | `CMD.md` | `स्थिर` | 6 built-in: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **Hooks** | Script | `प्रयोगात्मक` | 10 lifecycle points: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `बीटा` | External MCP servers merge with built-in tools automatically |

### ⚙️ Customization

| Setting | Status | Description |
|---|:---:|---|
| **Advanced model settings** | `स्थिर` | Max tokens, temperature, top_p, custom system prefix, per-language auto-titles, thinking effort |
| **Custom background** | `स्थिर` | Upload image with opacity / blur controls |
| **Personas** | `स्थिर` | System-prompt presets, switchable per session |
| **Themes** | `स्थिर` | Light / Dark / Blue / Glass / Retro |
| **15 UI languages** | `बीटा` | English, Chinese (簡/繁/文言), Japanese, Spanish, French, German, Portuguese, Russian, Ukrainian, Arabic (RTL), Hindi, Korean |
| **Auto-update** | `बीटा` | NSIS installer checks on launch; portable checks too (manual install) |
| **Usage tracking** | `बीटा` | Per-API-call log with tokens, cost, latency, cache hit rate |

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
2. Set agent permission mode to **पूछें**.
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

## 🤝 Contributing

All contributions are welcome! Whether it's a bug fix, feature request, translation improvement, or documentation update — please open an issue or submit a PR.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -am 'Add feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 🤝 योगदान

सभी योगदान का स्वागत है! चाहे बग रिपोर्ट हो, फीचर रिक्वेस्ट, अनुवाद सुधार, या दस्तावेज़ी अपडेट — कृपया issue खोलें या PR सबमिट करें।

1. रिपो को फॉक करें
2. फीचर ब्रांच बनाएं (`git checkout -b feat/my-feature`)
3. अपनी चेंजेस कॉमिट करें (`git commit -am 'Add feature'`)
4. ब्रांच पर पुश करें (`git push origin feat/my-feature`)
5. Pull Request खोलें

विस्तृत गाइडलाइन के लिए [CONTRIBUTING.md](./CONTRIBUTING.md) देखें।

---

## 🤝 आभार

AetherAI इन परियोजनाओं के कंधों पर खड़ा है — इनके विचारों ने वास्तुकला और अनुभव को आकार दिया:

- [Claude Code](https://github.com/anthropics/claude-code) — एजेंट अनुमति मॉडल, थिंकिंग-प्रयास स्लाइडर, टूल-कॉल विज़ुअलाइज़ेशन, नई-चैट रिक्त स्थिति।
- [Continue](https://github.com/continuedev/continue) — घोषणात्मक कॉन्फ़िग-एक-सत्य-स्रोत, प्रदाता एब्स्ट्रैक्शन, फ़ंक्शन-कॉलिंग प्रोटोकॉल।
- [Dify](https://github.com/langgen/dify) — बहु-प्रारूप प्रदाता सामान्यीकरण पैटर्न।
- [Model Context Protocol](https://modelcontextprotocol.io) — वह MCP विनिर्देश जिसे AetherAI का एजेंट बोलता है।
- [shadcn/ui](https://github.com/shadcn-ui/ui) — cn() / cva कॉपी-पेस्ट घटक पद्धति।
- [Magic UI](https://github.com/magicuidesign/magicui) — एनिमेशन पैटर्न (स्ट्रीमिंग पाठ, शिमर, ब्लर-फ़ेड)।
- [new-api](https://github.com/QuantumNous/new-api) — रीज़निंग-प्रयास रिले रूपांतरण संदर्भ।
- [OpenClaw](https://github.com/openclaw/openclaw) — README पॉलिश + ऑनबोर्डिंग प्रेरणा।
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

---

## 📄 लाइसेंस

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
