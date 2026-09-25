<div align="center">

<img src="./assets/readme-hero.png" width="480" alt="Aether" />

# Aether

### 本地优先 Agent 工作台 · 内置竞技场 · 默认安全

**不用纠结哪个模型最强，Aether 在你的真实任务上实测，替你决定。**

[![GitHub downloads](https://img.shields.io/github/downloads/TQSY114514/Aether/total?style=flat-square&label=downloads)](https://github.com/TQSY114514/Aether/releases)
[![npm downloads](https://img.shields.io/npm/dm/aetherai?style=flat-square&label=npm%20downloads)](https://www.npmjs.com/package/aetherai)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue?style=flat-square)](./LICENSE)
[![Platform - Windows](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)](#-下载)

[English](./README.md) · [简体中文](./README.zh-CN.md)

</div>

---

## 60 秒看懂 Aether

市面上大多数 AI 编程工具逼你在单一模型里盲信。Aether 把模型视为可插拔的算力后端，把控制权完整留给你：

1. **用你自己的任务实测**：打开内置**竞技场**，一条提示并发分发给多个模型作答；投票选出最佳，本地 ELO 榜单按意图（编程、推理、翻译）实时更新。
2. **安全托管复杂任务**：在 **Ask（询问）模式**下将 Aether 对准项目目录。Agent 会自动规划、读写代码、运行测试——但每个有风险的步骤都在你批准后才落地。
3. **改动落地前全景审阅**：每次文件修改内嵌高亮 Diff 审阅；终端命令实时流式输出 stdout，随时可中断。
4. **纯粹的本地优先**：API Key、聊天记录与长期记忆全部保存在本地 SQLite 数据库（`%APPDATA%/aetherai/`），无云端中转、无遥测采集。

---

## 两个形态，一个统一大脑

Aether 提供双端第一公民体验，底层 100% 共享相同的 Agent 运行时、SQLite 存储、记忆与安全沙箱：

- 🖥️ **Aether 桌面版（GUI）** — 基于 Electron + React。拥有实时 Markdown 流式渲染、可视化模型竞技场、实时推理追踪与配置中心。
- ⌨️ **Aether 终端版（TUI / CLI / SDK）** — 基于 Node.js 22+ 与 Ink v5。全键盘沉浸交互（`aether tui`）、毫秒级极速启动、无头 CI 模式（`--mode json|rpc`），以及 Electron-free SDK（`require('aetherai/sdk')`）。

> 💡 **无缝续接**：桌面版创建的会话，随时可在终端通过 `aether tui --session <id>` 继续，反之亦然。

---

## 诚实定位与架构考量

Aether 强在**本地优先隐私、多模型真实评测与三层权限沙箱**。我们客观承认单模型代码补全并不追求复刻 Cursor 庞大的专有 IDE 编辑生态，而是为你提供一个透明、可信、多模型协同的自主开发工作台。

> 📊 **详细 20 款主流 Agent 竞品矩阵分析**：关于 Aether 与 Claude Code、Codex、Cursor、OpenHands 等 20 款工具在 8 大维度的全面客观自评与能力画像，详见 [docs/competitive-analysis.md](./docs/competitive-analysis.md)（以及[全景雷达图](./assets/agent-radar-2026.zh-CN.svg)）。

---

## 下载与快速上手

### 1. 终端版与 CLI（跨平台：macOS、Linux、Windows 通用）

无头 Agent 运行时与交互终端具备 100% 跨平台能力（需要 Node.js ≥ 22）：

```bash
# 全局安装
npm install -g aetherai

# 启动交互式终端 TUI
aether tui

# 单次命令编码或调试任务
aether "运行测试并修复挂掉的用例" --model deepseek

# 无头 JSONL RPC 供脚本与子 Agent 集成
aether --mode rpc
```

### 2. 桌面版工作台（Windows）

从 [GitHub Releases](https://github.com/TQSY114514/Aether/releases) 获取最新安装包：

- **`aetherai-setup-x.y.z.exe`**（安装包，推荐，支持自动更新）
- **`aetherai-x.y.z.exe`**（绿色便携版，免安装即开即用）

> **关于 Windows SmartScreen 提示**：Aether 属于独立开发者维护的开源项目，未购买昂贵商业签名证书。若 Windows 11 / Defender 提示「已保护你的电脑」，请点击 **更多信息 → 仍要运行** 即可。代码完全透明开源。

### 3. 源码运行

```bash
git clone https://github.com/TQSY114514/Aether.git
cd Aether

# Windows（自动安装依赖、编译前端并启动 Electron）
start.bat

# Linux / macOS（默认极速进入终端 TUI；加 --desktop 启动桌面工作台）
./start.sh              # 终端交互 TUI
./start.sh --desktop    # Electron 桌面工作台
```

---

## 核心特性

- **多模型竞技场 (Arena)**：提示并发生成，实时 ELO 积分榜，按编程/数理/翻译自动分类。
- **权限安全阶梯**：细粒度能力控制（`Plan` → `Ask` → `Auto` → `Yolo`），具备白名单命令沙箱与敏感路径写保护。
- **终端实时流式执行**：对齐 Claude Code 体验，工具调用块内实时流式渲染终端标准输出，支持随时打断。
- **上下文压缩 (Compaction)**：长对话自动分块摘要，完整保留工具调用对与核心技术决策。
- **MCP 生态扩展**：即插即用任意 Model Context Protocol stdio 服务器，具备自动前缀命名空间防冲突保护。
- **结构化项目记忆**：基于 SQLite + FTS5 全文搜索，持久化跨会话项目事实与架构决策。

---

## 致谢 (Acknowledgements)

Aether 的架构设计与工程落地深度汲取了以下开源项目与先行者的智慧：

### Agent 框架与运行时设计

- [Claude Code](https://claude.ai/code) (Anthropic) — 验证闭环设计（`debugAgent.js`）、10 点生命周期钩子规范（`hooks.js`）、权限阶梯模型（`trustEngine.js`）、终端实时执行输出与 Ask/Plan 交互模式。
- [pi](https://github.com/badlogic/pi-mono) (Mario Zechner) — `AgentMessage` 抽象（UI 表现层与 LLM 传输层消息解耦）、事件流遥测架构，以及运行中动态指令注入（`agent.steer()`）。
- [OpenClaw](https://github.com/openclaw/openclaw) — 上下文压缩算法、工具循环死循环检测、事件流编排及工具结果脱敏中间件。
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — 迭代预算控制机制、结构化本地 SQLite 记忆与 FTS5 记忆检索。
- [Evolver](https://github.com/EvoMap/evolver) — 基因组进化协议 (GEP) 策略反思架构。
- [Aider](https://github.com/Aider-AI/aider) — LLM 编程助手的工具循环范式与 Git 紧密集成流。
- [OpenCode](https://github.com/sst/opencode) — 终端 TUI 全键盘导航、权限门设计与 Prompt 缓存策略。
- [OpenAI Codex](https://github.com/openai/codex) — 进程树沙箱隔离与基于证据的自动验证理念。
- [DS4](https://gist.github.com/antirez) (Salvatore Sanfilippo) — 执行前结构化任务分解与层次化规划思想。
- [Continue](https://github.com/continuedev/continue) — 声明式配置规范（"config is code"）。
- [Grok Build](https://x.ai) — 专门化 Agent 角色划分与长时间运行任务抽象。

### UI、基础设施与周边工具

- [shadcn/ui](https://github.com/shadcn-ui/ui) — 组件解耦设计模式与原子类规范。
- [Magic UI](https://github.com/magicuidesign/magicui) — 零依赖 CSS 流光动效。
- [cc-switch](https://github.com/farion1231/cc-switch) — 用量与成本统计面板布局设计。
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io) — 开放标准工具扩展协议。
- [new-api](https://github.com/QuantumNous/new-api) — 推理精力参数映射与格式中继转换。

---

## 参与贡献

欢迎所有形式的贡献与反馈！

- **遇到 Bug？** 请通过 [GitHub Issues](https://github.com/TQSY114514/Aether/issues/new) 反馈。
- **贡献代码**：重大架构变更前请先查阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [docs/roadmap.md](./docs/roadmap.md)。

---

## 开源许可

[Apache-2.0](./LICENSE) © 2025-2026 Aether
