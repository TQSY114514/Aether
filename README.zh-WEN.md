<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **狀態：Beta。** AetherAI 乃一人所造之業餘之物，可用，然未盡善。若有闕漏，敬請告之——見 [CONTRIBUTING.md](./CONTRIBUTING.md) 與 [SECURITY.md](./SECURITY.md)。

合諸 LLM 供應商於一器——OpenAI / Claude / DeepSeek / 本地模型 / 凡 OpenAI 相容之端——悉聚一桌面應用之中。所載 Agent 可讀寫檔案、執行指令，復有工作區沙箱、多模型競技場伴 ELO 投票、技能系統及十五種界面語。諸數據悉存本地：汝之 API 鑰與對談，除發往所設供應商外，決不外泄於他處。

---

## AetherAI 何以別於他者

AetherAI 合眾器之長，納於一本地桌面應用之中：

| 能事 | 說明 | 成熟度 |
|---|---|:---:|
| **多供應商對話** | 於 OpenAI、Claude、DeepSeek 及凡 OpenAI 相容端之間切換，會話中可隨時易之。 | `Stable` |
| **Agent 工具迴圈** | 十六內建工具，伴 Plan-Act-Observe 迴圈、沙箱、許可階梯。 | `Beta` |
| **多模型競技場** | 一提示同發多模型，投票選最佳，追蹤 ELO 排名。 | `Beta` |
| **技能與擴充** | 放入 `SKILL.md` 檔案、MCP 伺服器、十點鉤子系統。 | `Experimental` |
| **結構化記憶** | Agent 越會話自動憶汝偏好與舊決策。 | `Beta` |
| **階層式規劃** | 複雜請求自動拆解為並行子任務。 | `Experimental` |
| **上下文壓縮** | 長對話自動摘要，不丟 tool-call 對。 | `Beta` |
| **本地優先隱私** | 對話、鑰、人格存本地 SQLite。無物離汝機器。 | `Stable` |
| **十五種界面語** | 含文言與 RTL 阿拉伯語。 | `Beta` |
| **MIT 授權** | 完全開放原始碼。 | `Stable` |

---

## 下載

### Windows — 預裝安裝程式（薦於眾用）

