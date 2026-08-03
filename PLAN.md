# Aether Agent 发展计划

## 一、现状盘点

Aether 已有 20+ Agent 模块，基础设施远超预期：

| 模块 | 文件 | 成熟度 | 职责 |
|------|------|--------|------|
| 工具循环 | electron/llm/toolLoop.js | 高 | Plan→Act→Observe，语义循环检测，checkpoint 回滚 |
| 子代理 | electron/llm/subAgent.js | 高 | 隔离子 session，权限派生，15 轮迭代上限 |
| 技能系统 | electron/llm/skills.js | 高 | Claude Code 兼容 SKILL.md，渐进式披露 |
| 自动记忆 | electron/llm/autoMemory.js | 高 | 实体提取+事实持久化，FTS5 全文检索 |
| 模型路由 | electron/llm/modelRouter.js | 高 | fast/standard/thinking 三档路由 |
| 规划器 | electron/llm/planning.js | 中 | 任务分解+并行组，JSON 驱动 |
| 推理控制 | electron/llm/reasoning.js | 高 | 多模型族 reasoning_effort 适配 |
| 工具修复 | electron/llm/toolCallRepair.js | 中 | 参数修复+JSON 修复 |
| Hook 系统 | electron/llm/hooks.js | 高 | 10 种生命周期钩子 + Shell 命令钩子 |
| 知识图谱 | electron/llm/knowledgeGraph.js | 中 | 实体关系图 |
| 记忆图谱 | electron/llm/memoryGraph.js | 中 | 图结构记忆，多跳查询 |
| Checkpoint | electron/llm/checkpointManager.js | 中 | 文件快照回滚 |
| MCP 集成 | electron/mcp/manager.js | 高 | 多 server 管理+合并工具注册表 |
| 沙箱 | electron/tools/sandbox.js | 中 | 路径/命令安全检查 + Sandbox Executor |
| 沙箱执行器 | electron/tools/sandboxExecutor.js | 中 | 隔离目录执行，白名单控制，资源限制 |
| 工具注册表 | electron/tools/registry.js | 高 | 已支持 executionMode 和 beforeToolCall/afterToolCall 钩子 |
| 权限模型 | electron/llm/permissions.js | 中 | 5 级权限阶梯 + 钩子覆盖 |
| 迭代预算 | electron/llm/iterationBudget.js | 中 | 多维度迭代预算控制 |
| 事件流 | electron/llm/agentEvents.js | 中 | 统一 Agent 生命周期事件 |
| AgentMessage | electron/llm/agentMessage.js | 中 | 分离 UI 消息和 LLM 消息 |
| Steering | electron/llm/steering.js | 中 | 运行中插入指令 |
| 轨迹压缩 | electron/llm/trajectory.js | 中 | 长对话压缩 + PortContext 快照 |
| 技能自创建 | electron/llm/skillSelfCreate.js | 中 | 重复模式检测 → SKILL.md |
| GEP 进化 | electron/evolution/gep.js | 中 | Gene/Capsule 协议 + 进化循环 |
| Hub 客户端 | electron/evolution/hubClient.js | 中 | 进化资产发布/搜索/下载 |
| Hub 验证 | electron/evolution/hubVerify.js | 中 | 资产签名验证 |
| Cron 调度 | electron/cron/scheduler.js | 中 | 定时任务 |

## 二、参考项目对比

| 能力 | Hermes Agent | Evolver | pi | OpenCode | OpenClaw | Claude Code | Aether |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Tool Loop | Y | N | Y | Y | Y | Y | Y |
| SubAgent | N | N | N | Y | Y | Y | Y |
| Planning | Y | N | N | Y | Y | Y | Y |
| Skills | Y | N | N | Y | Y | Y | Y |
| Memory/FTS5 | Y | Y | N | Y | Y | Y | Y |
| Model Router | Y | N | N | Y | Y | Y | Y |
| MCP | Y | N | N | Y | Y | Y | Y |
| Event Stream | N | N | Y | N | N | N | Y |
| AgentMessage | N | N | Y | N | N | N | Y |
| Steering | N | N | Y | N | N | Y | Y |
| Cron | Y | Y | N | N | Y | Y | Y |
| Self-Evolution | N | Y | N | N | Y | N | Y |
| Trajectory 压缩 | Y | N | N | N | N | N | Y |
| 权限模型 | N | N | N | N | N | Y | Y |
| Shell 钩子 | N | N | N | N | N | Y | Y |
| 记忆图谱 | Y | Y | N | N | N | N | Y |
| 迭代预算 | Y | N | N | N | N | N | Y |
| Sandbox 沙箱 | N | Y | N | Y | N | N | Y |
| Hub 资产共享 | N | Y | N | N | N | N | Y |
| PortContext | N | N | N | N | Y | N | Y |

## 三、阶段实施状态

### 阶段一：Agent 学习闭环 ✅

#### 1.1 Cron 定时任务 ✅
- 新增 electron/cron/scheduler.js，基于 node-cron
- 任务类型：memory-cleanup、skill-scan
- 与 hooks.js SessionStart 集成

