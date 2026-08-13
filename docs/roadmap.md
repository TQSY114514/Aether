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

## P0 — 现在最该做

### 1. Agent 可靠性（两份评审一致的首选）

| 方向 | 现状 | 动作 |
|------|------|------|
| Tool Router（工具路由） | ❌ 模型每次看到全部工具 | 按任务阶段只注入相关工具集（如修 TS 报错 → LSP→grep→read→edit→test），减少 context 膨胀与选错工具 |
| 错误降级统一 | ⚠️ 有 `errorClassify.js`，LSP/MCP 失败降级不统一 | 统一降级 + UI 状态栏可见提示 |
| 失败恢复 | ✅ IterationBudget + checkpoint/rollback 已有 | 可补：失败后自动缩小范围重试 |

### 2. 权限系统做成品牌特色（最有潜力成为"最能打"的卖点）

- 现状：五档（Off/Plan/Ask/Auto/Yolo）+ workspace 沙箱 + TUI 键盘权限门
- 升级：**capability-based permission**，三轴独立控制：
  - Filesystem：workspace 读 ✓ / 写 ✓ / 外部读 ? / 外部写 ✕
  - Shell：git ✓ / npm ✓ / python ? / powershell ?
  - Network：localhost ✓ / github.com ✓ / 任意 ✕
- 权限弹窗用**人话摘要**："修改 3 个文件 / 运行 npm test / 访问 github.com"
  → Allow once / Allow for session / Allow for project / Deny
- TUI 与 GUI 权限门统一

### 3. Arena 2.0 —— 从"多模型回答"变"模型评估平台"

- 现状：并发回答、投票、ELO、按 intent 分类
- 升级：用户可建**个人 benchmark**（自己的任务集），模型更新后一键重跑 →
  **"你的工作负载的模型排行榜"**（准确率 / 延迟 / 成本 / 工具成功率）
- 增强细节：同模型多温度 / 多 system prompt 对比、匿名投票后揭示、导出对比报告
- 这是 OpenCode / Claude Code 都没有的差异化，直接支撑"Aether 替你决定"定位

## P1 — 下一阶段

### 4. 统一 Agent Runtime（单一会话，多客户端）

- 现状：GUI / TUI / CLI 各自起会话，易变两套 Agent
- 目标：`Aether Core`（统一运行时）+ Electron / TUI / SDK 多客户端；
  GUI 做到一半 → `aether tui` 继续同一会话
- 复用已有 agentEvents 事件流与 steering 机制

### 5. Project Intelligence（记忆 → 项目大脑）

- 现状：记忆是"记得你喜欢 Claude"
- 升级：记录项目级知识（架构 / 约定 / 决策 / 已知问题，即 AGENTS.md 语义化），
  Agent 进入项目不再从零开始；记忆注入时显示"为什么注入这条"
- 细节：用户可手动编辑/删除记忆与 KG 节点；会话级 vs 全局记忆明确切换

### 5.5 Context 与 Compaction 增强

- 按 provider/model 切换 tokenizer（不同模型 token 算法差异大）
- Compaction 保留"关键决策 / 用户偏好 / 当前计划"显式摘要，而非只留工具对
- GUI 补长对话"手动压缩 / 分叉会话"入口（TUI 已有 `/fork`）
- `run_command` / `web_fetch` / `grep` 长结果智能截断 + 摘要注入（减少 token 浪费）

### 6. Skills 生态化 + 权限声明

- SKILL.md 增加 `permissions:` 字段（filesystem/network/shell 声明）
  → 与 capability-based permission 打通
- 官方精选 Skills 包一键导入 + 使用/成功率统计

### 7. Onboarding 收尾

- ✅ 首次运行向导已在 2026-08-12 落地（见 CHANGELOG / W32 开发日志）
- 剩余：启动首屏四选（Chat / Code / Compare Models / Use Local Model）+
  "从 Claude Code / OpenCode 导入配置"

## P2 — 性能与工程债

- Feature Flag 默认保守：所有 Experimental 默认关 + UI 一键"安全模式 / 完整模式"
- 后端 `.js` 关键路径渐进补 JSDoc/TS（toolLoop / permissions / adapters / schema）
- IPC 契约集中化 + preload 运行时校验（dev 模式）
- 依赖升级**分批**（React 19 / Zustand 5 / Tailwind 4）：先建 CI 门禁再逐个升，
  **不吞 Dependabot 16 包大 PR**
- 长会话/记忆/KG 列表虚拟滚动（复用 `@tanstack/react-virtual`）
- **启动性能**：延迟加载非核心模块（evolution / cron / backgroundTasks / LSP pool）
- **高频写入批量事务**（tool metrics / audit log）
- **成本可见性**：聊天界面实时显示本轮预估 token + 累计成本 + 预算上限（达到停止 Agent）
- **全局并发上限**（API 请求数 / 子 Agent 数，防打爆本机或 API 限额）
- **可回滚 migration** + Settings 导出配置 / 重置到安全默认
- **状态栏统一**：Agent 运行中显示当前迭代 / 预算剩余 / 已用 token / 最近工具耗时
- **工具失败自动注入错误摘要**到下一轮（而非只显示原始 stderr）
- **导出/导入配置**时提示 API Key 加密状态与目标机器 safeStorage 差异
- **TUI/GUI 快捷键与命令对齐**（减少两套心智）

## P2 — 开发者体验与社区

- 文档：单独维护「Agent 安全与权限最佳实践」「从 Claude Code / Cursor 迁移指南」「FAQ（杀软 / SmartScreen / MCP 安装）」
- 贡献门槛：最小可复现环境、如何只跑某个模块的单元测试、feature flag 开发约定
- README 放精简版公开 Roadmap + 当前重点（稳定 > 新功能）

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
