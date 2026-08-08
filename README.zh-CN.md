<div align="center">

<img src="./assets/readme-hero.svg" width="780" alt="AetherAI" />

# AetherAI

### 任意模型都能聊、安全编写代码 Agent、多模型横向对比——一切都在你的设备本地

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/Aether?style=flat-square&label=latest)](https://github.com/TQSY114514/Aether/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/Aether?style=flat-square&color=blue)](https://github.com/TQSY114514/Aether/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/Aether?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/Aether/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/Aether?style=flat-square&label=Forks)](https://github.com/TQSY114514/Aether/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/Aether?style=flat-square&label=Issues)](https://github.com/TQSY114514/Aether/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-quick-start) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

`Beta` · `Solo / Hobby Project` · `MIT Licensed`

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **状态:Beta。** AetherAI 是个人/业余项目。它能用,但会有粗糙之处。欢迎提 bug——见 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [SECURITY.md](./SECURITY.md)。

将多个 LLM 提供商——OpenAI / Claude / DeepSeek / 本地模型 / 任何 OpenAI 兼容端点——统一到一个桌面应用中。聊天、运行编码 Agent、在带 ELO 投票的多模型竞技场里横向对比模型能力。

**本地优先。** API 密钥和对话存储在本地 SQLite 中,除了发往你所配置的提供商外,绝不会离开你的电脑。

**安全默认。** 内置 Agent 在工作区沙箱内运行并配有权限阶梯:文件和命令访问在执行前需确认,每次工具调用均可审计。

---

## AetherAI 有什么不同

AetherAI 把通常分散在多个工具中的若干能力整合到一个本地桌面应用中:

| 能力 | 说明 | 成熟度 |
|---|---|:---:|
| **多提供商聊天** | 对话中途可在 OpenAI、Claude、DeepSeek 和任意 OpenAI 兼容端点之间切换。 | `Stable` |
| **Agent 工具循环** | 16 个内置工具,配合 Plan-Act-Observe 循环、沙箱与权限阶梯。 | `Beta` |
| **多模型竞技场** | 同一提示词发给多个模型,为最佳回答投票,跟踪 ELO 排名。 | `Beta` |
| **Skills 与可扩展性** | 放入即用的 `SKILL.md` 文件、MCP 服务器、10 点钩子系统。 | `Experimental` |
| **结构化记忆** | Agent 跨会话回忆偏好与过往决策。 | `Beta` |
| **分层规划** | 复杂请求自动拆解为并行子任务。 | `Experimental` |
| **上下文压缩** | 长对话自动摘要,且不丢失 tool-call 对。 | `Beta` |
| **本地优先隐私** | 对话、密钥、人格均存于本地 SQLite。任何数据都不离开你的电脑。 | `Stable` |
| **15 种界面语言** | 包括文言文(Classical Chinese)和 RTL 阿拉伯语。 | `Beta` |
| **MIT 许可证** | 完全开源。 | `Stable` |

---

## 下载

### Windows — 预编译安装包(推荐大多数用户使用)

下载最新的 [Release](https://github.com/TQSY114514/Aether/releases):

| 构建 | 说明 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS 安装程序。按用户安装(无需管理员),应用内自动更新。**推荐。** |
| **`AetherAI-x.y.z.exe`** | 便携单文件版。无需安装,无自动更新;直接运行即可。 |

> 首次启动时安装程序会显示 SmartScreen「未知发布者」警告——对于未签名的个人应用属正常现象。所有数据均保留在本地。
>
> ⚠️ 由于应用未签名,某些杀毒软件可能会在打包过程中隔离解包后的 `electron.exe`。如果安装程序被你的 AV(杀软)删除,请添加排除项或使用便携版。

### 从源码运行(开发者 / 高级用户)

如果你倾向于从源码运行,或想要修改代码,请使用 `start.bat`(需要 [Node.js 18+](https://nodejs.org)):

```bash
git clone https://github.com/TQSY114514/Aether.git
cd AetherAI
start.bat        # Windows: 安装依赖、构建前端、启动 Electron
```

手动分步操作请见 [快速开始](#-quick-start)。

> **exe 与 start.bat** —— 两者均受支持,面向不同人群:
> - **安装版 exe** —— 面向终端用户:双击安装,开始菜单入口,应用内自动更新,无需 Node.js。
> - **start.bat** —— 面向开发者 / 折腾者:透明的 `npm install` → `vite build` → `electron .` 流水线,可即改即跑,需要 Node.js。

---

## 快速开始

**前置要求:** Node.js 18+,npm 9+

```bash
cd app
npm install
npm run dev      # 开发模式(热重载)
npm run build    # 构建生产前端
npm start        # 启动 Electron
```

或者在 Windows 上运行仓库根目录下的 `start.bat`。

### 配置提供商

1. 启动后,点击侧栏中的 **Models**。
2. 添加一个提供商(名称 / API URL / API Key)。
3. 点击 **Fetch models** 拉取可用模型列表。
4. 返回聊天界面即可开始对话。

### 启用 Ask 模式

1. 打开 **Settings - Agent & Safety**。
2. 将 Agent 权限模式设为 **Ask**。
3. 确认 workspace root 是你希望 Agent 读写的文件夹。
4. 除非需要无限制访问,否则保持 **Yolo** 关闭。

### 运行你的第一个 Agent 任务

1. 新建一个聊天。
2. 提问:`List the files in this project and summarize what the app does.`
3. 审查每个被提议的工具调用。批准安全的读取;拒绝任何意外操作。
4. 查看实时推理轨迹和最终回答。

---

## 功能特性

**状态标签:** `Stable` = 适合日常使用,`Beta` = 可用但有已知粗糙点,`Experimental` = 新/高级能力且行为可能变化,`Planned` = 已记录的路线图项目。

### 聊天

| 功能 | 状态 | 说明 |
|---|:---:|---|
| **多提供商** | `Stable` | 单一适配层;新增一个提供商 = 一个文件。覆盖 OpenRouter、Together、DeepSeek、Ollama、LM Studio…… |
| **并发流式响应** | `Stable` | 一个聊天流式输出的同时,你可在另一个聊天继续对话。 |
| **思考强度滑块** | `Beta` | 真实参数:OpenAI o 系列 / gpt-5 / Claude(经中继)。仅对推理模型有效。 |
| **附件** | `Beta` | 文本文件作为上下文;图片走多模态(需视觉模型)。 |
| **长粘贴折叠** | `Stable` | 数百行文本自动折叠为可展开的代码片段(类 ChatGPT 风格)。 |
| **消息编辑** | `Stable` | 覆盖并从任意点重新生成。 |
| **消息搜索** | `Stable` | 跨所有消息并带高亮。 |
| **侧栏摘要** | `Beta` | 由模型生成的主题短语,而非复制的正文。 |

### Agent(函数调用)

- `Beta` **16 个内置工具**(`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`、`use_skill`、`ask_user`、`todo_write`),配合 Plan-Act-Observe 循环、实时推理轨迹 + 任务清单、循环检测、逐工具超时、可配置的迭代预算(默认 25 轮)以及上下文压缩。
- `Experimental` **分层规划** —— 为复杂请求自动生成任务拆解(受 DS4 启发)。
- `Experimental` **子 Agent 委托** —— 独立子任务通过 `delegate_task` 并行运行。
- `Stable` **权限模式** —— 风险递增的阶梯:

| 模式 | 说明 | 沙箱 |
|---|---|:---:|
| **Off** | 普通聊天,无工具 | N/A |
| **Plan** | 只读工具(只调查不改动) | - |
| **Ask** | 逐个确认高风险操作(推荐) | - |
| **Auto** | 全部执行,无确认 | Yes |
| **Yolo** | 完全权限,无沙箱 | No |

- `Stable` **工作区沙箱** —— `write_file`/`edit_file` 在配置的 workspace root 之外会被拒绝;`run_command` 阻止破坏性模式。可在 Settings - Agent & Safety 中配置。
- `Beta` **上下文压缩** —— 自动摘要较早的历史(tool-call/result 对完整保留;标识符原样保留)。
- `Beta` **Tool call repair** —— 自动修复格式错误的 JSON、缺失的参数、未加引号的键和被截断的调用。

### 记忆与学习

- `Beta` **自动长期记忆** —— 每轮对话前注入相关记忆;关键事实自动提取并保存。可在 Settings - Agent 中开关。
- `Experimental` **习惯学习器** —— 检测重复出现的偏好(例如「总是用 Claude」)并建议自动应用的 Skills。
- `Beta` **审计日志** —— 每轮 Agent 执行轨迹,用于调试。

### 竞技场

- `Beta` **多模型竞技场** —— 一个提示词,多个模型**同时**作答;为最佳回答投票,**ELO 排行榜**自动更新。模型按**意图**评分(编程 / 数学 / 翻译 / 摘要 / 通用)。*没有其他本地优先的桌面聊天应用内置带 ELO 的多模型竞技场。*

### Skills 与可扩展性

| 组件 | 格式 | 状态 | 详情 |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | 放入 `<workspace>/.claude/skills/`;自带 `release-checklist` 和 `git-commit` |
| **斜杠命令** | `CMD.md` | `Stable` | 6 个内置: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **钩子(Hooks)** | 脚本 | `Experimental` | 10 个生命周期点: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | 外部 MCP 服务器自动与内置工具合并 |

### 自定义

| 设置项 | 状态 | 说明 |
|---|:---:|---|
| **高级模型设置** | `Stable` | max tokens、temperature、top_p、自定义系统前缀、按语言自动标题、思考强度 |
| **自定义背景** | `Stable` | 上传图片,支持不透明度 / 模糊度控制 |
| **人格(Personas)** | `Stable` | 系统提示词预设,可按会话切换 |
| **主题** | `Stable` | 浅色 / 深色 / 蓝色 / 玻璃 / 复古 |
| **15 种界面语言** | `Beta` | 英文、中文(简/繁/文言)、日文、西班牙文、法文、德文、葡萄牙文、俄文、乌克兰文、阿拉伯文(RTL)、印地文、韩文 |
| **自动更新** | `Beta` | NSIS 安装包启动时检查;便携版也支持(手动安装) |
| **使用追踪** | `Beta` | 每次 API 调用的日志:tokens、成本、延迟、缓存命中率 |

### 隐私

> **所有数据留在本地。** AetherAI 不收集任何关于你的信息,也不上传任何内容。你的 API 密钥、对话和人格存储在本地 SQLite 数据库中。唯一的出站网络请求只发往你配置的 LLM 提供商。

---

## 项目结构

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

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | Electron 31 |
| 前端 | React 18.3 + TypeScript 5.5 |
| 状态管理 | Zustand 4.5 |
| 构建 | Vite 5.4 + electron-builder |
| 数据库 | sql.js (SQLite in-memory, persisted to disk) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |

---

## 致谢

AetherAI 站在这些项目的肩膀上——它们的想法塑造了架构与体验:

### Agent 框架

| 项目 | 启发 |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent 权限模型、思考强度滑块、tool-call 可视化、子 Agent 委托、钩子 |
| [OpenClaw](https://github.com/openclaw/openclaw) | 上下文压缩、tool-call 循环检测、事件流架构 |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | 迭代预算、结构化长期记忆、自主 Skills |
| [Evolver](https://github.com/EvoMap/evolver) | 自进化引擎、GEP（基因组进化协议） |
| [pi](https://github.com/earendil-works/pi) | 事件流系统、AgentMessage 抽象层、Steering/Follow-up 机制 |
| [OpenAI Codex](https://github.com/openai/codex) | 沙箱机制、上下文压缩、tool-call 修复 |
| [DS4](https://github.com/antirez/ds4) | 分层任务拆解 |

### UI 与 UX

| 项目 | 启发 |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva 复制粘贴组件方法论 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 动画模式(shimmer、blur-fade) |
| [SonettoHere](https://github.com/SonettoHere) | 输入框引用系统和 UI/UX 灵感 |

### 基础设施

| 项目 | 启发 |
|---|---|
| [Dify](https://github.com/langgenius/dify) | 多格式提供商规范化 |
| [MCP](https://modelcontextprotocol.io) | AetherAI 的 Agent 所使用的协议规范 |
| [cc-switch](https://github.com/farion1231/cc-switch) | 使用统计仪表板布局 |
| [new-api](https://github.com/QuantumNous/new-api) | 推理强度中继、使用/成本追踪 |
| [Continue](https://github.com/continuedev/continue) | 配置即真相源、提供商抽象 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | 多轮 Agent 执行、沙箱化工具执行 |
| [Aider](https://github.com/Aider-AI/aider) | LLM 编程助手工具循环、Git 集成 |
| [Cline](https://github.com/cline/cline) | IDE 内嵌 Agent、MCP 集成、权限 UX |

---

## 贡献

欢迎所有形式的贡献!无论是 bug 修复、功能请求、翻译改进还是文档更新——请提 issue 或提交 PR。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feat/my-feature`)
3. 提交更改 (`git commit -am 'Add feature'`)
4. 推送到分支 (`git push origin feat/my-feature`)
5. 创建 Pull Request

详细指南请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 许可证

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

用 ❤️ 搭建,基于 Electron + React + TypeScript

[⬆ 回到顶部](#aetherai)

</div>
