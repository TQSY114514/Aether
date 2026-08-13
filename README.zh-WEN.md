<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="Aether" />

# Aether

### 本地為先 · 多模型 · Agent 原生

凡模型皆可談、可令安全編寫之 Agent、可並列比較諸模型——於桌面或終端之中。

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 43](https://img.shields.io/badge/Electron-43-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)<br><sup>諸譯或滯於英文 / 簡體中文之版。</sup>

</div>

---

> **狀態：Beta。** Aether 乃一人所造之業餘之物。可用，然未盡善；若有闕漏，敬請告之——見 [CONTRIBUTING.md](./CONTRIBUTING.md) 與 [SECURITY.md](./SECURITY.md)。

**平台惟 Windows 耳。** 官方建置、測試與支援皆以 Windows 為的。macOS / Linux 或可由原始碼自建，然非官方所支援，亦無代碼簽章之議——首啟之時或見 SmartScreen「未知發行者」之警（見 [下載](#download)）。

**一器而容諸模型。** OpenAI / Claude / DeepSeek / 本地模型 / 凡 OpenAI 相容之端——可相談、可令編寫 Agent 運行、可於伴 ELO 投票之多模型競技場中並列比較諸模型。

**本地為先，匠心所繫。** API 鑰與對談存於本地 SQLite 庫，除發往汝所設之供應商外，決不離汝機器。

**安全為本，預設而然。** 內置 Agent 於工作區沙箱中運行，並設許可階梯：文件與命令之存取，先確認而後行；凡工具之調用，皆可稽考。

---

## Aether 何以別於他者

Aether 合眾器之長，納於一本地桌面應用之中：

| 能事 | 說明 | 成熟度 |
|---|---|:---:|
| **多供應商對話** | 於 OpenAI、Claude、DeepSeek 及凡 OpenAI 相容端之間切換，會話中可隨時易之。 | `Stable` |
| **Agent 工具迴圈** | 四十二內建工具，伴 Plan-Act-Observe 迴圈、沙箱、許可階梯。 | `Beta` |
| **多模型競技場** | 一提示同發多模型，投票選最佳，追蹤 ELO 排名。 | `Beta` |
| **技能與擴充** | 放入 `SKILL.md` 檔案、MCP 伺服器、十點鉤子系統。 | `Experimental` |
| **結構化記憶** | Agent 越會話自動憶汝偏好與舊決策。 | `Beta` |
| **階層式規劃** | 複雜請求自動拆解為並行子任務。 | `Experimental` |
| **上下文壓縮** | 長對話自動摘要，不丟 tool-call 對。 | `Beta` |
| **本地優先隱私** | 對話、鑰、人格存本地 SQLite。無物離汝機器。 | `Stable` |
| **十五種界面語** | 含文言與 RTL 阿拉伯語。 | `Beta` |
| **終端 TUI** | Ink v5 交互終端：會話流、工具卡、diff 審閱/回滾、鍵盤權限門、`/fork` 會話樹、`/memory`、運行中 steering 回注。 | `Beta` |
| **無頭 CLI · RPC · SDK** | 四模式 CLI（單發 / NDJSON / JSONL RPC / 管道）、Electron-free SDK（`aetherai/sdk`）、機器可調用之 JSONL 協議。 | `Beta` |
| **MIT 授權** | 完全開放原始碼。 | `Stable` |

---

## 下載

### Windows — 預裝安裝程式（薦於眾用）

下載最新 [Release](https://github.com/TQSY114514/Aether/releases)：

| 建構 | 說明 |
|---|---|
| **`aetherai-setup-x.y.z.exe`** | NSIS 安裝程式。按用戶裝（不需管理員），應用內自動更新。**推薦。** |
| **`aetherai-x.y.z.exe`** | 可攜單一執行檔。免安裝、不自動更新；徑執行即可。 |

> 安裝程式首啟之時，SmartScreen 示「未知發行者」之警——此於未簽章之個人應用為常態。諸數據悉留本地。
>
> ⚠️ 部分防毒軟體或於封裝時隔離未解壓之 `electron.exe`，蓋因本應用未經簽章。若安裝程式為汝之防毒所除，請加例外或改用可攜版。

### 從原始碼執行（開發者 / 進階用戶）

若欲從原始碼執行，或欲改其碼，請用 `start.bat`（需 [Node.js 18+](https://nodejs.org)）：

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether
start.bat        # Windows: installs deps, builds frontend, launches Electron
```

手動步驟詳見 [速成](#-quick-start)。

> **exe 與 start.bat** —— 二者皆受支援，各適其用：
> - **安裝程式 exe** —— 為終端用戶：雙擊即裝，開始選單有徑，應用內自動更新，不需 Node.js。
> - **start.bat** —— 為開發者 / 好事者：透明之 `npm install` → `vite build` → `electron .` 之流，改碼即行，需 Node.js。

---

## 速成

**前置：** Node.js 18+、npm 9+

```bash
cd app
npm install
npm run dev      # development (hot reload)
npm run build    # production frontend
npm start        # launch Electron
```

或於 Windows 上徑執行倉庫根之 `start.bat`。

### 試用終端（無需 Electron 窗口）

```bash
cd app && npm install
node cli.js tui              # 交互终端 UI（Node ≥ 22；Windows Terminal 体验最佳）
node cli.js "你好"           # 单发 prompt
echo "总结一下" | node cli.js  # 管道 stdin 作为 prompt
node cli.js --mode json "x"  # NDJSON 事件流（脚本/CI）
node cli.js tui --smoke      # headless 状态机冒烟
```

### 設定供應商

1. 啟動後，點側欄之 **Models**。
2. 增供應商（名 / API URL / API Key）。
3. 點 **Fetch models** 取可用模型清單。
4. 歸聊天，遂始交談。

### 啟用詢問模式

1. 開 **設定 - Agent 與安全**。
2. 將 Agent 許可模式設為 **Ask**。
3. 確認 workspace root 為汝欲 Agent 讀寫之資料夾。
4. 除非欲無限制存取，否則保持 **Yolo** 關閉。

### 行首個 Agent 任務

1. 開新聊天。
2. 問曰：`List the files in this project and summarize what the app does.`
3. 審每個所提之工具呼叫。允安全之讀；拒意外之操作。
4. 觀即時推理軌跡與最終答案。

---

## 功能

**狀態標籤：** `Stable` = 宜日常用，`Beta` = 可用而有已知粗糙，`Experimental` = 新/進階功能或將變動，`Planned` = 已列路線圖而未竟。

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
| **側欄摘要** | `Beta` | 模型生成主題語，非複製之文。 |

### Agent（函式呼叫）

- `Beta` **四十二內建工具** —— 檔案之屬（`read_file`、`list_dir`、`glob_find`、`grep_search`、`write_file`、`edit_file`、`apply_patch`）、網路（`web_search`、`web_fetch`）、外殼（`run_command`）、git 與 GitHub（`git_status`、`git_diff`、`git_log`、`git_commit`、`git_push`、`git_create_branch`、`github_pr_create/list/merge/review`、`github_issue_create/list`、`github_release_create`、`github_actions_status`）、碼之智能（`find_symbol`、`lsp_definition`、`lsp_references`、`lsp_diagnostics`、`lsp_code_actions`、`lsp_rename`）、Agent 元層（`use_skill`、`ask_user`、`todo_write`、`delegate_task`、`task`、`memory_save/list/search`、`get_project_context`、`review_code`、`debug_loop`、`test_first`）——伴 Plan-Act-Observe 迴圈、即時推理軌跡 + 任務清單、迴圈偵測、每工具超時、可配置之迭代預算（預設 25 回合）與上下文壓縮。
- `Experimental` **階層式規劃** —— 自動為複雜請求產任務分解（DS4 啟發）。
- `Experimental` **子代理委派** —— 獨立子任務經 `delegate_task` 並行執行。
- `Stable` **許可模式** —— 風險遞升之階梯：

| 模式 | 說明 | 沙箱 |
|---|---|:---:|
| **關閉** | 純聊天，無工具 | N/A |
| **計畫** | 唯讀工具（調查而不改） | - |
| **詢問** | 確認每風險操作（推薦） | - |
| **自動** | 行一切，不需確認 | 有 |
| **Yolo** | 全許可，無沙箱 | 無 |

- `Stable` **工作區沙箱** —— `write_file`/`edit_file` 於所設工作區根目錄之外者，一概拒之；`run_command` 阻破壞之式。可於設定 - Agent 與安全中配置。
- `Beta` **上下文壓縮** —— 自動摘要舊歷史（tool-call/result 對保持完整；標識符逐字保留）。
- `Beta` **工具呼叫修復** —— 自動修復畸形之 JSON、缺失之引數、未引之鍵與截斷之呼叫。

### 記憶與學習

- `Beta` **自動長期記憶** —— 每回合前注入相關記憶；自動提取並存關鍵事實。可於設定 - Agent 切換。
- `Experimental` **習慣學習器** —— 偵測重複之偏好（如「始終用 Claude」）並提議自動套用之技能。
- `Beta` **稽核日誌** —— 每回合 Agent 執行軌跡，便於除錯。

### 競技場

- `Beta` **多模型競技場** —— 一提示，多模型**同時**作答；投票選最佳，**ELO 排行榜**自動更新。模型按**意圖**打分（編碼 / 數學 / 翻譯 / 摘要 / 一般）。*本地優先之桌面聊天應用中，無他者內建帶 ELO 之多模型競技場。*

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

> **諸數據悉存本地。** Aether 不集不傳關於汝之事。汝之 API 鑰、對話與人格存於本地 SQLite 資料庫。唯一向外之網路請求僅發往汝所設之 LLM 供應商。

---

## VS Code 擴充與無頭 CLI

除桌面應用外，Aether 亦以 CLI 與編輯器擴充之形同售其 Agent：

- **無頭 CLI**（`app/cli.js`）—— 非交互運行 Agent，以 NDJSON 事件供於腳本 / CI：
  ```bash
  node app/cli.js "fix the failing test" --workspace . --mode auto --max-iterations 30 --json-lines
  ```
- **VS Code 擴充**（`extension/`）—— 於聊天面板中生起 CLI：即時工具呼叫流、碼塊動作（Insert / Write file），及**檔案 diff 卡**：凡 `write_file` / `edit_file` / `apply_patch` 之調用，皆對照變更前之檔案內容，呈行級 diff，一鍵 **Revert**（還原工具運行前所攝之快照）。須設擴充選項 `aether.cliPath`（本地克隆此倉庫時自動偵測）。
- **本地閘道**（`127.0.0.1:35791`）—— OpenAI 相容之 REST API，以桌面應用為其後盾（設定 → Local Gateway → token）；另有擴充（`extensions/vscode-aether/`）經此而通。

---

## 終端 TUI、RPC 與 SDK

除桌面應用與純 CLI 外，Aether 亦售互動終端界面、機器可調用之 JSONL RPC 模式與 Electron-free SDK。三者與桌面版共享同一 Agent 內核、記憶、人設、MCP 工具與許可規則。

### 速啟——雙形

```bash
# Interactive terminal UI (Ink v5; requires Node ≥ 22)
node app/cli.js tui                # real terminal: type, approve tools, review diffs
node app/cli.js tui --smoke        # headless state-machine smoke (CI-safe, prints JSON)

# Single-shot prompt (same as before)
node app/cli.js "fix the failing test" --mode auto --max-iterations 30

# NDJSON event stream for scripts/CI (compat: --json-lines)
echo "summarize README.md" | node app/cli.js --mode json --model deepseek

# JSONL RPC loop over stdin/stdout
printf '{"type":"request","reqId":"c1","method":"listModels","params":{}}\n' \
  | node app/cli.js --mode rpc --db path\to\aetherai.db
```

另有無頭之旗標：`--persona <id>`（persona + 記憶注入）、`--memory-trace`（報告注入記憶條目之數）、`--skills`（技能提案 JSON）、`--setup-term`（寫入 Windows Terminal profile）、`--stdin`（顯式管道輸入）。

### TUI（`aether tui`）

互動終端 Agent（Ink v5；Node ≥ 22；於 Windows Terminal 中體驗最佳）：

- **會話**：消息流式渲染、`/fork` 會話樹（`session.parent_session_id`）、`/sessions`、`/use <id>` 歷史切換
- **工具與權限**：工具調用卡（狀態色/耗時/摘要）、diff 審閱（`Alt+v` 展開，`Enter` 接受 / `r` 回滾——寫前快照還原，非 git 目錄亦有效）、鍵盤權限門（`y` 允許一次 / `a` 總是允許 / `n` 拒絕，或 `←→` 選擇）、唯讀工具自動放行
- **審批模式**：`Shift+Tab` 循環 `manual → auto-edits → plan`（plan = 唯讀規劃，完畢後三選項定其施為）
- **模式**：`Alt+m` 切換 ask/plan/auto；`/persona <id>` 切換人設（注入 persona + 記憶前綴）
- **leader 快捷鍵**：`Ctrl+X` 然後 `m` 模型選擇器 / `n` 新會話 / `l` 會話列表 / `g` 時間線 / `r` rewind 檢查點 / `q` 退出
- **命令面板**：`Ctrl+P` 或 `x`（New chat / Model / Timeline / Export JSONL / Help / Quit）
- **鍵位可重綁**：`~/.config/aether/keybindings.json`（如 `{ "char:?": null }` 禁用 `?` 幫助鍵）
- **API key 持久化**：`/apikey <provider> <key>` 存於 `auth.json`（桌面版 safeStorage 加密之 key，在 headless 無法解密，用此命令或環境變數 `AETHER_API_KEY`）
- **記憶與技能閉環**：`/memory <關鍵詞>` 檢索、`--memory-trace` 注入條目數、`/skills` + `/skill accept|dismiss <key>`（habitLearner → 技能提案）
- **steering**：運行中 `Ctrl+C` 打斷 → 輸入下一條 → 注入當前循環（隊列顯示 `steer:n`）；運行中 `Tab` 直接排隊下一條
- **快捷鍵**：雙擊 `Esc` 退出（或 `/quit`）、`Esc` 清空輸入（草稿入歷史）、`?` 幫助屏、`PgUp/PgDn`/滑鼠滾輪翻頁、狀態欄實時顯示 `approval/mode/model/tok/ctx`；完整鍵位見 [docs/tui-keys.md](./docs/tui-keys.md)

### RPC（`aether --mode rpc`）

機器可調用之 JSONL 協議，行於 stdin/stdout 之間：`request` 幀入，`event`/`result`/`error` 幀出——每行一 JSON 物件，無人間之語。方法：`run`（流式輸出 `text`/`tool`/`plan`/`status` 事件）、`listModels`、`listProviders`、`models.default`、`listSessions`、`session.load`、`session.fork`、`task.derive`、`task.status`。幀之參考：[docs/rpc.md](./docs/rpc.md)。

### SDK（`require('aetherai/sdk')`）

Electron-free 之 Agent 內核聚合，供外部 Node 專案所用：`runAgent`、`openDatabase`、`resolveProviderModel`、`taskDbAdapter`、`memory`（prefetch/recall/search/…）、`classifyAgentMode`、`rpc` 幀、`sessionContext`（persona + 記憶注入）。內含型別宣告（`app/electron/sdk/index.d.ts`）。

```js
const { runAgent, openDatabase, resolveProviderModel, classifyAgentMode } = require('aetherai/sdk')
const db = openDatabase('./aetherai.db')
const { provider, model } = resolveProviderModel(db, { modelName: 'deepseek' })
console.log(classifyAgentMode({ prompt: 'delete the file' })) // { mode: 'ask', reason: ... }
```

---

## Windows 原生

| 能力 | 說明 |
|---|---|
| **托盤選單** | 顯示/隱藏窗口、新建會話、**新建任務**（直接打開 TaskPanel）；托盤點擊切換顯隱。 |
| **全局快捷鍵** | `Ctrl+Alt+A` 喚出主窗口（未啟動則創建）；註冊結果寫入啟動日誌。 |
| **`aetherai://` 協議** | `aetherai://new` / `chat` 新建會話；`aetherai://tui` 提示終端形態；`aetherai://open/?path=<編碼路徑>` 以資料夾為工作區並新建會話（右鍵「用 Aether 打開」之鏈）。 |
| **右鍵註冊** | `app/resources/register-protocol.reg`（替換 `<AETHER_EXE>` 後以管理員匯入）：`.cs/.js/.ts/.tsx/.md/.json` + 資料夾 → 右鍵「用 Aether 打開」。 |
| **終端引導** | `app/resources/term/aether.ps1`（別名 + 啟動 `aether tui`）；`node app/cli.js --setup-term` 寫入 Windows Terminal profile（深/淺兩套配色）。 |
| **沙箱強化** | Windows 路徑防禦：`\\?\` 長路徑、UNC `\\server\share`、重解析點/junction 逃逸、`.lnk/.scr/.msi` 等危險副檔名。 |

---

## 專案結構

```
app/
├── electron/              # main process (Node)
│   ├── database.js        # better-sqlite3 data layer — 25+ tables (WAL)
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
└── resources/             # App icons
```

---

## 技術棧

| 層 | 技術 |
|---|---|
| 桌面 | Electron 43 |
| 前端 | React 18.3 + TypeScript 5.8 |
| 狀態 | Zustand 4.5 |
| 建構 | Vite 8 + electron-builder |
| 資料庫 | better-sqlite3（原生 SQLite，WAL 模式） |
| LLM | OpenAI 相容 + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | 自訂 stdio JSON-RPC 2.0 用戶端 |
| TUI | Ink 5 + React 18（createElement，無 JSX） |
| CLI/SDK | Node.js 無頭 CLI（四模式）+ Electron-free SDK |

---

## 鳴謝

Aether 竊比諸子，納百川而成海。下列諸專案之念，塑其架構與 UX：

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
| [MCP](https://modelcontextprotocol.io) | Aether Agent 所說之規 |
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

[MIT](./LICENSE) © 2025 Aether

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#aether)

</div>
