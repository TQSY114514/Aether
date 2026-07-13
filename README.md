<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**A local-first, multi-model desktop AI chat client · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

AetherAI unifies multiple LLM providers (OpenAI / Claude / DeepSeek / local models / any OpenAI-compatible endpoint) into one desktop app. Everything is stored locally — your API keys and conversations never leave your machine except to the providers you configure.

## ✨ Features

- **Multi-provider abstraction** — a single adapter layer; adding a provider format means one file. Currently OpenAI-compatible (covers OpenRouter, Together, DeepSeek, Ollama's OpenAI shim, LM Studio, …).
- **Concurrent multi-session streaming** — one chat can stream while you keep talking in another.
- **Arena** — one prompt, multiple models answer at once; vote for the best and an ELO leaderboard updates automatically.
- **Personas** — system-prompt presets, switchable per session.
- **Attachments** — text files are injected as context; images go multimodal (needs a vision model).
- **Long-paste collapse** — pasting hundreds of lines auto-collapses into an expandable snippet (ChatGPT-style).
- **Agent (function calling)** — 13 built-in tools (`read_file`, `list_dir`, `glob_find`, `grep_search`, `web_search`, `web_fetch`, `write_file`, `edit_file`, `run_command`, `git_status`, `git_diff`, `memory_save`, `memory_list`) with a Plan→Act→Observe loop, live reasoning trace, loop detection, per-tool timeouts, and context compaction.
- **Agent permission modes** — a clear risk-ascending ladder:
  - **Off** — plain chat, no tools.
  - **Plan** — read-only tools (investigate without changes).
  - **Ask** — confirm each risky action (recommended).
  - **Auto** — run everything, no confirms, but **inside the workspace sandbox**.
  - **Yolo** — ⚠️ FULL permission, NO sandbox (writes any path, runs any command). Warned on enable.
- **Workspace sandbox** — `write_file`/`edit_file` are refused outside the configured workspace root; `run_command` blocks destructive patterns (format, `rm -rf /`, shutdown, download-and-execute). Configurable in Settings → Agent & Safety. Yolo mode bypasses it.
- **Skills** (Claude-Code `SKILL.md` format) — drop a folder into `<workspace>/.claude/skills/` and the model loads it on demand via the `use_skill` tool. Ships with `release-checklist` and `git-commit` built-in examples. Reusable with the public skill corpus.
- **Context compaction** — long conversations auto-summarize older history (tool-call/result pairs kept intact; identifiers like UUIDs/paths/IPs preserved verbatim) so chats don't 400 on context length.
- **MCP support** — connect external stdio MCP servers; their tools merge with the built-ins automatically.
- **Thinking-effort slider** — real params: OpenAI o-series / gpt-5 / Claude (via relay) → `reasoning_effort`. Only effective on reasoning models (o1/o3/o4/gpt-5/claude/deepseek-r/qwQ); other models ignore it.
- **Sidebar summaries** — titles are model-generated topic phrases (e.g. "New Eiyuu Angel pull advice"), not copied text.
- **Advanced settings** — max tokens, temperature, top_p, custom system prefix, per-language auto-titles, default thinking effort.
- **Custom background** — upload an image with opacity / blur controls.
- **15 UI languages** — English (standard + upside-down), 中文 (简体/繁體/文言), 日本語, español, français, Deutsch, português, русский, українська, العربية (RTL), हिन्दी, 한국어.
- **Themes** — Light / Dark / Blue / Glass / Retro.
- **Local storage** — all data in a local SQLite database; nothing is uploaded.

## 🚀 Quick start

### Prerequisites
- Node.js 18+
- npm 9+

### Install & run
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

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — agent permission model, thinking-effort slider, tool-call visualization, the new-chat empty state.
- [Continue](https://github.com/continuedev/continue) — declarative config-as-source-of-truth, provider abstraction, function-calling protocol.
- [Dify](https://github.com/langgenius/dify) — multi-format provider normalization patterns.
- [Model Context Protocol](https://modelcontextprotocol.io) — the MCP spec AetherAI's agent speaks.
- [shadcn/ui](https://github.com/shadcn-ui/ui) — the `cn()` / `cva` copy-paste component methodology.
- [Magic UI](https://github.com/magicuidesign/magicui) — animation patterns (streaming text, shimmer, blur-fade).
- [new-api](https://github.com/QuantumNous/new-api) — reasoning-effort relay conversion reference.
- [OpenClaw](https://github.com/openclaw/openclaw) — README polish + onboarding inspiration.

## 📄 License

MIT
