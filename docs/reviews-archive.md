# 外部 AI 评审完整存档（2026-08-12）

> 两份独立产品评审（ChatGPT 14 节 + Grok 7 大类）的**逐条完整记录**。
> 每条标注取舍：✅ 采纳（→ roadmap 对应项）/ ⚠️ 已具备 / ❌ 用户约束过滤 / 💡 待定。
> 本文件是「完整存档」；精炼可执行的优先级清单见 [[roadmap]]。

**用户已拍板约束**：只做 Windows、不买代码签名。

---

## 一、ChatGPT 评审（14 节）

### 1. 定位收敛 — ✅ 采纳 → roadmap「定位收敛」

- Aether 已过"缺功能"阶段，缺锋利定位。
- 收敛目标：**The AI Workbench for developers — One workspace. Every model. Every agent.**
- 一句话卖点：**"不用纠结哪个模型最强，Aether 替你决定。"**
- README 不要写成"功能超市"，首页第一屏回答"为什么要下载"。

### 2. 竞品关系定位 — ✅ 采纳

- Claude Code / OpenCode / Codex = "选一个强 Agent"；Aether = 多模型 + 评估 + 自动路由。
- OpenCode 是最值得长期盯的开源竞品（主/子 Agent、细粒度 permission、MCP、插件、TUI）。

### 3. Agent Runtime 优先于堆 Tool — ✅ 采纳 → roadmap P0-1

- 42 工具 ≠ 42 倍能力；工具越多 → context 越大 → 选错工具 → 不稳定。
- **Tool Router**：按任务阶段只注入相关工具（修 TS 报错 → LSP→grep→read→edit→test）。

### 4. 权限系统做成杀手级 — ✅ 采纳 → roadmap P0-2

- 从五档模式 → **Capability-based Permission**（Filesystem / Shell / Network 三轴）。
- 权限弹窗人话摘要："修改 3 个文件 / 运行 npm test / 访问 github.com"。
- Allow once / session / project / Deny。

### 5. Arena 从 Feature 变 Evaluation Infrastructure — ✅ 采纳 → roadmap P0-3

- 个人 benchmark（自己的任务集）+ 模型更新一键重跑 → 你的工作负载模型排行榜。

### 6. 自动模型路由（Arena 终极形态）— ✅ 采纳 → roadmap 定位

- 按任务类型/质量/成本/延迟/历史成功率自动选模型（简单总结→DeepSeek、复杂架构→Claude…）。

### 7. Memory → Project Intelligence — ✅ 采纳 → roadmap P1-5

- 从"记得你喜欢 Claude" → 项目级知识（架构/约定/决策/已知问题）。

### 8. TUI/GUI 必须是一套系统 — ✅ 采纳 → roadmap P1-4

- Aether Core 统一运行时，GUI 做到一半 → `aether tui` 继续同一会话。

### 9. 跨平台 P0 — ❌ 用户约束过滤（只搞 Windows）

### 10. Skills 生态化 — ✅ 采纳 → roadmap P1-6

- SKILL.md 声明 permissions 字段，官方精选包一键导入。

### 11. Onboarding — ✅ 采纳 → roadmap P1-7（⚠️ 首向导已落地 8.12）

- 首屏四选（Chat/Code/Compare Models/Local）+ 从 Claude Code/OpenCode 导入配置。

### 12. React/Electron 版本债 — ✅ 采纳 → roadmap P2

- 分批升级（React 19/Zustand 5/Tailwind 4），不吞 Dependabot 16 包大 PR。

### 13. 不建议做的事 — ✅ 采纳 → roadmap「明确不做」

- 不追 Cursor 完整 IDE、不疯狂加模型、不堆工具、README 不写功能超市。

### 14. 优先级总表 — ✅ 采纳 → roadmap P0/P1/P2 结构

---

## 二、Grok 评审（7 大类 + 7 项短期优化）

### 1. 稳定性与质量（Solo 项目最关键）

| 细节 | 取舍 |
|------|------|
| Feature Flag 全面覆盖，Experimental 默认关，一键"安全模式/完整模式" | ✅ → roadmap P2 |
| 错误边界与统一降级（LSP 失败回退 find_symbol+grep，统一 Toast/状态栏） | ✅ → roadmap P0-1 |
| 测试深化：语义循环检测/checkpoint 回滚/迭代预算边界/compaction 完整性/多 provider 竞态/DB migration 脏数据 | ✅ → roadmap 验证门禁 |
| **启动与内存：延迟加载非核心模块（evolution/cron/backgroundTasks/LSP pool）** | 💡 遗漏 → 补 P2 |
| **长会话/大量记忆/KG 分页或虚拟化（@tanstack/react-virtual 扩展到侧边栏/记忆列表）** | ✅ → roadmap P2 |
| **高频写入（tool metrics/audit log）批量事务** | 💡 遗漏 → 补 P2 |

