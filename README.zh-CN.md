<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**本地优先的多模型桌面 AI 聊天客户端 · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/TQSY114514/AetherAI?style=social)](https://github.com/TQSY114514/AetherAI/stargazers) [![GitHub forks](https://img.shields.io/github/forks/TQSY114514/AetherAI?style=social)](https://github.com/TQSY114514/AetherAI/network/members) [![GitHub issues](https://img.shields.io/github/issues/TQSY114514/AetherAI)](https://github.com/TQSY114514/AetherAI/issues) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]() [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)]() [![electron](https://img.shields.io/badge/electron-31-4781ff.svg)]() [![i18n](https://img.shields.io/badge/i18n-15%20languages-blue.svg)]() [![tools](https://img.shields.io/badge/agent-16%20tools-green.svg)]() [![mcp](https://img.shields.io/badge/MCP-supported-purple.svg)]()

</div>

---

> **状态：测试版（beta）。** AetherAI 是个人/业余项目,能用,但会有粗糙之处。欢迎提 bug——见 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [SECURITY.md](./SECURITY.md)。


AetherAI 将多个 LLM 提供商（OpenAI / Claude / DeepSeek / 本地模型 / 任何 OpenAI 兼容端点）统一到一个桌面应用中。所有数据均存储在本地——你的 API 密钥和对话除了发往你所配置的提供商外,绝不会离开你的电脑。

## ⚡ 为什么选择 AetherAI？

| 特性 | AetherAI | ChatGPT Desktop | Claude Code | Continue |
|------|----------|-----------------|-------------|----------|
| **本地优先** | 完整本地 SQLite，无云同步 | 少量本地数据 | CLI，配置本地 | 配置本地 |
| **多提供商切换** | ✅ 对话中切换提供商 | ❌ 仅 OpenAI | ❌ 仅 Anthropic | ✅ 多提供商 |
| **内置 Agent（工具循环）** | ✅ 16 工具 + 沙箱 + 权限 | ❌ | ✅（工具有限） | ✅ |
| **多模型竞技场 + ELO** | ✅ 投票排行 | ❌ | ❌ | ❌ |
| **Skills 系统** | ✅ SKILL.md 格式 | ❌ | ✅ SKILL.md | ✅ |
| **Hooks（10 个扩展点）** | ✅ 工具前后/压缩/会话等 | ❌ | ✅ | ✅ |
| **上下文压缩** | ✅ 保留 tool-call/result 对 | ❌ | ❌ | ❌ |
| **MCP 支持** | ✅ stdio JSON-RPC 2.0 | ❌ | ❌ | ❌ |
| **Sub-agent 委派** | ✅ 并行 | ❌ | ❌ | ❌ |
| **自动长期记忆** | ✅ 结构化，时间衰减 | ❌ | ❌ | ❌ |
| **规划系统** | ✅ 分层任务分解（DS4） | ❌ | ❌ | ❌ |
| **权限模式** | ✅ 5 档（关闭/只读/询问/自动/Yolo） | ❌ | ✅ | ✅ |
| **界面语言** | ✅ 15 种含文言文、RTL 阿拉伯语 | 有限 | 英语 | 有限 |
| **平台** | Windows（macOS/Linux 计划中） | Win/Mac | CLI（跨平台） | VS Code/IDE |
| **开源** | ✅ MIT | ❌ | ❌ | ✅ MIT |

> AetherAI 集 Claude Code 的 Agent 能力、Continue 的多提供商灵活性于一身，并增加了独特的本地优先桌面体验、竞技场投票、结构化记忆和深度定制——全在一个应用中。

---

## 📑 Table of Contents

- [✨ 功能特性](#-功能特性)
  - [🖥️ 聊天](#️-chat)
  - [🤖 Agent (函数调用)](#-agent-函数调用)
  - [🔒 隐私](#-privacy)
- [⚡ 为什么选择 AetherAI](#-为什么选择-aetherai)
- [🚀 快速开始](#-快速开始)
- [📁 项目结构](#-项目结构)
- [🤝 致谢](#-致谢)
- [📄 许可证](#-许可证)

---

## ✨ 功能特性

### 🖥️ 聊天

- **多提供商抽象** — 单一适配层;新增一种提供商格式只需一个文件。目前兼容 OpenAI 格式(涵盖 OpenRouter、Together、DeepSeek、Ollama 的 OpenAI shim、LM Studio 等)。
- **并发多会话流式响应** — 一个对话可以一边流式输出,你同时还能在另一个对话里继续聊天。
- **竞技场(Arena)** — 同一个提示词,多个模型同时作答;为最佳回答投票,ELO 排行榜自动更新。
- **人格(Personas)** — 系统提示词预设,每个会话可独立切换。
- **附件** — 文本文件作为上下文注入;图片走多模态通道(需视觉模型)。
- **长粘贴折叠** — 粘贴数百行文本时自动折叠为可展开的代码片段(类 ChatGPT 风格)。
- **思考强度滑块** — 透传真实参数:OpenAI o 系列 → `reasoning_effort`,Claude → `thinking.budget_tokens`。
- **侧栏摘要** — 标题由模型生成的主题短语(如「新英雄天使抽卡建议」),而非直接复制的正文。
- **高级设置** — max tokens、temperature、top_p、自定义系统前缀、按语言自动生成标题。
- **自定义背景** — 上传图片,可调节不透明度与模糊度。
- **15 种界面语言** — English(标准版 + 颠倒版)、中文(简体/繁体/文言)、日本語、español、français、Deutsch、português、русский、українська、العربية(RTL)、हिन्दी、한국어。
- **主题** — 浅色 / 深色 / 蓝色 / 玻璃 / 复古。

### 🤖 Agent (函数调用)

- **内置 13 个工具** (`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`),配合「规划→执行→观察」循环与实时推理轨迹。
- **Agent 权限模式** — 关闭 / 询问(逐个确认高风险工具)/ 自动(全部放行)/ 规划(只读)。与编程型 Agent 的权限模型一致。
- **MCP 支持** — 可连接外部 stdio MCP 服务器;其工具会自动并入内置工具集。
- **Tool call repair** — LLMs 偶尔会产生格式错误的 JSON;agent 循环会在执行前自动修复缺失的参数、未加引用的键和被截断的调用。

---

## 🚀 快速开始

### 前置要求
- Node.js 18+
- npm 9+

### 安装与运行
```bash
cd app
npm install
npm run dev      # 开发模式(热重载)
npm run build    # 构建生产前端
npm start        # 启动 Electron
```

在 Windows 上也可直接运行仓库根目录下的 `start.bat`。

### 配置你的第一个提供商
1. 启动后,点击侧栏中的 **Models**。
2. 添加一个提供商(名称 / API URL / API Key)。
3. 点击 **Fetch models** 拉取可用模型列表。
4. 返回聊天界面即可开始对话。

---

## 📁 项目结构

```
app/
├── electron/              # 主进程(Node)
│   ├── database.js        # SQLite (sql.js) 数据层
│   ├── ipc/               # IPC 处理器(chat / arena / session / mcp / ...)
│   ├── llm/               # LLM 抽象
│   │   ├── providerAdapter.js   # 按 api_format 分发
│   │   ├── openaiAdapter.js     # OpenAI 兼容实现
│   │   ├── reasoning.js         # 思考强度参数构建器
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
│   ├── tools/             # 内置工具注册表
│   │   ├── registry.js         # 16 tool definitions (OpenClaw-inspired)
│   │   └── sandbox.js          # 3-layer defense (workspace root, traversal guard, blocklist)
│   ├── mcp/               # MCP 客户端 + 管理器
│   ├── main.js / preload.js
├── src/                   # 渲染进程(React + TS)
│   ├── store/index.ts     # zustand 全局状态
│   ├── components/        # UI(chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n(15 种语言)/ 主题 / markdown
│   └── types/
├── skills/                # Built-in skills (release-checklist, git-commit)
├── commands/              # Built-in slash commands (/code, /explain, /polish, …)
├── locales/               # Translation files (13 languages, lazy-loaded)
└── resources/             # App icons
```

---

