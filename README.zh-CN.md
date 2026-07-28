<div align="center">

<img src="assets/logo.png" width="160" height="160" alt="AetherAI logo" />

# AetherAI

### A local-first, multi-model desktop AI workbench

**Electron · React · TypeScript · MCP · Agent · Skills**

[![GitHub Release](https://img.shields.io/github/v/release/TQSY114514/AetherAI?style=flat-square&label=latest)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub release date](https://img.shields.io/github/release-date/TQSY114514/AetherAI?style=flat-square&color=blue)](https://github.com/TQSY114514/AetherAI/releases) [![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=flat-square&label=Stars&color=gold)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=flat-square&label=Forks)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI?style=flat-square&label=Issues)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)
---

---

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](./LICENSE) [![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-download) [![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](#-install-from-source) [![Electron 31](https://img.shields.io/badge/Electron-31-2b3137?style=flat-square&logo=electron)](#-tech-stack) [![i18n - 15 Languages](https://img.shields.io/badge/i18n-15%20languages-6eeb67?style=flat-square)](#customization) [![MCP Supported](https://img.shields.io/badge/MCP-supported-violet?style=flat-square)](#skills--extensibility)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [文言文](./README.zh-WEN.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

---

> **状态：测试版（beta）。** AetherAI 是个人/业余项目，能用，但会有粗糙之处。欢迎提 bug——见 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [SECURITY.md](./SECURITY.md)。


AetherAI 将多个 LLM 提供商（OpenAI / Claude / DeepSeek / 本地模型 / 任何 OpenAI 兼容端点）统一到一个桌面应用中。所有数据均存储在本地——你的 API 密钥和对话除了发往你所配置的提供商外，绝不会离开你的电脑。

## ⚡ AetherAI 有什么不同？

AetherAI 把通常分散在多个工具中的能力整合到一个本地桌面应用中：

- `Stable` **对话内多提供商切换** — 在 OpenAI、Claude、DeepSeek 和任意 OpenAI 兼容端点之间自由切换，上下文不丢失。
- `Beta` **带工具循环的 Agent** — 16 个内置工具（文件读写、搜索、Shell、Git、Web、记忆、Skills、MCP），配合「规划→执行→观察」循环、实时推理轨迹、逐工具沙箱和可配置的权限阶梯。
- `Beta` **多模型竞技场** — 一个提示词同时发给多个模型，对最佳回答投票，ELO 排行榜自动更新。
- `Experimental` **Skills 与可扩展性** — 放入 `SKILL.md` 文件（Claude Code 格式），连接 MCP 服务器，或在 10 个生命周期钩子处写自定义脚本。
- `Beta` **结构化长期记忆** — Agent 跨会话自动回忆你的偏好和过往决策，无需手动记录。
- `Experimental` **分层规划** — 复杂请求自动拆解为子任务并行执行。
- `Beta` **上下文压缩** — 长对话自动摘要，保留 tool-call/result 对不丢失。
- `Stable` **一切在本地** — 对话、API 密钥和人格配置存储在本地 SQLite 数据库中。除了你配置的提供商外，没有任何数据会上传。
- `Beta` **15 种界面语言** — 包括文言文和 RTL 阿拉伯语。
- `Stable` **MIT 开源** — 完全开放源代码。

---

## 📑 Table of Contents

- [✨ 功能特性](#-功能特性)
  - [🖥️ 聊天](#️-chat)
  - [🤖 Agent (函数调用)](#-agent-function-calling)
  - [🧠 记忆与学习](#-memory--learning)
  - [🏟️ 竞技场](#-arena)
  - [🛠️ 技能与扩展性](#-skills--extensibility)
  - [⚙️ 自定义](#-customization)
  - [🔒 隐私](#-privacy)
- [📸 截图](#-screenshots)
- [📦 下载](#-download)
- [⏱️ 5 分钟设置](#-5-分钟设置)
  - [安装](#安装)
  - [配置提供商](#配置提供商)
  - [启用 Ask 模式](#启用-ask-模式)
  - [运行第一个 Agent 任务](#运行第一个-agent-任务)
  - [备注](#备注)
- [📁 项目结构](#-project-structure)
- [🔑 技术栈](#-tech-stack)
- [🤝 贡献](#-contributing)
- [🤝 致谢](#-acknowledgements)
- [📄 许可证](#-license)

---

## ✨ 功能特性

**状态标签：** `Stable` = 适合日常使用，`Beta` = 可用但仍有已知粗糙点，`Experimental` = 新/高级能力且行为可能变化，`Planned` = 已列入路线图但尚未完成。

### 🖥️ 聊天

- `Stable` **多提供商抽象** — 单一适配层;新增一种提供商格式只需一个文件。目前兼容 OpenAI 格式(涵盖 OpenRouter、Together、DeepSeek、Ollama 的 OpenAI shim、LM Studio 等)。
- `Stable` **并发多会话流式响应** — 一个对话可以一边流式输出,你同时还能在另一个对话里继续聊天。
- `Beta` **竞技场(Arena)** — 同一个提示词,多个模型同时作答;为最佳回答投票,ELO 排行榜自动更新。
- `Stable` **人格(Personas)** — 系统提示词预设,每个会话可独立切换。
- `Beta` **附件** — 文本文件作为上下文注入;图片走多模态通道(需视觉模型)。
- `Stable` **长粘贴折叠** — 粘贴数百行文本时自动折叠为可展开的代码片段(类 ChatGPT 风格)。
- `Beta` **思考强度滑块** — 透传真实参数:OpenAI o 系列 → `reasoning_effort`,Claude → `thinking.budget_tokens`。
- `Beta` **侧栏摘要** — 标题由模型生成的主题短语(如「新英雄天使抽卡建议」),而非直接复制的正文。
- `Stable` **高级设置** — max tokens、temperature、top_p、自定义系统前缀、按语言自动生成标题。
- `Stable` **自定义背景** — 上传图片,可调节不透明度与模糊度。
- `Beta` **15 种界面语言** — English(标准版 + 颠倒版)、中文(简体/繁体/文言)、日本語、español、français、Deutsch、português、русский、українська、العربية(RTL)、हिन्दी、한국어。
- `Stable` **主题** — 浅色 / 深色 / 蓝色 / 玻璃 / 复古。

### 🤖 Agent (Function Calling)

- `Beta` **内置 16 个工具** (`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`、`use_skill`、`ask_user`、`todo_write`),配合「规划→执行→观察」循环与实时推理轨迹。
- `Stable` **Agent 权限模式** — 关闭 / 询问(逐个确认高风险工具)/ 自动(全部放行)/ 规划(只读)。与编程型 Agent 的权限模型一致。
- `Beta` **MCP 支持** — 可连接外部 stdio MCP 服务器;其工具会自动并入内置工具集。
- `Beta` **Tool call repair** — LLMs 偶尔会产生格式错误的 JSON;agent 循环会在执行前自动修复缺失的参数、未加引用的键和被截断的调用。
- `Planned` **截图/GIF 展示区** — 下方已预留媒体位置;完成 UI 流程录制后会作为发布资源补齐。

### 🧠 记忆与学习

- `Beta` **自动长期记忆** — 每轮对话前自动注入相关记忆;关键事实自动提取并保存。可在 Settings - Agent 中开关。
- `Experimental` **习惯学习器** — 检测重复出现的偏好(例如「总是用 Claude」)并建议自动应用的 Skills。
- `Beta` **审计日志** — 每轮 Agent 执行轨迹,用于调试。

### 🏟️ 竞技场

- `Beta` **多模型竞技场** — 一个提示词,多个模型**同时**作答;为最佳回答投票,**ELO 排行榜**自动更新。模型按**意图**评分(编程/数学/翻译/摘要/通用)。*没有其他本地优先的桌面聊天应用内置带 ELO 的多模型竞技场。*

### 🛠️ 技能与扩展性

| 组件 | 格式 | 状态 | 详情 |
|---|---|:---:|---|
| **Skills** | `SKILL.md` | `Experimental` | 放入 `<workspace>/.claude/skills/`;自带 `release-checklist` 和 `git-commit` |
| **斜杠命令** | `CMD.md` | `Stable` | 6 个内置: `/code`, `/continue`, `/explain`, `/polish`, `/summarize`, `/translate` |
| **钩子(Hooks)** | 脚本 | `Experimental` | 10 个生命周期点: PreToolUse, PostToolUse, ToolError, PreCompact, PostCompact, PreSend, PostResponse, SessionStart, SessionEnd, SubagentStop |
| **MCP** | stdio JSON-RPC 2.0 | `Beta` | 外部 MCP 服务器自动与内置工具合并 |

### ⚙️ 自定义

| 设置项 | 状态 | 说明 |
|---|:---:|---|
| **高级模型设置** | `Stable` | max tokens、temperature、top_p、自定义系统前缀、按语言自动标题、思考强度 |
| **自定义背景** | `Stable` | 上传图片,支持不透明度/模糊度控制 |
| **人格(Personas)** | `Stable` | 系统提示词预设,可按会话切换 |
| **主题** | `Stable` | 浅色 / 深色 / 蓝色 / 玻璃 / 复古 |
| **15 种界面语言** | `Beta` | 英文、中文(简/繁/文言)、日文、西班牙文、法文、德文、葡萄牙文、俄文、乌克兰文、阿拉伯文(RTL)、印地文、韩文 |
| **自动更新** | `Beta` | NSIS 安装包启动时检查;便携版也支持(手动安装) |
| **使用追踪** | `Beta` | 每次 API 调用的日志:tokens、成本、延迟、缓存命中率 |

### 🔒 隐私

> **所有数据留在本地。** AetherAI 不收集任何关于你的信息,也不上传任何内容。你的 API 密钥、对话和人格存储在本地 SQLite 数据库中。唯一的出站网络连接只发往你配置的 LLM 提供商。

---

## 📸 截图

> 截图存放在 `assets/screenshots/` 目录下。

| 流程 | 预览 |
|---|:---:|
| 聊天流式输出 | `assets/screenshots/chat-streaming.gif` — _TODO_ |
| Agent 工具执行 | `assets/screenshots/agent-tool-execution.gif` — _TODO_ |
| 竞技场投票 | `assets/screenshots/arena-voting.gif` — _TODO_ |
| 提供商设置 | `assets/screenshots/provider-settings.png` — _TODO_ |

---

## 📦 下载

### Windows — 预编译版本（推荐）

下载最新 [Release](https://github.com/TQSY114514/AetherAI/releases):

| 构建类型 | 说明 |
|---|---|
| **`AetherAI-Setup-x.y.z.exe`** | NSIS 安装程序。按用户安装(无需管理员),应用内自动更新。**推荐。** |
| **`AetherAI-x.y.z.exe`** | 便携单文件版。无需安装,无自动更新;直接运行即可。 |

> 首次启动时安装程序会显示 SmartScreen「未知发布者」警告——对于未签名的个人应用属正常现象。所有数据均保留在本地。

---

## ⏱️ 5 分钟设置

### 安装

```bash
cd app
npm install
npm run dev      # 开发模式(热重载)
npm run build    # 构建生产前端
npm start        # 启动 Electron
```

在 Windows 上也可直接运行仓库根目录下的 `start.bat`。

### 配置提供商

1. 启动后,点击侧栏中的 **Models**。
2. 添加一个提供商(名称 / API URL / API Key)。
3. 点击 **Fetch models** 拉取可用模型列表。
4. 返回聊天界面即可开始对话。

### 启用 Ask 模式

1. 打开 **Settings - Agent & Safety**。
2. 将 Agent 权限模式设为 **Ask**。
3. 确认 workspace root 是你希望 Agent 读写的项目目录。
4. 除非明确需要无沙箱无限制访问,否则保持 **Yolo** 关闭。

### 运行第一个 Agent 任务

1. 新建一个聊天。
2. 输入一个小型、限定在工作区内的任务,例如:`List the files in this project and summarize what the app does.`
3. 检查每个工具调用请求;批准安全读取,拒绝任何意外操作。
4. 查看实时推理轨迹和最终回答。

### 备注

- 文档避免使用绝对本机路径;示例使用仓库相对路径,例如 `app/electron/main.js`。
- 本次已同步更新 `README.md` 和 `README.zh-CN.md`。其他语言 README 暂未全量翻译,后续可根据英文版补齐。

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

## 🔑 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | Electron 31 |
| 前端 | React 18.3 + TypeScript 5.5 |
| 状态管理 | Zustand 4.5 |
| 构建工具 | Vite 5.4 + electron-builder |
| 数据库 | sql.js (SQLite in-memory, persisted to disk) |
| LLM | OpenAI-compatible + Anthropic Messages API |
| UI | Tailwind CSS 3.4, lucide-react, highlight.js |
| MCP | Custom stdio JSON-RPC 2.0 client |

---

## 🤝 贡献

欢迎所有形式的贡献！无论是 bug 修复、功能请求、翻译改进还是文档更新,请提出 issue 或提交 PR。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feat/my-feature`)
3. 提交更改 (`git commit -am 'Add feature'`)
4. 推送到分支 (`git push origin feat/my-feature`)
5. 创建 Pull Request

详细指南请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 🤝 致谢

AetherAI 站在这些项目的肩膀上——它们的想法塑造了架构与体验:

### Agent 框架

| 项目 | 启发 |
|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | Agent 权限模型、思考强度滑块、tool-call 可视化、子 Agent 委托、钩子系统 |
| [OpenClaw](https://github.com/openclaw/openclaw) | 上下文压缩、tool-call 循环检测、事件流架构 |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | 迭代预算、结构化长期记忆、自主 Skills |
| [OpenAI Codex](https://github.com/openai/codex) | 沙箱机制、上下文压缩、tool-call 修复 |
| [DS4](https://github.com/antirez/ds4) | 分层任务拆解 |

### UI 与 UX

| 项目 | 启发 |
|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | cn() / cva 复制粘贴组件方法论 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 动画模式 (shimmer、blur-fade) |

### 基础设施

| 项目 | 启发 |
|---|---|
| [Dify](https://github.com/langgenius/dify) | 多格式提供商规范化 |
| [MCP](https://modelcontextprotocol.io) | AetherAI Agent 使用的协议规范 |
| [cc-switch](https://github.com/farion1231/cc-switch) | 使用统计仪表板布局 |
| [new-api](https://github.com/QuantumNous/new-api) | 推理强度中继、使用/成本追踪 |
| [Continue](https://github.com/continuedev/continue) | 声明式配置即真相源、提供商抽象 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | 多轮 Agent 执行、沙箱化工具执行 |
| [Aider](https://github.com/Aider-AI/aider) | LLM 编程助手工具循环、Git 集成 |
| [Cline](https://github.com/cline/cline) | IDE 内嵌 Agent、MCP 集成、权限 UX |

---

## 📄 许可证

[MIT](./LICENSE) © 2025 AetherAI

---

<div align="center">

Built with ❤️ using Electron + React + TypeScript

[⬆ Back to top](#-aetherai)

</div>
