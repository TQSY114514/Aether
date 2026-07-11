<div align="center">

# AetherAI

**桌面端多模型 AI 对话客户端 · Electron + React**

[English](./README.en.md) · [简体中文](./README.md) · [日本語](./README.ja.md)

</div>

AetherAI 是一个本地优先的桌面 AI 聊天应用，把多个 LLM 供应商（OpenAI / Claude / DeepSeek / 本地模型等）统一在一个界面里。支持多会话并发流式、竞技场对比、人设预设、文件与图片附件、工具调用（联网搜索 / 读文件）、自定义背景、思考等级等。

## ✨ 功能

- **多供应商统一管理** — 供应商/模型抽象层，新增供应商只需一个 adapter 文件
- **多会话并发流式** — 一个会话在跑，不影响你在另一个会话继续聊
- **竞技场 (Arena)** — 同一问题多模型同时回答，投票选最佳，ELO 评分自动更新
- **人设 (Persona)** — 系统提示词预设，每会话可独立切换
- **附件支持** — 文本文件自动注入上下文，图片走多模态（需多模态模型）
- **长文本粘贴折叠** — 粘贴几百行自动收成可展开的片段块（类 ChatGPT）
- **工具调用 (Agent)** — 内置 `read_file` / `web_search`，可折叠的工具调用块
- **思考等级滑块** — 真实生效：OpenAI o 系列 → `reasoning_effort`，Claude → `thinking.budget_tokens`
- **侧栏智能总结** — 标题由模型生成主题短语（如"新约能天使抽取建议"），非复制原文
- **自定义背景** — 上传图片 + 透明度 / 模糊调节
- **多主题** — 浅色 / 深色 / 蓝色 / 玻璃 / 复古
- **多语言** — 中文 / English
- **本地存储** — 全部数据在本地 SQLite，不上传任何信息

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装与运行
```bash
cd app
npm install
npm run dev      # 开发模式（热重载）
npm run build    # 构建生产前端
npm start        # 启动 Electron
```

或直接运行项目根目录的 `start.bat`（Windows）。

### 配置第一个供应商
1. 启动后在左侧栏点击「模型管理」
2. 添加供应商（名称 / API URL / API Key）
3. 点击「获取模型」拉取可用模型列表
4. 回到对话页即可开始聊天

## 📁 项目结构

```
app/
├── electron/              # 主进程 (Node)
│   ├── database.js        # SQLite (sql.js) 数据层
│   ├── ipc/               # IPC 处理器（chat / arena / session / ...）
│   ├── llm/               # LLM 抽象层
│   │   ├── providerAdapter.js   # 统一入口（按 api_format 分派）
│   │   ├── openaiAdapter.js     # OpenAI 兼容实现
│   │   ├── reasoning.js         # 思考等级参数构建
│   │   ├── toolLoop.js          # Function Calling 循环
│   │   └── toolArgs.js          # 工具参数解析
│   ├── tools/             # 内置工具注册表
│   ├── main.js / preload.js
├── src/                   # 渲染进程 (React + TS)
│   ├── store/index.ts     # zustand 全局状态
│   ├── components/        # UI 组件
│   │   ├── chat/          # 对话相关
│   │   ├── sidebar/       # 侧栏
│   │   └── ui/            # 通用 UI（toast / dialog）
│   ├── pages/             # 页面（Chat / Models / Persona / Settings / ...）
│   ├── utils/             # i18n / theme / markdown
│   └── types/
└── package.json
```

## 🔒 隐私

**所有数据存储在本地**，AetherAI 不收集、不上传任何用户数据。你的 API Key、聊天记录、人设都保存在本机的 SQLite 数据库中。唯一的外部网络请求是你配置的 LLM 供应商 API。

> ⚠️ 上传到 GitHub 前，请确保 `.gitignore` 已排除 `*.db`、`dist/`、`node_modules/` 等运行时数据。

## 📄 许可证

MIT
