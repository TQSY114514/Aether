# 从 Claude Code / Cursor 迁移到 Aether 指南

如果你是从 Claude Code 或 Cursor 迁移到 Aether 的开发者，以下内容将帮助你快速适应 Aether 的 Agent 模式。

## 1. 定位差异
- **Cursor** 是一个全功能的 IDE，Agent 深度绑定在编辑器侧边栏。
- **Aether** 是一个 **Agent Workbench (工作台)**，专注于多模型、复杂任务链以及本地终端的集成，你可以用 Aether 管理 Agent 工作流，同时在 VS Code 等熟悉的 IDE 中写代码。

## 2. 交互模式
- Aether 提供 GUI 与 TUI（终端用户界面）两套完整的 UI。
- 你可以直接在当前工程下运行 `aether tui` 以 CLI 的方式进行交互。

## 3. 工具生态
- Aether 支持 MCP (Model Context Protocol) 协议，你可以复用现有的 MCP 服务器。
- 所有工具默认受安全网控制，相比一键修改，Aether 更强调**安全与可见性**。

## 4. 成本与隐私
- Aether 完全**本地优先 (Local-First)**。
- Token 成本通过 SQLite 直接本地核算，无中间商差价。
