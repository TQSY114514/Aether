<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**A local-first, multi-model desktop AI workbench · Electron + React + TypeScript**

![status](https://img.shields.io/badge/status-beta-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

> **Status: beta.** AetherAI is a solo/hobby project. It works, but expect rough
> edges. Bug reports are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and
> [SECURITY.md](./SECURITY.md).

AetherAI unifies multiple LLM providers (OpenAI / Claude / DeepSeek / local models / any OpenAI-compatible endpoint) into one desktop app — with an agent that can read/write files and run commands, a workspace sandbox, multi-model arena with ELO voting, skills, and 15 UI languages. Everything is stored locally — your API keys and conversations never leave your machine except to the providers you configure.

## ✨ Features

- **Multi-provider abstraction** — a single adapter layer; adding a provider format means one file. Currently OpenAI-compatible (covers OpenRouter, Together, DeepSeek, Ollama's OpenAI shim, LM Studio, …).
- **Concurrent multi-session streaming** — one chat can stream while you keep talking in another.
- **Arena ⭐** — one prompt, multiple models answer **concurrently**; vote for the best and an **ELO leaderboard** updates automatically. Models are scored **per intent** (coding / math / translation / summary / general) and the best model for each task type is auto-routed. *No other local-first desktop chat app ships a built-in multi-model arena with ELO.*
- **Personas** — system-prompt presets, switchable per session.
- **Attachments** — text files are injected as context; images go multimodal (needs a vision model).
- **Long-paste collapse** — pasting hundreds of lines auto-collapses into an expandable snippet (ChatGPT-style).
- **Agent (function calling)** — 16 built-in tools (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`, `use_skill`, `ask_user`, `todo_write`) with a Plan→Act→Observe loop, live reasoning trace + task checklist, loop detection, per-tool timeouts, a configurable iteration budget (default 25 rounds), and context compaction.
- **Agent permission modes** — a clear risk-ascending ladder:
  - **Off** — plain chat, no tools.
  - **Plan** — read-only tools (investigate without changes).
  - **Ask** — confirm each risky action (recommended).
  - **Auto** — run everything, no confirms, but **inside the workspace sandbox**.
  - **Yolo** — ⚠️ FULL permission, NO sandbox (writes any path, runs any command). Warned on enable.
- **Workspace sandbox** — `write_file`/`edit_file` are refused outside the configured workspace root; `run_command` blocks destructive patterns (format, `rm -rf /`, shutdown, download-and-execute). Configurable in Settings → Agent & Safety. Yolo mode bypasses it.
- **Skills** (Claude-Code `SKILL.md` format) — drop a folder into `<workspace>/.claude/skills/` and the model loads it on demand via the `use_skill` tool. Ships with `release-checklist` and `git-commit` built-in examples. Reusable with the public skill corpus.
- **Context compaction** — long conversations auto-summarize older history (tool-call/result pairs kept intact; identifiers like UUIDs/paths/IPs preserved verbatim) so chats don't 400 on context length.
- **Auto long-term memory** — before each turn, relevant memories from past chats are injected as context; after the turn, key facts are extracted and saved automatically. The agent recalls your preferences/decisions across sessions without manual note-taking. Toggleable in Settings → Agent.
- **MCP support** — connect external stdio MCP servers; their tools merge with the built-ins automatically.
- **Thinking-effort slider** — real params: OpenAI o-series / gpt-5 / Claude (via relay) → `reasoning_effort`. Only effective on reasoning models (o1/o3/o4/gpt-5/claude/deepseek-r/qwQ); other models ignore it.
- **Sidebar summaries** — titles are model-generated topic phrases (e.g. "New Eiyuu Angel pull advice"), not copied text.
- **Advanced settings** — max tokens, temperature, top_p, custom system prefix, per-language auto-titles, default thinking effort.
- **Custom background** — upload an image with opacity / blur controls.
- **15 UI languages** — English (standard + upside-down), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Themes** — Light / Dark / Blue / Glass / Retro.
- **Auto-update** — the NSIS installer checks for new releases on launch and updates in-app (Settings → Updates). Portable builds check too but install manually.
- **Local storage** — all data in a local SQLite database; nothing is uploaded.

## 🚀 Quick start

### Windows — prebuilt (recommended)
Download the latest [Release](https://github.com/TQSY114514/AetherAI/releases):
- **`AetherAI-Setup-x.y.z.exe`** — NSIS installer. Installs per-user (no admin), auto-updates in-app (Settings → Updates → Check now). Recommended.
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

## 📁 Project structure

```
app/
├── electron/              # main process (Node)
│   ├── database.js        # SQLite (sql.js) data layer
│   ├── ipc/               # IPC handlers (chat / arena / session / mcp / ...)
│   ├── llm/               # LLM abstraction
│   │   ├── providerAdapter.js   # dispatcher by api_format
│   │   ├── openaiAdapter.js     # OpenAI-compatible impl
│   │   ├── reasoning.js         # thinking-effort param builder
│   │   ├── toolLoop.js          # function-calling loop
│   │   └── toolArgs.js          # tool-arg parsing
│   ├── tools/             # built-in tool registry
│   ├── mcp/               # MCP client + manager
│   ├── main.js / preload.js
├── src/                   # renderer (React + TS)
│   ├── store/index.ts     # zustand global state
│   ├── components/        # UI (chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n (15 locales) / theme / markdown
│   └── types/
└── package.json
```

## 🔒 Privacy

**All data is stored locally.** AetherAI collects nothing and uploads nothing about you. Your API keys, conversations, and personas live in a local SQLite database. The only outbound network requests are to the LLM providers you configure.

> ⚠️ Before pushing to GitHub, make sure `.gitignore` excludes `*.db`, `dist/`, `node_modules/`, `background.img`, and any `.env`.

## 🙏 Acknowledgements

AetherAI stands on the shoulders of these projects — their ideas shaped the architecture and UX:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — agent permission model, thinking-effort slider, tool-call visualization, the new-chat empty state, sub-agent delegation.
- [Continue](https://github.com/continuedev/continue) — declarative config-as-source-of-truth, provider abstraction, function-calling protocol.
- [Dify](https://github.com/langgenius/dify) — multi-format provider normalization patterns.
- [Model Context Protocol](https://modelcontextprotocol.io) — the MCP spec AetherAI's agent speaks.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — the `cn()` / `cva` copy-paste component methodology.
- [Magic UI](https://github.com/magicuidesign/magicui) — animation patterns (streaming text, shimmer, blur-fade).
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) — multi-turn agent execution, sandboxed tool execution, and the Plan→Act→Observe loop.
- [Aider](https://github.com/Aider-AI/aider) — pioneered the LLM coding-assistant tool loop and git integration patterns.
- [Cline](https://github.com/cline/cline) — IDE-embedded agent patterns, MCP tool integration, permission dialog UX.
- [new-api](https://github.com/QuantumNous/new-api) — reasoning-effort relay conversion reference, usage/cost tracking.
- [OpenClaw](https://github.com/openclaw/openclaw) — context compaction (pair-preserving split, identifier retention), before-tool-call loop detection, README polish.
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — iteration budget pattern, structured long-term memory.
- [DS4](https://github.com/antirez/ds4) — hierarchical task decomposition before execution.
- [cc-switch](https://github.com/farion1231/cc-switch) — usage-statistics dashboard layout (cost/cache/trend/provider/model breakdown).

## 📋 Changelog

### v0.1.21
**Performance**
- Store: collapse 8+ scattered `get()` calls into a single destructuring
- chat.handler.js: cache 5 rarely-changing settings — eliminates repeated sql.js reads
- ChatWindow: StreamingBubble receives isAtBottom prop, skips scroll when reading history
- database.js: async writeFile (was writeFileSync blocking during streaming)

### v0.1.20
**Performance & fixes**
- autoMemory.js: in-memory cache with version invalidation
- database.js: await flushDatabase (was fire-and-forget, could lose data on crash)
- Move user_habit CREATE TABLE to init (was re-issued every turn)
- Remove dead CLAUDE_BUDGETS constant

### v0.1.19
**Bug fixes & refactor**
- **Critical**: MessageBubble search highlight now works for assistant messages
- ChatWindow search: 200ms debounce
- DRY up chat.send params (chatSendBase + clearStreamingOnError helpers)
- Removed duplicate config loading in ChatPage.tsx

### v0.1.18
**Performance**
- StreamingBubble: rAF-throttled scroll + content-length guard
- ContextBar: memoized token estimation
- ChatPage/ChatInput: useMemo for model-group computation
- Sidebar: date boundaries as timestamps
- i18n `t()`: fast path for English

### v0.1.17
**Agent & UX**
- Auto long-term memory + habit learner
- ChatWindow streaming perf: direct DOM writes
- toolLoop heartbeat + error classify improvements

### v0.1.16
**Fixes**
- Purged diagnostic logs, fixed 12 bugs

## 📄 License

MIT
