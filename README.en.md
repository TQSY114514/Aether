<div align="center">

# AetherAI

**A multi-model desktop AI chat client · Electron + React**

[English](./README.en.md) · [简体中文](./README.md) · [日本語](./README.ja.md)

</div>

AetherAI is a local-first desktop AI chat app that unifies multiple LLM providers (OpenAI / Claude / DeepSeek / local models, etc.) in a single interface. It supports concurrent multi-session streaming, arena comparison, persona presets, file & image attachments, tool calling (web search / read file), custom backgrounds, thinking-effort control, and more.

## ✨ Features

- **Multi-provider management** — provider/model adapter layer; adding a provider takes one adapter file
- **Concurrent multi-session streaming** — one session streaming doesn't block another
- **Arena** — same prompt answered by multiple models at once; vote for the best, ELO updates automatically
- **Persona** — system-prompt presets, switchable per session
- **Attachments** — text files injected as context, images sent multimodally (needs a multimodal model)
- **Long-paste collapse** — pasting hundreds of lines auto-collapses into an expandable snippet (ChatGPT-style)
- **Tool calling (Agent)** — built-in `read_file` / `web_search` with collapsible tool-call blocks
- **Thinking-effort slider** — real effect: OpenAI o-series → `reasoning_effort`, Claude → `thinking.budget_tokens`
- **Smart sidebar summary** — titles are model-generated topic phrases (e.g. "Gacha pull advice"), not raw copies
- **Custom background** — upload an image + opacity / blur controls
- **Themes** — light / dark / blue / glass / retro
- **i18n** — 中文 / English
- **Local storage** — all data in local SQLite; nothing is uploaded

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Install & Run
```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # build production frontend
npm start        # launch Electron
```

Or run `start.bat` in the project root (Windows).

### Configure your first provider
1. After launch, click "Models" in the sidebar
2. Add a provider (name / API URL / API Key)
3. Click "Fetch Models" to pull the available model list
4. Return to the chat page and start chatting

## 🔒 Privacy

**All data is stored locally.** AetherAI does not collect or upload any user data. Your API keys, chat history, and personas live in a local SQLite database. The only external network requests go to the LLM provider APIs you configure.

> ⚠️ Before pushing to GitHub, make sure `.gitignore` excludes `*.db`, `dist/`, `node_modules/`, etc.

## 📄 License

MIT