下載最新 [Release](https://github.com/TQSY114514/Aether/releases)：

| 建構 | 說明 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS 安裝程式。按用戶裝（不需管理員），應用內自動更新。**推薦。** |
| **`AetherAI-x.y.z.exe`** | 可攜單一執行檔。免安裝、不自動更新；徑執行即可。 |

> 安裝程式首次啟動時，SmartScreen 示「未知發行者」之警——此於未簽章之個人應用為常態。諸數據悉留本地。
>
> ⚠️ 部分防毒軟體或於封裝時隔離未解壓之 `electron.exe`，蓋因本應用未經簽章。若安裝程式為汝之防毒所除，請加例外或改用可攜版。

### 從原始碼執行（開發者 / 進階用戶）

若欲從原始碼執行，或欲改其碼，請用 `start.bat`（需 [Node.js 18+](https://nodejs.org)）：

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows：安裝依賴、建置前端、啟動 Electron
```

手動步驟詳見 [速成](#-quick-start)。

> **exe 與 start.bat** —— 二者皆受支援，各適其用：
> - **安裝程式 exe** —— 為終端用戶：雙擊即裝，開始選單有徑，應用內自動更新，不需 Node.js。
> - **start.bat** —— 為開發者 / 好事者：透明 `npm install` → `vite build` → `electron .` 之流，改碼即行，需 Node.js。

---

## 速成

**前置：** Node.js 18+、npm 9+

```bash
cd app
npm install
npm run dev      # 開發（熱重載）
npm run build    # 建置正式前端
npm start        # 啟動 Electron
```

或於 Windows 上徑執行 `start.bat`。

### 設定供應商

1. 啟動後，點側欄之 **Models**。
2. 增供應商（名 / API URL / API Key）。
3. 點 **Fetch models** 取可用模型清單。
4. 歸聊天始談。

### 啟用詢問模式

1. 開 **設定 - Agent 與安全**。
2. 將 Agent 許可模式設為 **Ask**。
3. 確認 workspace root 為汝欲 Agent 讀寫之資料夾。
4. 除非欲無限制存取，否則保持 **Yolo** 關閉。

### 行首個 Agent 任務

1. 開新聊天。
2. 輸入：`List the files in this project and summarize what the app does.`
3. 審每個工具呼叫。允安全之讀；拒意外之操作。
4. 觀即時推理軌跡與最終答案。

---

## 功能

**狀態標籤：** `Stable` = 宜日常用，`Beta` = 可用而有已知粗糙，`Experimental` = 新/進階功能或變動，`Planned` = 已列路線圖而未竟。

### 聊天

| 功能 | 狀態 | 說明 |
|---|:---:|---|
| **多供應商** | `Stable` | 單一適配層；增供應商 = 一檔。涵蓋 OpenRouter、Together、DeepSeek、Ollama、LM Studio 等。 |
| **並行串流** | `Stable` | 一談串流時，另室續談。 |
| **思考之力滑桿** | `Beta` | 真實參數：OpenAI o 系列 / gpt-5 / Claude 透過中繼。唯推理模型有效。 |
| **附件** | `Beta` | 文本為脈絡；圖像走多模態（須視覺模型）。 |
| **長貼折疊** | `Stable` | 數百行自動摺為可展開片段（ChatGPT 風）。 |
| **訊息編輯** | `Stable` | 任一點覆蓋並重生。 |
| **訊息搜尋** | `Stable` | 全訊息高亮。 |
| **側欄摘要** | `Beta` | 模型生成主題語，非複製文。 |

### Agent（函式呼叫）

- `Beta` **十六內建工具**（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`、`use_skill`、`ask_user`、`todo_write`），伴 Plan-Act-Observe 迴圈、即時推理軌跡 + 任務清單、迴圈偵測、每工具超時、可配置之迭代預算（預設 25 回合）與上下文壓縮。
- `Experimental` **階層式規劃** — 自動為複雜請求產任務分解（DS4 啟發）。
- `Experimental` **子代理委派** — 獨立子任務經 `delegate_task` 並行執行。
- `Stable` **許可模式** — 風險遞升之階梯：

| 模式 | 說明 | 沙箱 |
|---|---|:---:|
| **關閉** | 純聊天，無工具 | N/A |
| **計畫** | 唯讀工具（調查不改） | - |
| **詢問** | 確每風險操作（推薦） | - |
| **自動** | 行一切，不需確認 | 有 |
| **Yolo** | 全許可，無沙箱 | 無 |

- `Stable` **工作區沙箱** — `write_file`/`edit_file` 於所設工作區根目錄外被拒；`run_command` 阻破壞模式。可於設定 - Agent 與安全中配置。
- `Beta` **上下文壓縮** — 自動摘要舊歷史（tool-call/result 對保持完整；標識符逐字保留）。
- `Beta` **工具呼叫修復** — 自動修復錯 JSON、缺引數、未引鍵、截斷呼叫。

### 記憶與學習

- `Beta` **自動長期記憶** — 每回合前注入相關記憶；自動提取並存關鍵事實。可於設定 - Agent 切換。
- `Experimental` **習慣學習器** — 偵測重複偏好（如「始終用 Claude」）並提議自動套用之技能。
- `Beta` **稽核日誌** — 每回合 Agent 執行軌跡，便於除錯。

### 競技場

- `Beta` **多模型競技場** — 一提示，多模型**同時**作答；投票選最佳，**ELO 排行榜**自動更新。模型按**意圖**打分（編碼 / 數學 / 翻譯 / 摘要 / 一般）。*本地優先之桌面聊天應用中，無他者內建帶 ELO 之多模型競技場。*

### 技能與擴充性

| 元件 | 格式 | 狀態 | 說明 |
|---|---|:---:|---|
| **技能** | `SKILL.md` | `Experimental` | 放入 `<workspace>/.claude/skills/`；附 `release-checklist` 與 `git-commit` |
| **斜線指令** | `CMD.md` | `Stable` | 六內建：`/code`、`/continue`、`/explain`、`/polish`、`/summarize`、`/translate` |
| **鉤子** | 腳本 | `Experimental` | 十生命週期點：PreToolUse、PostToolUse、ToolError、PreCompact、PostCompact、PreSend、PostResponse、SessionStart、SessionEnd、SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | 外部 MCP 伺服器自動與內建工具合併 |

### 自訂

| 設定 | 狀態 | 說明 |
|---|:---:|---|
| **進階模型設定** | `Stable` | Max tokens、temperature、top_p、自訂系統前綴、依語言自動標題、思考強度 |
| **自訂背景** | `Stable` | 傳圖，調不透明度 / 模糊 |
| **人設** | `Stable` | 系統提示預設，每會話可切換 |
| **主題** | `Stable` | 淺色 / 深色 / 藍色 / 玻璃 / 復古 |
| **十五種界面語** | `Beta` | 英文、中文（簡/繁/文言）、日文、西班牙文、法文、德文、葡萄牙文、俄文、烏克蘭文、阿拉伯文（RTL）、印地文、韓文 |
| **自動更新** | `Beta` | NSIS 安裝程式啟動時檢查；可攜版亦查（手動安裝） |
| **使用追蹤** | `Beta` | 依 API 呼叫記錄 tokens、成本、延遲、快取命中率 |

### 隱私

> **諸數據悉存本地。** AetherAI 不集不傳關於汝之事。汝之 API 鑰、對話與人格存於本地 SQLite 資料庫。唯一向外之網路請求僅發往汝所設之 LLM 供應商。

---

## 專案結構

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

## 技術棧

| 層 | 技術 |
|---|---|
| 桌面 | Electron 31 |
| 前端 | React 18.3 + TypeScript 5.5 |
| 狀態 | Zustand 4.5 |
| 建構 | Vite 5.4 + electron-builder |
| 資料庫 | sql.js（SQLite 記憶體中，持久化至磁碟） |
| LLM | OpenAI 相容 + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | 自訂 stdio JSON-RPC 2.0 用戶端 |

---

## 鳴謝

AetherAI 竊比諸子，納百川而成海。下列諸專案之念，塑其架構與 UX：

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
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva 複製貼上元件之法 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 動畫之勢（shimmer、blur-fade） |

### 基礎建設

| 專案 | 啟發 |
|---|---|
| [Dify](https://github.com/langgenius/dify) | 多格式供應商正規化 |
| [MCP](https://modelcontextprotocol.io) | AetherAI Agent 所說之規 |
| [cc-switch](https://github.com/farion1231/cc-switch) | 使用統計儀表板之制 |
| [new-api](https://github.com/QuantumNous/new-api) | 推理強度中繼、使用/成本追蹤 |
| [Continue](https://github.com/continuedev/continue) | 設定為真諦、供應商抽象 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | 多輪 Agent 執行、沙箱工具執行 |
| [Aider](https://github.com/Aider-AI/aider) | LLM 編碼助手工具迴圈、git 整合 |
| [Cline](https://github.com/cline/cline) | IDE 內嵌 Agent、MCP 整合、許可 UX |

---

## 共襄

歡迎諸君共襄！無論 bug 修復、功能請求、翻譯改進或文件更新——請開 issue 或提 PR。

1. Fork 此專案
2. 創功能分支（`git checkout -b feat/my-feature`）
3. 提交變更（`git commit -am 'Add feature'`）
4. 推送至分支（`git push origin feat/my-feature`）
5. 開 Pull Request

詳見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 授權

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aetherai)

</div>
