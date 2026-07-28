<div align="center">

<p align="center">
  <img src="./assets/banner.svg" width="512" alt="AetherAI Banner" />
</p>

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)
---

---

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)


[English](./README.md) · [簡體中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)


---

> **狀態：測試版（beta）。** AetherAI 是個人/業餘專案,能用,但會有粗糙之處。歡迎提 bug——見 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [SECURITY.md](./SECURITY.md)。


AetherAI 將多家 LLM 服務供應商（OpenAI / Claude / DeepSeek / 本地模型 / 任何相容 OpenAI 的端點）整合於單一桌面應用。所有資料皆儲存於本地——您的 API 金鑰與對話內容絕不會離開您的裝置，除非送往您所設定的供應商。

## 🎯 AetherAI 有何不同

AetherAI 把通常分散在多個工具中的能力整合於單一桌面應用程式：

| 能力 | 說明 | 成熟度 |
|---|---|:---:|
| **多供應商對話** | 在 OpenAI、Claude、DeepSeek 與任何 OpenAI 相容端點之間切換。 | `穩定` |
| **Agent 工具迴圈** | 16 個內建工具，搭配 Plan-Act-Observe 迴圈、沙箱、許可階梯。 | `測試版` |
| **多模型競技場** | 一個提示同時發給多個模型，投票選出最佳回答，追蹤 ELO 排名。 | `測試版` |
| **技能與擴充性** | 放入 `SKILL.md` 檔案、MCP 伺服器、10 點鉤子系統。 | `實驗性` |
| **結構化記憶** | Agent 跨會話自動回憶您的偏好與過往決策。 | `測試版` |
| **階層式規劃** | 複雜請求自動拆解為平行子任務。 | `實驗性` |
| **上下文壓縮** | 長對話自動摘要，不丢失 tool-call/result 對。 | `測試版` |
| **本地優先隱私** | 對話、金鑰、人設存放在本地 SQLite。無資料離開您的機器。 | `穩定` |
| **15 種介面語言** | 包含文言與 RTL 阿拉伯語。 | `測試版` |
| **MIT 授權** | 完全開放原始碼。 | `穩定` |

---

## 📑 Table of Contents

