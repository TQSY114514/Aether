# Aether Roadmap（2026-08 版）

> 依据 2026-08-12 两份外部 AI 评审（ChatGPT / Grok）提炼，并与代码库现状逐一核对后形成。
> **用户已拍板约束**：跨平台不做（只搞 Windows）、代码签名不买。
> 本文件是「做什么」的指南；AGENTS.md 是「怎么做」的宪法。

## 定位收敛（评审共识）

**Aether 已过"缺功能"阶段，缺的是锋利定位。**

- 现状：Local-first · Multi-model · Agent-native（功能面已很宽：42 工具、Arena、Memory、TUI/CLI/SDK/MCP/Skills）
- 收敛目标：**The AI Workbench for developers —— One workspace. Every model. Every agent.**
- 一句话差异化（对外卖点）：**"不用纠结哪个模型最强，Aether 替你决定。"**
  （Claude Code / OpenCode / Codex 是"选一个强 Agent"，Aether 的机会是多模型 + 评估 + 自动路由）
- ⚠️ README 不要继续写成"功能超市"：首页第一屏直接回答"为什么要下载"，用一个真实工作流证明。

### 三方战略输入定案（2026-08-26，GPT 调研 × OpenClaw × Hermes）

- **行业全景与 Aether 架构设计**：详见 [2026 AI Agent 行业观察](industry_observation_2026.md)，明确了 S/A/B 级战略底座优先级（Agent Runtime、Permission System、Context Engine）。
- **品类名收敛（采纳 OpenClaw）**：对外统一 **Local-first Agent Workbench (with built-in Arena)** —— 不再用 Multi-Agent 当品类词（最弱关联格），也不再用 Multi-model 充作品类；Arena 是差异点，不是品类。已落 README 双语第一屏与 GitHub About/topics。
- **护城河叙事（GPT）**：Arena → Model Intelligence → Router，一句话讲清「竞技场产生数据 → 数据变建议 → 建议驱动路由」的闭环。
- **诚实雷达（Hermes）**：自评 CSV 逐字内嵌 `app/scripts/gen-radar.cjs`，生成 `assets/agent-radar-2026.svg` 入 README 双语。禁顶格美化——编程轴对同类最佳 -2.3 的差距如实画出，不对称形状即定位证据。
- **GPT P0 四项对账现状**：

| 输入项 | 现状核对（2026-08-26） | 处置 |
|--------|------------------------|------|
| AETHER.md | 项目记忆已有雏形（#50 workspace 作用域 + 注入带为什么） | 归入 P1 #5 Project Intelligence 收口：仓库根约定文件（AETHER.md/AGENTS.md）自动发现并注入 |
| Agent Run Timeline | GUI 无运行时间线视图；auditTrail/agentEvents 数据源已有 | 新增 P1 条目：会话运行时间线（工具序列/审批/预算可视化） |
| Diff Review | 写入显 diff 已有（权限门 + diff 呈现） | 增强：任务级改动集一次审（整任务 diff review 流），挂 P1 |
| Runtime 稳定 | #43/#44/#48/#50 已落地 loopGuard / 缩围重试 / 阶段路由 / Docker 全程预算化 | 持续项，不再单列 |

- **增长钩子（OpenClaw）**：Arena 结果分享卡片评估通过——工作量小到中（前端卡片渲染 + 导出 SVG/PNG），并入下方 P0 #3 Arena 2.0 排期，不单开项目。

## P0 — 现在最该做

### 1. Agent 可靠性（两份评审一致的首选） ✅ 已完成

| 方向 | 现状 | 动作 |
|------|------|------|
| Tool Router（工具路由） | ✅ 阶段路由 (`agent.toolRouter.staged`) 已实现 | 按任务阶段只注入相关工具集（如修 TS 报错 → LSP→grep→read→edit→test），减少 context 膨胀与选错工具 |
| 错误降级统一 | ✅ 已补充 LSP/MCP 统一降级与 `onStatus` | 统一降级 + UI 状态栏可见提示 |
| 失败恢复 | ✅ IterationBudget + checkpoint/rollback 已有 | 失败后自动缩小范围重试 (tryShrinkRetry 已生效) |

