# 2026 AI Agent 行业观察：核心能力、产品范式与 Aether 的设计启示

随着技术从“代码补全 (Code Completion)”进化到“自主代理 (Autonomous Agents)”，目前的 AI 编程工具呈现出百花齐放的态势。各大平台不仅仅在卷大模型本身，更在卷**工程化落地**和**用户体验**。

对于 Aether 而言，真正该问的不是“Aether 要不要复制 Cursor？”，而是：**“2026 年一个 Agent 最低应该做到什么，然后 Aether 在这些能力之上如何形成自己的工作流？”**

---

## 一、必须基础功能 (The Table Stakes)
在当前的行业标准下，任何一款称得上是 "Agent" 的工具，**必须**具备以下 6 项核心能力：

1. **底层工具调用 (Tool Calling)**：能读写文件、能列出目录树、能执行终端命令。
2. **上下文管理与索引 (Context Management)**：能够通过 RAG、语义搜索，自动把报错信息、依赖文件提取进上下文。
3. **撤销与回滚机制 (Rollback / Undo)**：支持一键撤销文件更改或回退 Git 历史，确保环境安全。
4. **状态与记忆留存 (State Memory)**：能够跨会话记住项目指令、用户偏好。
5. **权限与审批系统 (Permission System)**：
   不再是简单的“能执行什么”，而是“谁允许执行”。必须具备细粒度的权限控制（读/写/执行/网络/Git/外部服务）。
   *例：读取文件 → 自动；修改文件 → 自动；执行 `npm install` → Ask；删除大量文件/生产环境操作 → Always Ask。*
6. **Agent Loop / Recovery (核心运行时)**：
   闭环的工作流：`Plan → Inspect → Act → Observe → Verify → Fix → Done`。
   Agent 不能只是“生成代码就结束”，而必须具备自我验证和错误恢复（Recovery）的能力。

---

## 二、热门与冷门 Agent 的产品范式与特色功能

各个工具为了打出差异化，发展出了非常多惊艳的高级特性：

### 1. Cursor (AI-Native IDE 标杆)
*   **Shadow Workspace (影子工作区)**：在与当前工作区隔离的环境中预览、分析和验证 AI 修改，并在确认后应用到实际工作区。
*   **Speculative Edits (推测性应用)**：极速的代码合并体验，预测你可能会接受代码，用极快的速度在编辑器里完成 Diff 渲染。
*   **Composer (多文件协作编排)**：从局部修改走向宏观架构，跨多个文件协同实现 Feature。

### 2. Aider (终端极客的挚爱)
*   **Tree-Sitter Repo Map + Semantic Search**：它不依赖单一的全文检索，而是利用 Tree-Sitter 提取项目的结构骨架图谱。将 `Repo Map (知道结构)` + `Semantic Search (知道内容)` + `Git History (知道原因)` + `项目规范 (知道应该怎么改)` 结合，形成极其强悍的 Context System。
*   **Git-Native Workflow**：修改完毕自动生成语义化 Git Commit，支持即时 Reset。

### 3. Claude Code / TUI 工具 (Terminal-First 趋势)
*   **环境零缝隙接入**：完全抛弃 IDE 插件的概念，直接活在你的终端里，执行脚本、跑测试，如同结对编程的工程师。
*   **智能路由 (Model Router)**：内部根据任务复杂度，自动在便宜极速的模型（如 Haiku）与强大昂贵的模型（如 Opus/Sonnet）间路由。

### 4. Devin / OpenHands (全自动沙盒工程师)
*   **Computer / Environment Interaction**：不仅仅是写代码，而是操作整个软件开发环境（Filesystem, Terminal, Browser, Git, Package Manager, Services）。
*   **自主浏览器验证**：写完前端页面后，自动打开浏览器查看排版和控制台报错，自己修 Bug。

### 5. Cline / RooCode (高扩展性 VSCode 插件)
*   **MCP (Model Context Protocol) 生态**：高度可扩展，能够外接各种异构数据源（设计稿、Issue 列表、数据库等）。在更高级的架构中，MCP 应与 Native Tools、Skills 和 SubAgents 统一进入 `Tool Router` 路由分发。

### 6. Windsurf (流式研究者)
*   **Cascade (级联推演)**：通过连续的上下文理解、工具调用和多步骤推理，让 Agent 在任务执行过程中动态调整下一步行动，谋定而后动。

---

## 三、优化用户体验的小功能 (Micro UX Optimizations)

决定用户会不会长期留存的，往往是这些“润物细无声”的细节：

1. **Token 预算墙与花费透明度 (Cost Visibility)**
   任务面板清晰展示 `Input / Output Token`、`耗时` 以及 `Estimated Cost ($0.20–$0.50)`，缓解用户的账单焦虑。
2. **任务大纲与进度树 (Task Checklist as Runtime State)**
   长任务生成 TODO List（如 `[x] Analyze repo, [ ] Run tests`）。更重要的是，Checklist 必须是 Agent Runtime 的**真实状态**，支持关闭窗口后明天重新打开继续执行（Auto Resume）。
3. **无闪烁的 Inline Diff (Streaming UI)**
   像 Git Diff 一样红绿平滑渲染代码替换，视觉极其平滑。
4. **高危拦截 (Human-in-the-Loop)**
   根据 Tool 类型判断安全级别，危险命令强行阻断审批，构建安全的 Agent OS。
5. **意图预测与一键 Follow-up (Next Actions)**
   执行完毕后弹出快捷操作选项，免除重复打字。

---

## 四、Aether Feature Radar 与设计启示

我们绝对不能把 Aether 做成一个没有灵魂的“Cursor 平替”或功能缝合怪。Aether 的真正护城河，在于打造一个强大的 **Agent OS 架构**：

\`\`\`text
                 Aether
                    │
          ┌─────────┴─────────┐
          ↓                   ↓
       Agent Core         Model Layer
          │                   │
    ┌─────┼─────┐       ┌─────┼─────┐
    ↓     ↓     ↓       ↓     ↓     ↓
  Tools Skills MCP    Claude Gemini DeepSeek...
    │     │     │
    └─────┼─────┘
          ↓
      Tool Router
          ↓
   Context / Memory
          ↓
   Plan → Execute → Verify
          ↓
      Task State
          ↓
       UI / UX
\`\`\`

根据以上行业 Benchmark，Aether 未来的优先级应该如下排列：

### 【S 级】核心底座 (Core Engine)
1. **Agent Runtime / Tool Loop**：完善 `Plan → Tool → Observe → Verify → Recover` 的闭环，将 Verification 融入 Table Stakes。
2. **Permission System**：建立严格的 Ask / Allow / Deny / Always Allow 权限分类系统。
3. **Context Engine**：融合 Repo Map + Semantic Search + Git + AGENTS.md + Memory，打造最强上下文引擎。

### 【A 级】能力延伸 (Capabilities)
4. **Task / Checklist Runtime**：让任务清单成为真实的运行时状态，而非 UI 装饰。
5. **Verification / Auto Fix**：自动化代码流（Edit → TypeScript → ESLint → Tests → Build）。
6. **统一路由 (MCP + Skills + SubAgent)**：将外部能力无缝聚合。

### 【B 级】体验打磨 (UX Polish)
7. **Cost Dashboard**：精细的花费仪表盘与任务数据盘。
8. **Auto Resume**：断点续传与任务持久化。
9. **Next Actions**：预测用户的下一步点击。

**总结：** 基础能力不掉队 + Agent Runtime 做深 + Context 做强 + Tool Router 做成核心 + UX 做出爽感。这就是 Aether 接下来最清晰的产品战略。