- [✨ 功能特色](#-功能特色)
  - [🖥️ 聊天](#️-聊天)
  - [🤖 Agent（函式呼叫）](#-agent函式呼叫)
  - [🧠 記憶與學習](#-記憶與學習)
  - [🏟️ 競技場](#-競技場)
  - [🛠️ 技能與擴充性](#-技能與擴充性)
  - [⚙️ 自訂](#-自訂)
  - [🔒 隱私](#-隱私)
- [📸 截圖](#-截圖)
- [📦 下載](#-下載)
- [🚀 快速開始](#-快速開始)
- [📁 專案結構](#-專案結構)
- [🔑 技術棧](#-技術棧)
- [🤝 貢獻](#-貢獻)
- [📄 授權](#-授權)

---

## ✨ 功能特色

**狀態標籤：** `穩定` = 適合日常使用，`測試版` = 可用但仍有已知粗糙點，`實驗性` = 新/進階功能行為可能變動，`規劃中` = 已列入路線圖但尚未完成。

### 🖥️ 聊天

| 功能 | 狀態 | 說明 |
|---|:---:|---|
| **多供應商** | `穩定` | 單一適配層；新增供應商格式只需一個檔案。涵蓋 OpenRouter、Together、DeepSeek、Ollama、LM Studio、... |
| **並行串流** | `穩定` | 一個對話串流時，您仍可在另一個對話中繼續交談。 |
| **思考強度滑桿** | `測試版` | 對應真實參數：OpenAI o 系列 / gpt-5 / Claude 透過中繼。僅對推理模型有效。 |
| **附件** | `測試版` | 文字檔案作為上下文；圖片走多模態（需視覺模型）。 |
| **長貼上摺疊** | `穩定` | 數百行自動摺疊為可展開的程式碼片段（ChatGPT 風格）。 |
| **訊息編輯** | `穩定` | 從任意點覆蓋並重新生成。 |
| **訊息搜尋** | `穩定` | 所有訊息中高亮顯示。 |
| **側欄摘要** | `測試版` | 模型生成主題詞組，非複製文字。 |

### 🤖 Agent（函式呼叫）

- `測試版` **16 項內建工具**（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`、`use_skill`、`ask_user`、`todo_write`），搭配 Plan-Act-Observe 迴圈、即時推理軌跡 + 任務清單、迴圈偵測、每工具超時、可配置迭代預算（預設 25 回合）與上下文壓縮。
- `實驗性` **階層式規劃** — 自動為複雜請求產生任務分解（DS4 啟發）。
- `實驗性` **子代理委派** — 獨立子任務透過 `delegate_task` 平行執行。
- `穩定` **許可模式** — 風險遞階：

| 模式 | 說明 | 沙箱 |
|---|---|:---:|
| **關閉** | 純聊天，無工具 | N/A |
| **計畫** | 唯讀工具（調查但不修改） | - |
| **詢問** | 確認每個風險操作（推薦） | - |
| **自動** | 執行所有操作，不需確認 | 有 |
| **Yolo** | 完全許可，無沙箱 | 無 |

- `穩定` **工作區沙箱** — `write_file`/`edit_file` 在設定好的工作區根目錄外被拒絕；`run_command` 封鎖破壞性模式。在設定 - Agent 與安全中可配置。
- `測試版` **上下文壓縮** — 自動摘要較舊歷史（tool-call/result 對保持完整；標識符按原樣保留）。
- `測試版` **工具呼叫修復** — 自動修復格式錯誤的 JSON、缺失引數、未加引號的鍵和截斷的呼叫。

### 🧠 記憶與學習

- `測試版` **自動長期記憶** — 每個回合前注入相關記憶；自動提取並儲存關鍵事實。可在設定中切換。
- `實驗性` **習慣學習器** — 偵測重複偏好（例如「始終使用 Claude」）並自動套用技能。
- `測試版` **稽核日誌** — 每回合 Agent 執行軌跡，便於除錯。

### 🏟️ 競技場

- `測試版` **多模型競技場** — 一個提示，多個模型**同時**作答；投票選出最佳回答，**ELO 排行榜**自動更新。模型按**意圖**打分（編碼 / 數學 / 翻譯 / 摘要 / 一般）。*沒有其他本地優先桌面聊天應用內建帶 ELO 的多模型競技場。*

### 🛠️ 技能與擴充性

| 元件 | 格式 | 狀態 | 說明 |
|---|---|:---:|---|
| **技能** | `SKILL.md` | `實驗性` | 放入 `<workspace>/.claude/skills/`；隨附 `release-checklist` 與 `git-commit` |
| **斜線指令** | `CMD.md` | `穩定` | 6 個內建：`/code`、`/continue`、`/explain`、`/polish`、`/summarize`、`/translate` |
| **鉤子** | 腳本 | `實驗性` | 10 個生命週期點：PreToolUse、PostToolUse、ToolError、PreCompact、PostCompact、PreSend、PostResponse、SessionStart、SessionEnd、SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `測試版` | 外部 MCP 伺服器自動與內建工具合併 |

### ⚙️ 自訂

| 設定 | 狀態 | 說明 |
|---|:---:|---|
| **進階模型設定** | `穩定` | 最大 tokens、temperature、top_p、自訂系統前綴、依語言自動標題、思考強度 |
| **自訂背景** | `穩定` | 上傳圖片，調整不透明度 / 模糊 |
| **人設** | `穩定` | 系統提示預設，每個會話可切換 |
| **主題** | `穩定` | 淺色 / 深色 / 藍色 / 玻璃 / 復古 |
| **15 種介面語言** | `測試版` | 英文、中文（簡/繁/文言）、日文、西班牙文、法文、德文、葡萄牙文、俄文、烏克蘭文、阿拉伯文（RTL）、印地文、韓文 |
| **自動更新** | `測試版` | NSIS 安裝程式在啟動時檢查；可攜版也支援（手動安裝） |
| **使用追蹤** | `測試版` | 依 API 呼叫記錄 tokens、成本、延遲、快取命中率 |

### 🔒 隱私

> **所有資料留在本地。** AetherAI 不收集也不上傳關於您的任何資料。您的 API 金鑰、對話和人格存放在本地 SQLite 資料庫中。唯一的對外網路請求僅發往您設定的 LLM 供應商。

---

## 📸 截圖

> 截圖存放在 `assets/screenshots/` 下，請更新下方路徑。

| 流程 | 預覽 |
|---|:---:|
| 對話串流 | `assets/screenshots/chat-streaming.gif` — _待完成_ |
| Agent 工具執行 | `assets/screenshots/agent-tool-execution.gif` — _待完成_ |
| 競技場投票 | `assets/screenshots/arena-voting.gif` — _待完成_ |
| 供應商設定 | `assets/screenshots/provider-settings.png` — _待完成_ |

---

## 📦 下載

### Windows — 預先建置（推薦）

下載最新 [Release](https://github.com/TQSY114514/AetherAI/releases)：

| 建構 | 說明 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS 安裝程式。使用者安裝（不需管理員），內建自動更新。**推薦。** |
| **`AetherAI-x.y.z.exe`** | 可攜單一執行檔。不需安裝，不自動更新；直接執行即可。 |

> 安裝程式在首次啟動時會顯示 SmartScreen「未知發行者」警告——這對於未簽署的個人應用程式是正常的。所有資料保留在本地。

---

## 🚀 快速開始

### 從原始碼安裝

**前置要求：** Node.js 18+、npm 9+

```bash
cd app
npm install
npm run dev      # 開發（熱重載）
npm run build    # 建置正式前端
npm start        # 啟動 Electron
```

或在 Windows 上執行 `start.bat`。

### 設定供應商

1. 啟動後，點擊側欄的 **Models**。
2. 新增供應商（名稱 / API URL / API Key）。
3. 點擊 **Fetch models** 取得可用模型清單。
4. 回到聊天開始對話。

### 啟用 Ask 模式

1. 開啟 **設定 - Agent 與安全**。
2. 將 Agent 許可模式設為 **Ask**。
3. 確認 workspace root 是 Agent 要讀寫的資料夾。
4. 除非需要無限制存取，否則保持 **Yolo** 關閉。

### 執行第一個 Agent 任務

1. 開啟新聊天。
2. 輸入：`List the files in this project and summarize what the app does.`
3. 審查每個工具呼叫。批准安全的讀取；拒絕任何意外操作。
4. 查看即時推理軌跡與最終答案。

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

## 🔑 技術棧

| 層 | 技術 |
|---|---|
| 桌面 | Electron 31 |
| 前端 | React 18.3 + TypeScript 5.5 |
| 狀態 | Zustand 4.5 |
| 建構 | Vite 5.4 + electron-builder |
| 資料庫 | sql.js（SQLite 記憶體中，持久化到磁碟） |
| LLM | OpenAI 相容 + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | 自訂 stdio JSON-RPC 2.0 用戶端 |

---

## 🤝 鳴謝

AetherAI 站在這些專案的肩膀上——它們的理念塑造了架構與 UX：

### Agent 框架

| 專案 | 啟發 |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent 許可模型、思考滑桿、工具呼叫視覺化、子代理委派、鉤子 |
| [OpenClaw](https://github.com/openclaw/openclaw) | 上下文壓縮、工具呼叫迴圈偵測、事件流架構 |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | 迭代預算、結構化長期記憶、自主技能 |
| [OpenAI Codex](https://github.com/openai/codex) | 沙箱、上下文壓縮、工具呼叫修復 |
| [DS4](https://github.com/antirez/ds4) | 階層式任務分解 |

### UI 與 UX

| 專案 | 啟發 |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva 複製貼上元件方法 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 動畫模式（shimmer、blur-fade） |

### 基礎建設

| 專案 | 啟發 |
|---|---|
| [Dify](https://github.com/langgenius/dify) | 多格式供應商正規化 |
| [MCP](https://modelcontextprotocol.io) | AetherAI Agent 所說的規格 |
| [cc-switch](https://github.com/farion1231/cc-switch) | 使用統計儀表板配置 |
| [new-api](https://github.com/QuantumNous/new-api) | 推理強度中繼、使用/成本追蹤 |
| [Continue](https://github.com/continuedev/continue) | 設定為真相來源、供應商抽象 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | 多輪 Agent 執行、沙箱工具執行 |
| [Aider](https://github.com/Aider-AI/aider) | LLM 編碼助手工具迴圈、git 整合 |
| [Cline](https://github.com/cline/cline) | IDE 內嵌 Agent、MCP 整合、許可 UX |

---

## 🤝 貢獻

歡迎所有貢獻！無論是 bug 修復、功能請求、翻譯改進或文件更新——請開啟問題或提交 PR。

1. Fork 這個專案
2. 建立功能分支（`git checkout -b feat/my-feature`）
3. 提交您的變更（`git commit -am 'Add feature'`）
4. 推送到分支（`git push origin feat/my-feature`）
5. 開啟 Pull Request

詳細指南請參見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 📄 授權

[MIT](./LICENSE) 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