### 2. 权限系统做成品牌特色（最能打的卖点） ✅ 已完成

- 现状：已实现基于 Capability 的 6 轴独立控制（READ, WRITE, EXECUTE, NETWORK, GIT, EXTERNAL）。
- 升级：动态风险拦截，对于高危命令（如 `npm install`, 删文件）强制返回 `ALWAYS_ASK`，绕过会话级授权，严格保护。
- TUI 与 GUI 权限门统一。

### 2.5 Agent Runtime 与 Context Engine (核心运行时增强) ✅ 已完成

- **Checklist Runtime**：计划任务 (Plan) 现已持久化至 SQLite `session_plan`，应用重启后自动恢复未完成的任务列表，真正实现 "Task State -> Agent Runtime -> UI"。
- **Agent Loop 闭环**：LLM 系统提示词已强制约束 `Plan -> Inspect -> Act -> Observe -> Verify -> Fix` 验证与修复流。
- **Context Engine**：智能检测并注入 `AGENTS.md` 知识库，配合既有 `codebase_graph` 达成项目全局感知。

### 3. Arena 2.0 —— 从"多模型回答"变"模型评估平台" ✅ 已完成

- 现状：并发回答、投票、ELO、按 intent 分类
- 升级：用户可建**个人 benchmark**（自己的任务集），模型更新后一键重跑 →
  **"你的工作负载的模型排行榜"**（准确率 / 延迟 / 成本 / 工具成功率）
- 增强细节：同模型多温度 / 多 system prompt 对比、匿名投票后揭示、导出对比报告
- 分享卡片（增长钩子）：Arena 对比结果已实现一键导出分享图（Markdown 报告与纯文本），见上「三方战略输入定案」
- 这是 OpenCode / Claude Code 都没有的差异化，直接支撑"Aether 替你决定"定位

## P1 — 下一阶段

### 4. 统一 Agent Runtime（单一会话，多客户端） ✅ 已完成

- 现状：GUI / TUI / CLI 各自起会话，易变两套 Agent
- 目标：`Aether Core`（统一运行时）+ Electron / TUI / SDK 多客户端；
  GUI 做到一半 → `aether tui` 继续同一会话
- 复用已有 agentEvents 事件流与 steering 机制

### 5. Project Intelligence（记忆 → 项目大脑） ✅ 已完成

- 现状：记忆是"记得你喜欢 Claude"
- 升级：记录项目级知识（架构 / 约定 / 决策 / 已知问题，即 AGENTS.md 语义化），
  Agent 进入项目不再从零开始；记忆注入时显示"为什么注入这条"
- 细节：用户可手动编辑/删除记忆与 KG 节点；会话级 vs 全局记忆明确切换

### 5.5 Context 与 Compaction 增强 ✅ 已完成

- 按 provider/model 切换 tokenizer（不同模型 token 算法差异大）
- Compaction 保留"关键决策 / 用户偏好 / 当前计划"显式摘要，而非只留工具对
- GUI 补长对话"手动压缩 / 分叉会话"入口（TUI 已有 `/fork`）
- `run_command` / `web_fetch` / `grep` 长结果智能截断 + 摘要注入（减少 token 浪费）

### 6. Skills 生态化 + 权限声明 ✅ 已完成

- SKILL.md 增加 `permissions:` 字段（filesystem/network/shell 声明）
  → 与 capability-based permission 打通
- 官方精选 Skills 包一键导入 + 使用/成功率统计

### 7. Onboarding 收尾 ✅ 已完成

- ✅ 首次运行向导已在 2026-08-12 落地（见 CHANGELOG / W32 开发日志）
- 剩余：启动首屏四选（Chat / Code / Compare Models / Use Local Model）+
  "从 Claude Code / OpenCode 导入配置"

## P2 — 性能与工程债

- ✅ Feature Flag 默认保守：所有 Experimental 默认关 + UI 一键"安全模式 / 完整模式"
- ✅ **后端 `.js` 关键路径渐进补 JSDoc/TS**（toolLoop / permissions / adapters / schema）
- ✅ **IPC 契约集中化** + preload 运行时校验（通过 check-ipc.js 静态校验实现）
- 依赖升级**分批**（React 19 / Zustand 5 / Tailwind 4）：先建 CI 门禁再逐个升，
  **不吞 Dependabot 16 包大 PR**
