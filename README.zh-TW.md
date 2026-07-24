<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**本地優先的多模型桌面 AI 對話客戶端 · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **狀態：測試版（beta）。** AetherAI 是個人/業餘專案,能用,但會有粗糙之處。歡迎提 bug——見 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [SECURITY.md](./SECURITY.md)。


AetherAI 將多家 LLM 服務供應商（OpenAI / Claude / DeepSeek / 本地模型 / 任何相容 OpenAI 的端點）整合於單一桌面應用。所有資料皆儲存於本地——您的 API 金鑰與對話內容絕不會離開您的裝置，除非送往您所設定的供應商。

## 📑 Table of Contents

- [✨ 功能特色](#-功能特色)
  - [🖥️ 聊天](#️-chat)
  - [🤖 Agent（函式呼叫）](#-agent函式呼叫)
  - [🔒 隱私](#-privacy)
- [🚀 快速開始](#-快速開始)
- [📁 專案結構](#-專案結構)
- [🗺️ 路線圖](#️-路線圖)
- [🤝 鳴謝](#-鳴謝)
- [📋 Changelog](#-changelog)
- [📄 授權](#-授權)

---

## ✨ 功能特色

### 🖥️ 聊天

- **多供應商抽象層** — 統一的介接層；新增一種供應商格式只需一個檔案。目前支援 OpenAI 相容格式（涵蓋 OpenRouter、Together、DeepSeek、Ollama 的 OpenAI shim、LM Studio 等）。
- **多會話並行串流** — 一個對話可持續串流的同時，您仍能在另一個對話中繼續交談。
- **Arena** — 同一則提示，多個模型同時作答；為最佳回答投票，ELO 排行榜自動更新。
- **人設** — 系統提示預設組，可逐會話切換。
- **附件** — 文字檔案注入為上下文；圖片走多模態處理（需視覺模型）。
- **長貼上摺疊** — 貼上數百行文字會自動摺疊為可展開的片段（ChatGPT 風格）。
- **思考強度滑桿** — 對應真實參數：OpenAI o 系列 → `reasoning_effort`，Claude → `thinking.budget_tokens`。
- **側欄摘要** — 標題為模型生成的主題詞組（如「新英雄天使抽卡建議」），而非複製的原文。
- **進階設定** — max tokens、temperature、top_p、自訂系統前綴、各語言自動標題。
- **自訂背景** — 上傳圖片並可調整透明度 / 模糊度。
- **15 種介面語言** — English（標準 + 上下顛倒）、中文（简体/繁體/文言）、日本語、español、français、Deutsch、português、русский、українська、العربية（RTL）、हिन्दी、한국어。
- **主題** — Light / Dark / Blue / Glass / Retro。

### 🤖 Agent（函式呼叫）

- **內建 13 項工具**（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`），採 Plan→Act→Observe 迴圈並即時顯示推理過程。
- **Agent 權限模式** — 關閉 / 詢問（每次具風險工具皆須確認）/ 自動（全部允許）/ 計畫（唯讀）。對應程式設計 Agent 的權限模型。
- **MCP 支援** — 連接外部 stdio MCP 伺服器；其工具自動與內建工具合併。
- **Tool call repair** — LLMs 偶爾會產生格式錯誤的 JSON；agent 迴圈會在執行前自動修復缺失的參數、未加引號的鍵和被截斷的呼叫。

---

## 🚀 快速開始

### 環境需求
- Node.js 18+
- npm 9+

### 安裝與執行
```bash
cd app
npm install
npm run dev      # 開發模式（熱重載）
npm run build    # 建置正式版前端
npm start        # 啟動 Electron
```

或於 Windows 上執行專案根目錄的 `start.bat`。

### 設定您的第一個供應商
1. 啟動後，點擊側欄的 **Models**。
2. 新增一個供應商（名稱 / API URL / API Key）。
3. 點擊 **Fetch models** 拉取可用模型清單。
4. 回到對話頁面即可開始交談。

---

## 📁 專案結構

```
app/
├── electron/              # 主程序（Node）
│   ├── database.js        # SQLite（sql.js）資料層
│   ├── ipc/               # IPC 處理器（chat / arena / session / mcp / ...）
│   ├── llm/               # LLM 抽象層
│   │   ├── providerAdapter.js   # 依 api_format 分派
│   │   ├── openaiAdapter.js     # OpenAI 相容實作
│   │   ├── reasoning.js         # 思考強度參數建構器
│   │   ├── planning.js          # hierarchical task decomposition (DS4-inspired)
│   │   ├── toolLoop.js          # Plan→Act→Observe function-calling loop
│   │   ├── subAgent.js          # parallel sub-agent delegation
│   │   ├── compaction.js        # Context compaction (pair-preserving)
│   │   ├── autoMemory.js        # structured long-term memory (Hermes-inspired)
│   │   ├── habitLearner.js      # Recurring preference → auto-skills
│   │   ├── hooks.js             # 10-point extensibility hooks
│   │   ├── skills.js            # SKILL.md loader (Claude Code format)
│   │   ├── modelAdvisor.js      # Heuristic model suggestion
│   │   ├── toolCallRepair.js    # Malformed tool-call recovery
│   │   ├── auditLog.js          # Per-turn agent execution trace
│   │   └── ...
│   ├── tools/             # 內建工具註冊表
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # MCP 客戶端 + 管理器
│   ├── main.js / preload.js
├── src/                   # 渲染程序（React + TS）
│   ├── store/index.ts     # zustand 全域狀態
│   ├── components/        # 介面（chat / sidebar / settings / ui）
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n（15 種語系）/ theme / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, …)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

## 🗺️ 路線圖

| Milestone | Status | Description |
|-----------|--------|-------------|
| v0.5 — Agent foundation | ✅ | Tool loop, planning, sandbox, permissions, hooks |
| v0.6 — Memory & Skills | ✅ | Auto memory, habit learner, slash commands, tool repair |
| v0.7 — Quality & Polish | 🔄 | Error boundaries, perf profiling, test coverage |
| v0.8 — Multi-model polish | ⬜ | Arena UX, ELO calibration, intent-based routing |
| v0.9 — Plugins & Extensibility | ⬜ | Skill marketplace, hook sharing, plugin SDK |
| v1.0 — Stable release | ⬜ | Signed installer, auto-update, changelog generation |

---

## 🤝 鳴謝

AetherAI 立於前人之肩——下列專目的理念形塑了本作的架構與使用體驗：

- [Claude Code](https://github.com/anthropics/claude-code) — Agent 權限模型、思考強度滑桿、工具呼叫視覺化、新對話空狀態。
- [Continue](https://github.com/continuedev/continue) — 宣告式「組態即真相」、供應商抽象層、函式呼叫協定。
- [Dify](https://github.com/langgen/dify) — 多格式供應商正規化模式。
- [Model Context Protocol](https://modelcontextprotocol.io) — AetherAI Agent 所使用之 MCP 規範。
- [shadcn/ui](https://github.com/shadcn-ui/ui) — cn() / cva 複製貼上元件方法論。
- [Magic UI](https://github.com/magicuidesign/magicui) — 動畫模式（串流文字、微光、模糊淡入）。
- [new-api](https://github.com/QuantumNous/new-api) — 推理強度中繼轉換之參考。
- [OpenClaw](https://github.com/openclaw/openclaw) — README 潤飾與入門啟發。
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

---

## 📋 Changelog

### v0.5.1

**Agent system upgrade**
- Tool execution modes: `parallel` vs `sequential` per-tool (OpenClaw pattern)
- Tool lifecycle hooks: `prepareArguments` → `beforeToolCall` → execute → `afterToolCall`
- Tool call repair: auto-fix malformed JSON / missing args / truncated calls
- Hook system extended: `SessionStart`, `SessionEnd`, `SubagentStop`
- Context compaction: pair-preserving split (tool-call/result pairs kept intact)
- Slash commands: 6 built-in commands (`/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate`)
- Lazy-loaded i18n: 13 language files loaded on demand

---

## 📄 授權

MIT

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