#### 1.2 FTS5 全文搜索 ✅
- database.js 创建 FTS5 虚拟表
- 替换 autoMemory.js 关键词匹配为 FTS5 MATCH
- 增加 LLM 摘要召回

#### 1.3 技能自创建 ✅
- Agent 识别重复模式 → auto_draft SKILL.md
- 用户审核后移至正式目录
- 基于 skills.record 基础

### 阶段二：Self-Evolution 引擎 ✅

#### 2.1 事件流系统 ✅
- 定义 AgentEvent 类型系统
- toolLoop.js 回调改为事件发射器
- 统一生命周期

#### 2.2 GEP 进化协议 ✅
- Gene = 轻量级策略片段
- Capsule = 可复用进化资产包
- Gene/Capsule 映射到 Skill 系统
- 新增 electron/evolution/ 目录

#### 2.3 进化循环 ✅
- 扫描 memory/ → 检测信号 → 选择 Gene → 生成 GEP 提示 → 记录 EvolutionEvent
- 策略预设：balanced / innovate / harden / repair-only
- 信号去重

### 阶段三：体验增强 ✅

#### 3.1 AgentMessage 抽象层 ✅
- AgentMessage → transformContext → convertToLlm
- 分离 UI 消息和 LLM 消息

#### 3.2 Steering / Follow-up ✅
- agent.steer() 运行中插入指令
- agent.followUp() 完成后排队工作

#### 3.3 Trajectory 压缩 ✅
- 长对话自动压缩中间步骤
- 保留关键决策点

#### 3.4 输入框引用 ✅
- @技能名 / #工具名 / !宏名
- 自动补全

### 阶段四：Deep Evolution ✅

#### 4.1 权限模型升级 ✅
- 5 级权限阶梯：ReadOnly → WorkspaceWrite → DangerFullAccess → Prompt → Allow
- PermissionPolicy 规则引擎：allow/deny/ask 规则 + 全局默认模式
- PermissionOverride 机制：钩子可返回 Allow/Deny/Ask 覆盖权限决策
- 改造 toolLoop.js 权限检查点：PreHook → Permission Check → Execute → PostHook
- 改造 hooks.js 让 PreToolUse 钩子支持 PermissionOverride 返回

#### 4.2 Shell 命令钩子 ✅
- 定义 shell 钩子规范：<workspace>/.aetherai/hooks/<hookevent>.sh
- 实现 runShellHook()：执行 shell 脚本，解析 stdout 为 HookRunResult
- HookRunResult 字段：denied/failed/messages/permission_override/updated_input
- 集成到 hooks.js 的 runHooks() 流程

#### 4.3 GEP 进化协议升级 ✅
- 升级 Gene schema：epigenetic_marks、learning_history、anti_patterns、routing_hint、tool_policy
- 升级 Capsule schema：blast_radius、derivation_tokens、execution_trace、visibility、author、success_streak
- 实现 createGene() / validateGene() / createCapsule() / validateCapsule() 工厂函数
- 实现信号去重机制：analyzeRecentHistory() 抑制 3+ 次重复信号
- 实现 blast_radius 计算：基于文件变更统计影响范围
- 实现 success_streak 跟踪：记录基因成功应用次数

#### 4.4 记忆图谱 ✅
- 实现 memoryGraph.js：memory_graph.jsonl 维护运行时状态关系图
- 节点类型：实体、文件、会话、技能、决策
- 边类型：引用、修改、依赖、触发
- 图检索 API：queryGraph(relation, depth) 支持多跳查询

#### 4.5 CodeMode 沙箱 ✅
- 实现 sandboxExecutor.js：隔离目录执行，临时工作目录
- 白名单控制：仅允许 node、npm、npx，禁止 shell 元字符
- 资源限制：输出大小上限（4000字符），超时控制（60s/命令）
- 环境变量隔离：清理 PATH、HOME 等敏感环境变量
- 集成到 tools/sandbox.js 作为可选 executionMode

#### 4.6 迭代预算系统 ✅
- 定义 IterationBudget：{ maxIterations, maxTokens, maxTime, maxErrors }
- 实现预算追踪器：budget.track(type, amount) 记录消耗
- 实现预算检查点：budget.exhausted() 在工具循环各阶段检查
- 预算预警：80% 消耗时发射 budget:warning 事件
- 集成到 toolLoop.js 和 subAgent.js

#### 4.7 PortContext 快照 ✅
- 实现 buildPortContext()：扫描项目结构生成快照
- 快照内容：源文件数、测试文件数、资产文件数、目录结构
- 集成到 trajectory.js 的压缩流程
- 快照有效期检查：文件变更时自动失效

#### 4.8 Hub 系统 ✅
- 定义 Hub 资产包格式：{ type, id, content, signature, author }
- 实现 hubClient.js：资产发布、搜索、下载
- 实现 hubVerify.js：验证资产签名和完整性
- 实现本地资产缓存：<userdata>/skills/hub/ 目录
- 集成到 gep.js 进化循环：自动搜索 Hub 匹配的 Gene

## 四、设计原则

- 全部 TypeScript/JS，不引入 Python/Rust
- 不破坏 IPC 契约，check-ipc.js 校验
- 不引入重量级依赖
- Evolver 同为 Node.js，可复用核心逻辑