<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### 本地優先、多模型桌面 AI 工作台

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [簡體中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **狀態:Beta。** AetherAI 是個人/業餘專案。能用,但會有粗糙之處。歡迎提 bug——見 [CONTRIBUTING.md](./CONTRIBUTING.md) 與 [SECURITY.md](./SECURITY.md)。

將多家 LLM 供應商——OpenAI / Claude / DeepSeek / 本地模型 / 任何 OpenAI 相容端點——整合於單一桌面應用。內建可讀寫檔案並執行指令的 Agent、工作區沙箱、帶 ELO 投票的多模型競技場、技能,以及 15 種介面語言。所有資料皆儲存於本地:您的 API 金鑰與對話內容絕不會離開您的機器,除非送往您所設定的供應商。

---

## AetherAI 有何不同

AetherAI 將通常分散在多個工具中的能力整合於單一本地桌面應用:

| 能力 | 說明 | 成熟度 |
|---|---|:---:|
| **多供應商對話** | 在對話中切換 OpenAI、Claude、DeepSeek 與任何 OpenAI 相容端點。 | `Stable` |
| **Agent 工具迴圈** | 16 個內建工具,搭配 Plan-Act-Observe 迴圈、沙箱、許可階梯。 | `Beta` |
| **多模型競技場** | 將一個提示發給多個模型,投票選出最佳回答,追蹤 ELO 排名。 | `Beta` |
| **技能與擴充性** | 放入即用的 `SKILL.md` 檔案、MCP 伺服器、10 點鉤子系統。 | `Experimental` |
| **結構化記憶** | Agent 跨會話回憶偏好與過往決策。 | `Beta` |
| **階層式規劃** | 複雜請求自動拆解為平行子任務。 | `Experimental` |
| **上下文壓縮** | 長對話自動摘要,不丟失 tool-call 配對。 | `Beta` |
| **本地優先隱私** | 對話、金鑰、人設存於本地 SQLite。無資料離開您的機器。 | `Stable` |
| **15 種介面語言** | 包含文言文與 RTL 阿拉伯語。 | `Beta` |
| **MIT 授權** | 完全開放原始碼。 | `Stable` |

---

## 下載

### Windows — 預先建置安裝程式(推薦多數使用者使用)

下載最新 [Release](https://github.com/TQSY114514/AetherAI/releases):

| 建構 | 說明 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS 安裝程式。使用者安裝(不需管理員),應用內自動更新。**推薦。** |
| **`AetherAI-x.y.z.exe`** | 可攜單一執行檔。不需安裝,不自動更新;直接執行即可。 |

> 安裝程式在首次啟動時會顯示 SmartScreen「未知發行者」警告——對於未簽署的個人應用程式這是正常的。所有資料保留在本地。
>
> ⚠️ 由於應用程式未簽署,部分防毒軟體可能在封裝期間隔離解壓後的 `electron.exe`。若安裝程式被您的防毒軟體移除,請加入排除項目或改用可攜版。

### 從原始碼執行(開發者 / 進階使用者)

若您偏好從原始碼執行,或想修改程式碼,請使用 `start.bat`(需 [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/AetherAI.git
cd AetherAI
start.bat        # Windows:安裝相依套件、建置前端、啟動 Electron
```

如需手動步驟,請見[快速開始](#-quick-start)。

> **exe vs start.bat** — 兩者皆支援,服務不同對象:
> - **安裝程式 exe** — 給一般使用者:雙擊安裝、開始選單項目、應用內自動更新,不需 Node.js。
> - **start.bat** — 給開發者 / 折騰者:透明的 `npm install` → `vite build` → `electron .` 流程,改完即跑,需 Node.js。

---

## 快速開始

**前置要求:** Node.js 18+、npm 9+

```bash
cd app
npm install
npm run dev      # 開發(熱重載)
npm run build    # 建置正式前端
npm start        # 啟動 Electron
```

或在 Windows 上於專案根目錄執行 `start.bat`。

### 設定供應商

1. 啟動後,點擊側欄的 **Models**。
2. 新增供應商(名稱 / API URL / API Key)。
3. 點擊 **Fetch models** 取得可用模型清單。
4. 回到聊天開始對話。

### 啟用 Ask 模式

1. 開啟 **Settings - Agent & Safety**。
2. 將 Agent 許可模式設為 **Ask**。
3. 確認工作區根目錄是您要 Agent 讀寫的資料夾。
4. 除非您要無限制存取,否則保持 **Yolo** 停用。

### 執行第一個 Agent 任務

1. 開啟新聊天。
2. 詢問:`List the files in this project and summarize what the app does.`
3. 審查每個提出的工具呼叫。批准安全的讀取;拒絕任何意外操作。
4. 查看即時推理軌跡與最終答案。

---

## 功能特性

**狀態標籤:** `Stable` = 可日常使用,`Beta` = 可用但有已知粗糙之處,`Experimental` = 新 / 進階行為可能變動,`Planned` = 已列入路線圖文件但尚未完成。

### 聊天

| 功能 | 狀態 | 說明 |
|---|:---:|---|
| **多供應商** | `Stable` | 單一適配層;新增供應商 = 一個檔案。涵蓋 OpenRouter、Together、DeepSeek、Ollama、LM Studio、... |
| **並行串流** | `Stable` | 一個對話串流時,您仍可在另一個對話中繼續交談。 |
| **思考強度滑桿** | `Beta` | 對應真實參數:OpenAI o 系列 / gpt-5 / Claude 透過中繼。僅對推理模型有效。 |
| **附件** | `Beta` | 文字檔作為上下文;圖片走多模態(需視覺模型)。 |
| **長貼上摺疊** | `Stable` | 數百行自動摺疊為可展開的程式碼片段(ChatGPT 風格)。 |
| **訊息編輯** | `Stable` | 覆寫 + 從任意點重新生成。 |
| **訊息搜尋** | `Stable` | 所有訊息中高亮顯示。 |
| **側欄摘要** | `Beta` | 模型生成的主題詞組,非複製文字。 |

### Agent(函式呼叫)

- `Beta` **16 個內建工具**(`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`、`use_skill`、`ask_user`、`todo_write`),搭配 Plan-Act-Observe 迴圈、即時推理軌跡 + 任務清單、迴圈偵測、每工具超時、可配置迭代預算(預設 25 回合)與上下文壓縮。
- `Experimental` **階層式規劃** — 自動為複雜請求產生任務分解(DS4 啟發)。
- `Experimental` **子代理委派** — 獨立子任務透過 `delegate_task` 平行執行。
- `Stable` **許可模式** — 風險遞階階梯:

| 模式 | 說明 | 沙箱 |
|---|---|:---:|
| **Off** | 純聊天,無工具 | N/A |
| **Plan** | 唯讀工具(調查但不修改) | - |
| **Ask** | 確認每個風險操作(推薦) | - |
| **Auto** | 執行所有操作,不需確認 | 有 |
| **Yolo** | 完全許可,無沙箱 | 無 |

- `Stable` **工作區沙箱** — `write_file`/`edit_file` 在設定好的工作區根目錄外會被拒絕;`run_command` 封鎖破壞性模式。可在 Settings - Agent & Safety 中配置。
- `Beta` **上下文壓縮** — 自動摘要較舊的歷史(tool-call/result 配對保持完整;識別子按原樣保留)。
- `Beta` **工具呼叫修復** — 自動修復格式錯誤的 JSON、缺失引數、未加引號的鍵與截斷的呼叫。

### 記憶與學習

- `Beta` **自動長期記憶** — 每個回合前注入相關記憶;自動提取並儲存關鍵事實。可在 Settings - Agent 中切換。
- `Experimental` **習慣學習器** — 偵測重複偏好(例如「始終使用 Claude」)並提出自動套用的技能。
- `Beta` **稽核日誌** — 每回合 Agent 執行軌跡,用於除錯。

### 競技場

- `Beta` **多模型競技場** — 一個提示,多個模型**同時**作答;投票選出最佳回答,**ELO 排行榜**自動更新。模型按**意圖**計分(編碼 / 數學 / 翻譯 / 摘要 / 一般)。*沒有其他本地優先桌面聊天應用內建帶 ELO 的多模型競技場。*

### 技能與擴充性

| 元件 | 格式 | 狀態 | 說明 |
|---|---|:---:|---|
| **技能** | `SKILL.md` | `Experimental` | 放入 `<workspace>/.claude/skills/`;隨附 `release-checklist` 與 `git-commit` |
| **斜線指令** | `CMD.md` | `Stable` | 6 個內建:`/code`、`/continue`、`/explain`、`/polish`、`/summarize`、`/translate` |
| **鉤子** | 腳本 | `Experimental` | 10 個生命週期點:PreToolUse、PostToolUse、ToolError、PreCompact、PostCompact、PreSend、PostResponse、SessionStart、SessionEnd、SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | 外部 MCP 伺服器自動與內建工具合併 |

### 自訂

| 設定 | 狀態 | 說明 |
|---|:---:|---|
| **進階模型設定** | `Stable` | Max tokens、temperature、top_p、自訂系統前綴、依語言自動標題、思考強度 |
| **自訂背景** | `Stable` | 上傳圖片,附不透明度 / 模糊控制 |
| **人設** | `Stable` | 系統提示預設,每個會話可切換 |
| **主題** | `Stable` | 淺色 / 深色 / 藍色 / 玻璃 / 復古 |
| **15 種介面語言** | `Beta` | 英文、中文(簡 / 繁 / 文言)、日文、西班牙文、法文、德文、葡萄牙文、俄文、烏克蘭文、阿拉伯文(RTL)、印地文、韓文 |
| **自動更新** | `Beta` | NSIS 安裝程式啟動時檢查;可攜版亦檢查(手動安裝) |
| **使用追蹤** | `Beta` | 依每次 API 呼叫記錄 tokens、成本、延遲、快取命中率 |

### 隱私

> **所有資料留在本地。** AetherAI 不收集也不上傳關於您的任何資料。您的 API 金鑰、對話與人設存於本地 SQLite 資料庫。唯一的對外網路請求僅發往您所設定的 LLM 供應商。

---

## 專案結構

```
app/
├── electron/              # 主處理序(Node)
│   ├── database.js        # SQLite(sql.js)資料層 — 14 個資料表
│   ├── ipc/               # IPC 處理器(chat / arena / session / mcp / ...)
│   │   ├── chat.handler.js    # 核心中央處理器(540 行)
│   │   ├── arena.handler.js   # 帶 ELO 的多模型競技場
│   │   ├── agent.handler.js   # 工作區管理
│   │   └── ...
│   ├── llm/               # LLM 抽象層(~3,700 行,19 個檔案)
│   │   ├── providerAdapter.js # 依 api_format 分派(openai/anthropic)
│   │   ├── openaiAdapter.js   # OpenAI 相容 SSE 串流 + 重試
│   │   ├── anthropicAdapter.js# Anthropic Messages API
│   │   ├── credentialPool.js  # 多金鑰輪替 + 冷卻
│   │   ├── toolLoop.js        # 帶迭代預算的 Plan-Act-Observe
│   │   ├── planning.js        # 階層式任務分解
│   │   ├── subAgent.js        # 平行子代理委派
│   │   ├── compaction.js      # 上下文壓縮(保留配對)
│   │   ├── autoMemory.js      # 長期結構化記憶
│   │   ├── habitLearner.js    # 重複偏好 -> 自動技能
│   │   ├── hooks.js           # 10 點擴充性鉤子
│   │   ├── skills.js          # SKILL.md 載入器(Claude Code 格式)
│   │   ├── modelAdvisor.js    # 啟發式模型建議
│   │   ├── toolCallRepair.js  # 格式錯誤工具呼叫復原
│   │   ├── auditLog.js        # 每回合 Agent 執行軌跡
│   │   └── ...
│   ├── tools/             # 內建工具登錄 + 沙箱
│   │   ├── registry.js       # 16 個工具定義(OpenClaw 啟發)
│   │   └── sandbox.js        # 3 層防護(工作區根目錄、路徑穿越守衛、封鎖清單)
│   ├── mcp/               # MCP 用戶端 + 伺服器管理員
│   ├── main.js / preload.js
├── src/                   # 渲染器(React + TS + Zustand)
│   ├── store/index.ts     # Zustand 全域狀態(~1,000 行)
│   ├── components/        # UI(chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n(15 種語言)/ theme / markdown
│   └── types/
├── skills/                # 內建技能(release-checklist, git-commit)
├── commands/              # 內建斜線指令(/code, /explain, /polish, ...)
├── locales/               # 翻譯檔(13 種語言,延遲載入)
└── resources/             # 應用程式圖示
```

---

## 技術堆疊

| 層 | 技術 |
|---|---|
| 桌面 | Electron 31 |
| 前端 | React 18.3 + TypeScript 5.5 |
| 狀態 | Zustand 4.5 |
| 建構 | Vite 5.4 + electron-builder |
| 資料庫 | sql.js(SQLite 記憶體內,持久化到磁碟) |
| LLM | OpenAI 相容 + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | 自訂 stdio JSON-RPC 2.0 用戶端 |

---

## 致謝

AetherAI 站在這些專案的肩膀上——它們的理念塑造了架構與 UX:

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
| [Magic UI](https://github.com/magicuidesign/magicui) | 動畫模式(shimmer、blur-fade) |

### 基礎建設

| 專案 | 啟發 |
|---|---|
| [Dify](https://github.com/langgenius/dify) | 多格式供應商正規化 |
| [MCP](https://modelcontextprotocol.io) | AetherAI Agent 所使用的規格 |
| [cc-switch](https://github.com/farion1231/cc-switch) | 使用統計儀表板配置 |
| [new-api](https://github.com/QuantumNous/new-api) | 推理強度中繼、使用 / 成本追蹤 |
| [Continue](https://github.com/continuedev/continue) | 設定為真相來源、供應商抽象 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | 多輪 Agent 執行、沙箱工具執行 |
| [Aider](https://github.com/Aider-AI/aider) | LLM 編碼助手工具迴圈、git 整合 |
| [Cline](https://github.com/cline/cline) | IDE 內嵌 Agent、MCP 整合、許可 UX |

---

## 貢獻

歡迎所有貢獻!無論是 bug 修復、功能請求、翻譯改進或文件更新——請開啟 issue 或提交 PR。

1. Fork 此專案
2. 建立功能分支(`git checkout -b feat/my-feature`)
3. 提交您的變更(`git commit -am 'Add feature'`)
4. 推送到分支(`git push origin feat/my-feature`)
5. 開啟 Pull Request

詳細指南請參見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 授權條款

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ 回到頂部](#aetherai)

</div>
