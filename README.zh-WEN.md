<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**本地為先，多模型桌面 AI 對談之器 · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

> **狀態：測試版。** AetherAI 乃一人所造之業餘物件,可用,然未盡善。若有闕漏,敬請告之——見 [CONTRIBUTING.md](./CONTRIBUTING.md) 與 [SECURITY.md](./SECURITY.md)。


AetherAI 合諸 LLM 供應商於一器（OpenAI / Claude / DeepSeek / 本地模型 / 凡 OpenAI 相容之端），悉聚一桌面應用之中。所載皆存於本地——汝之 API 鑰與對談，除發往所設供應商外，決不外泄於他處。

## ✨ 特性

- **多供應商抽象**——設一適配之層；欲增一供應商格式，但添一檔可也。今已相容 OpenAI 格式（OpenRouter、Together、DeepSeek、Ollama 之 OpenAI 接口、LM Studio 等皆涵其中）。
- **多會話並行流式**——一談方流式而下，另室亦可續言不輟。
- **Arena**——一問而諸模型並答；擇其最善者投一票，ELO 榜單隨之自更。
- **Personas**——系統提示預設，可隨會話而易。
- **附件**——文字檔注入為脈絡；圖像行多模之道（須具視覺之模型）。
- **長貼折疊**——貼入數百行，自折為可展之片段（效 ChatGPT 之法）。
- **Agent（函式呼叫）**——內建工具十三（`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`），循 Plan→Act→Observe 之環，推理軌跡即時可見。
- **Agent 授權模式**——關閉 / 詢問（每遇險器皆請確認）/ 自動（悉皆允之）/ 計畫（唯讀）。蓋效程式 Agent 授權之制。
- **MCP 之援**——可接外部 stdio MCP 伺服器；其工具自與內建者合而為一。
- **思考之力滑桿**——實參也：OpenAI o 系列 → `reasoning_effort`，Claude → `thinking.budget_tokens`。
- **側欄摘要**——題名皆模型所擬之主題短語（如「新英靈天使抽卡之議」），非鈔錄原文也。
- **進階設定**——最高 tokens、temperature、top_p、自訂系統前綴、各語自生題名。
- **自訂背景**——上傳圖像，可調透明度與模糊。
- **介面語言十五**——English（正體與倒置）、中文（簡體/繁體/文言）、日本語、español、français、Deutsch、português、русский、українська、العربية（RTL）、हिन्दी、한국어。
- **主題**——Light / Dark / Blue / Glass / Retro。
- **本地之藏**——諸數據悉存本地 SQLite 資料庫；無一上傳。

## 🚀 速啟

### 先備
- Node.js 18+
- npm 9+

### 安裝與運行
```bash
cd app
npm install
npm run dev      # 開發之用（熱重載）
npm run build    # 構建生產前端
npm start        # 啟動 Electron
```

若於 Windows，可於庫根行 `start.bat`。

### 設汝首個供應商
1. 啟後，點側欄之 **Models**。
2. 增一供應商（名 / API URL / API Key）。
3. 點 **Fetch models** 以取可用模型之列。
4. 歸對談而始言。

## 📁 工程結構

```
app/
├── electron/              # 主程序（Node）
│   ├── database.js        # SQLite (sql.js) 資料層
│   ├── ipc/               # IPC 處理器（chat / arena / session / mcp / ...）
│   ├── llm/               # LLM 抽象
│   │   ├── providerAdapter.js   # 依 api_format 分派
│   │   ├── openaiAdapter.js     # OpenAI 相容之實
│   │   ├── reasoning.js         # 思考之力參數構建
│   │   ├── │   │   ├── planning.js          │ # hierarchical task decomposition (DS4-inspired)
│   │   ├── toolLoop.js          │ # Plan→Act→Observe function-calling loop
│   │   ├── subAgent.js          │ # parallel sub-agent delegation
│   │   ├── autoMemory.js        │ # structured long-term memory (Hermes-inspired)
│   │   ├── reasoning.js         │ # thinking-effort param builder
│   │   └── toolArgs.js          │ # tool-arg parsing
│   ├── tools/             # 內建工具註冊
│   ├── mcp/               # MCP 客戶端與總管
│   ├── main.js / preload.js
├── src/                   # 渲染層（React + TS）
│   ├── store/index.ts     # zustand 全域狀態
│   ├── components/        # 介面（chat / sidebar / settings / ui）
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n（十五語） / theme / markdown
│   └── types/
└── package.json
```

## 🔒 隱私

**諸數據皆存本地。** AetherAI 不收集一物，亦不上傳汝之絲毫。汝之 API 鑰、對談、Personas，皆居本地 SQLite 資料庫中。其對外網絡之請，唯汝所設 LLM 供應商而已。

> ⚠️ 推至 GitHub 之前，務使 `.gitignore` 排除 `*.db`、`dist/`、`node_modules/`、`background.img`，及諸 `.env`。

## 🙏 鳴謝

AetherAI 立於諸專案之肩——其構想啟迪本器之架構與介面：

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)——Agent 授權之制、思考之力滑桿、工具呼叫之可視、新談空態。
- [Continue](https://github.com/continuedev/continue)——以宣告式配置為本、供應商抽象、函式呼叫之約。
- [Dify](https://github.com/langgen/dify)——多格式供應商歸一之法。
- [Model Context Protocol](https://modelcontextprotocol.io)——AetherAI Agent 所操之 MCP 規範。
- [shadcn/ui](https://github.com/shadcn-ui/ui)——`cn()` / `cva` 複貼元件之法。
- [Magic UI](https://github.com/magicuidesign/magicui)——動畫之範（流式文字、微光、模糊漸隱）。
- [new-api](https://github.com/QuantumNous/new-api)——推理之力中轉換算之參。
- [OpenClaw](https://github.com/openclaw/openclaw)——README 修飾與入門之啟。
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

## 📄 授權

MIT