### 2. Agent 体验与可靠性

| 细节 | 取舍 |
|------|------|
| 权限阶梯更细 + "本次会话信任 N 次"减少重复确认 | ✅ → roadmap P0-2 |
| **按 provider/model 切换 tokenizer**（不同模型 token 算法差异大） | 💡 遗漏 → 补 P1 |
| **Compaction 保留"关键决策/用户偏好/当前计划"显式摘要** | 💡 遗漏 → 补 P1 |
| **GUI 补长对话"手动压缩/分叉会话"入口（TUI 已有 /fork）** | 💡 遗漏 → 补 P1 |
| **run_command/web_fetch/grep 结果智能截断 + 摘要注入** | 💡 遗漏 → 补 P1 |
| Test-first/Lint-repair：失败后自动缩小范围、重试次数可配置 | ✅ → roadmap P0-1 |
| Repo Map 作为可选 system 上下文 + 用户关注目录/忽略规则 | 💡 待定 |

### 3. 架构与可维护性

| 细节 | 取舍 |
|------|------|
| 核心路径与外围能力分层，外围全走 feature flag + 事件总线 | ✅ → roadmap P2 |
| 关键路径 .js 渐进 JSDoc/TS | ✅ → roadmap P2 |
| IPC 契约集中化 + preload 运行时校验（dev） | ✅ → roadmap P2 |
| **破坏性变更写"可回滚" migration + Settings 导出配置/重置安全默认** | 💡 遗漏 → 补 P2 |

### 4. 产品与差异化

| 细节 | 取舍 |
|------|------|
| **Arena：同模型多温度/多 system prompt 对比、匿名投票后揭示、导出对比报告** | 💡 遗漏 → 补 P0-3 |
| Memory/KG：用户手动编辑、注入时显示"为什么注入这条"、会话级 vs 全局切换 | ⚠️ 部分 → roadmap P1-5（补"可编辑/全局切换"） |
| Skills：官方精选包、使用/成功率统计 | ✅ → roadmap P1-6 |
| 跨平台社区构建脚本 | ❌ 用户约束（只搞 Windows），但可说明 CLI/SDK 已 Electron-free |
| 安全信任：checksum、文档加排除项指引 | ✅ → roadmap 明确不做（签名）|

### 5. 性能与资源

| 细节 | 取舍 |
|------|------|
| **聊天界面实时显示本轮预估 token + 累计成本 + 预算上限（达到停止 Agent）** | 💡 遗漏 → 补 P2 |
| **全局并发上限（API 请求数/子 Agent 数）** | 💡 遗漏 → 补 P2 |
| 生产环境静态资源按路由拆分 | 💡 待定 |

### 6. 开发者体验与社区

| 细节 | 取舍 |
|------|------|
| **单独维护"Agent 安全与权限最佳实践"/"从 Claude Code/Cursor 迁移指南"/"FAQ(杀软、SmartScreen、MCP)"** | 💡 遗漏 → 补 P2 |
| **贡献门槛：最小可复现环境、如何跑单模块测试、feature flag 开发约定** | 💡 遗漏 → 补 P2 |
| **README 放精简版公开 Roadmap** | 💡 遗漏 → 补 P2 |

### 7. 短期可落地的小优化（7 项）

| # | 细节 | 取舍 |
|---|------|------|
| 1 | Settings 一键"安全默认"（关 Experimental、Ask、Yolo 关、网络白名单开） | ✅ → roadmap P2 |
| 2 | **Agent 运行中状态栏：当前迭代/预算剩余/已用 token/最近工具耗时** | 💡 遗漏 → 补 P2 |
| 3 | **工具调用失败自动把错误摘要注入下一轮** | 💡 遗漏 → 补 P2 |
| 4 | 会话/消息列表虚拟滚动 + 懒加载历史 | ✅ → roadmap P2 |
| 5 | **导出/导入配置时提示 API Key 加密状态与目标机器 safeStorage 差异** | 💡 遗漏 → 补 P2 |
| 6 | **TUI/GUI 快捷键与命令对齐** | 💡 遗漏 → 补 P2 |
| 7 | 状态栏统一显示（与 #2 合并） | 💡 遗漏 → 补 P2 |

---

## 三、取舍统计

- ✅ 采纳进 roadmap：约 20 项
- ⚠️ 已具备或部分具备：约 6 项
- ❌ 用户约束过滤（跨平台/签名）：3 项
- 💡 遗漏后补充：**15 项**（见下方 roadmap 增补清单）
- 💡 待定（不做承诺）：2 项（Repo Map 注入、静态资源按路由拆分）
