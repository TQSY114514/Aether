<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="AetherAI logo" />

# AetherAI

**本地优先的多模型桌面 AI 聊天客户端 · Electron + React + TypeScript**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [español](./README.es.md) · [français](./README.fr.md) · [Deutsch](./README.de.md) · [português](./README.pt.md) · [русский](./README.ru.md) · [українська](./README.uk.md) · [العربية](./README.ar.md) · [हिन्दी](./README.hi.md) · [한국어](./README.ko.md)

</div>

> **状态：测试版（beta）。** AetherAI 是个人/业余项目,能用,但会有粗糙之处。欢迎提 bug——见 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [SECURITY.md](./SECURITY.md)。


AetherAI 将多个 LLM 提供商（OpenAI / Claude / DeepSeek / 本地模型 / 任何 OpenAI 兼容端点）统一到一个桌面应用中。所有数据均存储在本地——你的 API 密钥和对话除了发往你所配置的提供商外,绝不会离开你的电脑。

## ✨ 功能特性

- **多提供商抽象** — 单一适配层;新增一种提供商格式只需一个文件。目前兼容 OpenAI 格式(涵盖 OpenRouter、Together、DeepSeek、Ollama 的 OpenAI shim、LM Studio 等)。
- **并发多会话流式响应** — 一个对话可以一边流式输出,你同时还能在另一个对话里继续聊天。
- **竞技场(Arena)** — 同一个提示词,多个模型同时作答;为最佳回答投票,ELO 排行榜自动更新。
- **人格(Personas)** — 系统提示词预设,每个会话可独立切换。
- **附件** — 文本文件作为上下文注入;图片走多模态通道(需视觉模型)。
- **长粘贴折叠** — 粘贴数百行文本时自动折叠为可展开的代码片段(类 ChatGPT 风格)。
- **Agent(函数调用)** — 内置 13 个工具(`read_file`、`list_dir`、`glob_find`、`grep_search`、`web_search`、`web_fetch`、`write_file`、`edit_file`、`run_command`、`git_status`、`git_diff`、`memory_save`、`memory_list`),配合「规划→执行→观察」循环与实时推理轨迹。
- **Agent 权限模式** — 关闭 / 询问(逐个确认高风险工具)/ 自动(全部放行)/ 规划(只读)。与编程型 Agent 的权限模型一致。
- **MCP 支持** — 可连接外部 stdio MCP 服务器;其工具会自动并入内置工具集。
- **思考强度滑块** — 透传真实参数:OpenAI o 系列 → `reasoning_effort`,Claude → `thinking.budget_tokens`。
- **侧栏摘要** — 标题由模型生成的主题短语(如「新英雄天使抽卡建议」),而非直接复制的正文。
- **高级设置** — max tokens、temperature、top_p、自定义系统前缀、按语言自动生成标题。
- **自定义背景** — 上传图片,可调节不透明度与模糊度。
- **15 种界面语言** — English(标准版 + 颠倒版)、中文(简体/繁体/文言)、日本語、español、français、Deutsch、português、русский、українська、العربية(RTL)、हिन्दी、한국어。
- **主题** — 浅色 / 深色 / 蓝色 / 玻璃 / 复古。
- **本地存储** — 所有数据存于本地 SQLite 数据库,不上传任何内容。

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
│   │   ├── autoMemory.js        # structured long-term memory (Hermes-inspired)
│   │   └── toolArgs.js          │ # tool-arg parsing
│   ├── tools/             # 内置工具注册表
│   ├── mcp/               # MCP 客户端 + 管理器
│   ├── main.js / preload.js
├── src/                   # 渲染进程(React + TS)
│   ├── store/index.ts     # zustand 全局状态
│   ├── components/        # UI(chat / sidebar / settings / ui)
│   ├── pages/             # Chat / Models / Persona / Settings / Scores / ...
│   ├── utils/             # i18n(15 种语言)/ 主题 / markdown
│   └── types/
└── package.json
```

## 🔒 隐私

**所有数据均存储在本地。** AetherAI 不收集、也不上传任何关于你的信息。你的 API 密钥、对话和人格都存放在本地 SQLite 数据库中。唯一的对外网络请求,仅发往你所配置的 LLM 提供商。

> ⚠️ 推送到 GitHub 之前,请确保 `.gitignore` 已排除 `*.db`、`dist/`、`node_modules/`、`background.img` 以及任何 `.env` 文件。

## 🙏 致谢

AetherAI 站在这些项目的肩膀上——它们的理念塑造了本项目的架构与交互体验:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — Agent 权限模型、思考强度滑块、工具调用可视化、新会话空状态。
- [Continue](https://github.com/continuedev/continue) — 以声明式配置作为唯一事实来源、提供商抽象层、函数调用协议。
- [Dify](https://github.com/langgen/dify) — 多格式提供商归一化范式。
- [Model Context Protocol](https://modelcontextprotocol.io) — AetherAI 的 Agent 所使用的 MCP 规范。
- [shadcn/ui](https://github.com/shadcn-ui/ui) — cn() / cva 复制粘贴式组件方法论。
- [Magic UI](https://github.com/magicuidesign/magicui) — 动画范式(流式文本、微光、模糊渐隐)。
- [new-api](https://github.com/QuantumNous/new-api) — reasoning-effort 中继转换参考。
- [OpenClaw](https://github.com/openclaw/openclaw) — README 润色与上手引导灵感。
- [DS4](https://github.com/antirez/ds4) — structured task decomposition before execution.
- [Hermes](https://github.com/NousResearch/Hermes) — iteration budget, memory_manager pattern, structured memory extraction.

## 📄 许可证

MIT
