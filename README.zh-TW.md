<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**本地優先的多模型桌面 AI 對話客戶端 · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

AetherAI 將多家 LLM 服務供應商（OpenAI / Claude / DeepSeek / 本地模型 / 任何相容 OpenAI 的端點）整合於單一桌面應用。所有資料皆儲存於本地——您的 API 金鑰與對話內容絕不會離開您的裝置，除非送往您所設定的供應商。

## ✨ 功能特色

- **多供應商抽象層** — 統一的介接層；新增一種供應商格式只需一個檔案。目前支援 OpenAI 相容格式（涵蓋 OpenRouter、Together、DeepSeek、Ollama 的 OpenAI shim、LM Studio 等）。
- **多會話並行串流** — 一個對話可持續串流的同時，您仍能在另一個對話中繼續交談。
- **Arena** — 同一則提示，多個模型同時作答；為最佳回答投票，ELO 排行榜自動更新。
- **人設** — 系統提示預設組，可逐會話切換。
- **附件** — 文字檔案注入為上下文；圖片走多模態處理（需視覺模型）。
- **長貼上摺疊** — 貼上數百行文字會自動摺疊為可展開的片段（ChatGPT 風格）。
- **Agent（函式呼叫）** — 內建 13 項工具（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`），採 Plan→Act→Observe 迴圈並即時顯示推理過程。
- **Agent 權限模式** — 關閉 / 詢問（每次具風險工具皆須確認）/ 自動（全部允許）/ 計畫（唯讀）。對應程式設計 Agent 的權限模型。
- **MCP 支援** — 連接外部 stdio MCP 伺服器；其工具自動與內建工具合併。
- **思考強度滑桿** — 對應真實參數：OpenAI o 系列 → `reasoning_effort`，Claude → `thinking.budget_tokens`。
- **側欄摘要** — 標題為模型生成的主題詞組（如「新英雄天使抽卡建議」），而非複製的原文。
- **進階設定** — max tokens、temperature、top_p、自訂系統前綴、各語言自動標題。
- **自訂背景** — 上傳圖片並可調整透明度 / 模糊度。
- **15 種介面語言** — English（標準 + 上下顛倒）、中文（简体/繁體/文言）、日本語、español、français、Deutsch、português、русский、українська、العربية（RTL）、हिन्दी、한국어。
- **主題** — Light / Dark / Blue / Glass / Retro。
- **本地儲存** — 所有資料存放於本地 SQLite 資料庫；無任何上傳。

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
│   │   ├── toolLoop.js          # 函式呼叫迴圈
│   │   └── toolArgs.js          # 工具參數解析
│   ├── tools/             # 內建工具註冊表
│   ├── mcp/               # MCP 客戶端 + 管理器
│   ├── main.js / preload.js
├── src/                   # 渲染程序（React + TS）
│   ├── store/index.ts     # zustand 全域狀態
│   ├── components/        # 介面（chat / sidebar / settings / ui）
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n（15 種語系）/ theme / markdown
│   └── types/
└── package.json
```

## 🔒 隱私

**所有資料皆儲存於本地。** AetherAI 不收集、不上傳任何關於您的資訊。您的 API 金鑰、對話內容與人設皆存放於本地 SQLite 資料庫。唯一的外部網路請求，僅送往您所設定的 LLM 供應商。

> ⚠️ 推送至 GitHub 前，請確認 `.gitignore` 已排除 `*.db`、`dist/`、`node_modules/`、`background.img` 以及任何 `.env`。

## 🙏 銘謝

AetherAI 站在前人肩上——下列專目的理念形塑了本作的架構與使用體驗：

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — Agent 權限模型、思考強度滑桿、工具呼叫視覺化、新對話空狀態。
- [Continue](https://github.com/continuedev/continue) — 宣告式「組態即真相」、供應商抽象層、函式呼叫協定。
- [Dify](https://github.com/langgen/dify) — 多格式供應商正規化模式。
- [Model Context Protocol](https://modelcontextprotocol.io) — AetherAI Agent 所使用之 MCP 規範。
- [shadcn/ui](https://github.com/shadcn-ui/ui) — cn() / cva 複製貼上元件方法論。
- [Magic UI](https://github.com/magicuidesign/magicui) — 動畫模式（串流文字、微光、模糊淡入）。
- [new-api](https://github.com/QuantumNous/new-api) — 推理強度中繼轉換之參考。
- [OpenClaw](https://github.com/openclaw/openclaw) — README 潤飾與入門啟發。

## 📄 授權

MIT