- ✅ 长会话/记忆/KG 列表虚拟滚动（复用 `@tanstack/react-virtual`）
- ✅ 启动性能：延迟加载非核心模块（evolution / cron / backgroundTasks / LSP pool）
- ✅ **高频写入批量事务**（tool metrics / audit log）
- ✅ **成本可见性**：聊天界面实时显示本轮预估 token + 累计成本 + 预算上限（达到停止 Agent）
- ✅ **全局并发上限**（API 请求数 / 子 Agent 数，防打爆本机或 API 限额）
- ✅ **可回滚 migration** + Settings 导出配置 / 重置到安全默认
- ✅ **状态栏统一**：Agent 运行中显示当前迭代 / 预算剩余 / 已用 token / 最近工具耗时
- ✅ **工具失败自动注入错误摘要**到下一轮（而非只显示原始 stderr）
- ✅ **导出/导入配置**时提示 API Key 加密状态与目标机器 safeStorage 差异
- ✅ **TUI/GUI 快捷键与命令对齐**（减少两套心智）

## P2 — 开发者体验与社区

- ✅ 文档：单独维护「Agent 安全与权限最佳实践」「从 Claude Code / Cursor 迁移指南」「FAQ（杀软 / SmartScreen / MCP 安装）」
- ✅ 贡献门槛：最小可复现环境、如何只跑某个模块的单元测试、feature flag 开发约定
- ✅ README 放精简版公开 Roadmap + 当前重点（稳定 > 新功能）

## P3 — 智能提升与生态扩展 (Intelligence & Ecosystem)

结合行业调研，在稳固了基础架构后，我们将重点突破以下高级特性：

1. **项目级全局认知 (Repo Map & Semantic Context)**
   - 引入类似 Aider 的 Tree-sitter/AST 代码结构索引，生成压缩版的项目拓扑图 (Repo Map) 注入上下文，替代昂贵的全局正则搜索。
   - 实现**智能上下文裁剪 (Context Pruning)**，自动折叠不相关文件的变更。

2. **MCP (Model Context Protocol) 深度集成与市场**
   - 现状虽然支持 MCP，但需手动配置。计划在 GUI 中添加 **MCP 插件市场/管理面板**，一键安装常见服务器 (如 Postgres, GitHub, Puppeteer)。
   - 在 Tool Router 中实现本地工具与 MCP 工具的无缝统一调度。

3. **影子工作区 (Shadow Workspace) / 安全沙盒执行**
   - 复杂修改先在 `.aether/shadow/` 或 Docker 沙盒中运行与编译测试，验证通过（无报错）后再整体应用 (Apply) 到主工作区，避免弄脏开发环境。

4. **Web 视觉与终端双重验证 (Autonomous Validation)**
   - 赋予 Agent 操作 headless 浏览器的能力（查看页面渲染与控制台报错），真正做到“写代码 -> 跑起来 -> 看结果 -> 自动修”的闭环。

## 明确不做（用户约束 + 评审共识）

- ❌ 跨平台（macOS / Linux）— 只搞 Windows，官方定位不变
- ❌ 代码签名购买 — SmartScreen/杀软误报用文档 + 排除项指引缓解
- ❌ 追 Cursor 完整 IDE — Aether 定位是 Workspace + Agent，不是 Editor
- ❌ 无脑堆模型/工具数量 — 让已有 42 工具更聪明，不新增数量
- ❌ 洋葱模型中间件 / 完整 Effect 重写 / 断点续传改核心循环（价值筛选）

## 验证门禁（改动落地前）

- `cd app && npm run build` 必须通过
- 新功能必须带测试（工具循环 / 权限 / compaction 完整性 / DB migration 脏数据）
- Feature flag 新键：`app/electron/featureFlags.js` 注册 + 默认保守
- TUI/CLI 改动：`node cli.js tui --smoke` + TUI 测试套件
