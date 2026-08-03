# Aether Agent 发展计划

## 一、现状盘点

Aether 已有 20+ Agent 模块，基础设施远超预期：

| 模块 | 文件 | 成熟度 | 职责 |
|------|------|--------|------|
| 工具循环 | electron/llm/toolLoop.js | 高 | Plan→Act→Observe，语义循环检测，checkpoint 回滚 |
| 子代理 | electron/llm/subAgent.js | 高 | 隔离子 session，权限派生，15 轮迭代上限 |
| 技能系统 | electron/llm/skills.js | 高 | Claude Code 兼容 SKILL.md，渐进式披露 |
| 自动记忆 | electron/llm/autoMemory.js | 高 | 实体提取+事实持久化，关键词+图谱混合检索 |
| 模型路由 | electron/llm/modelRouter.js | 高 | fast/standard/thinking 三档路由 |
| 规划器 | electron/llm/planning.js | 中 | 任务分解+并行组，JSON 驱动 |
| 推理控制 | electron/llm/reasoning.js | 高 | 多模型族 reasoning_effort 适配 |
| 工具修复 | electron/llm/toolCallRepair.js | 中 | 参数修复+JSON 修复 |
| Hook 系统 | electron/llm/hooks.js | 高 | 10 种生命周期钩子 |
| 知识图谱 | electron/llm/knowledgeGraph.js | 中 | 实体关系图 |
| Checkpoint | electron/llm/checkpointManager.js | 中 | 文件快照回滚 |
| MCP 集成 | electron/mcp/manager.js | 高 | 多 server 管理+合并工具注册表 |
| 沙箱 | electron/tools/sandbox.js | 中 | 路径/命令安全检查 |
| 工具注册表 | electron/tools/registry.js | 高 | 已支持 executionMode 和 beforeToolCall/afterToolCall 钩子 |

## 二、参考项目对比

| 能力 | Hermes Agent | Evolver | pi | OpenCode | OpenClaw | Aether |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| Tool Loop | Y | N | Y | Y | Y | Y |
| SubAgent | N | N | N | Y | Y | Y |
| Planning | Y | N | N | Y | Y | Y |
| Skills | Y | N | N | Y | Y | Y |
| Memory/FTS5 | Y | Y | N | Y | Y | Y |
| Model Router | Y | N | N | Y | Y | Y |
| MCP | Y | N | N | Y | Y | Y |
| Event Stream | N | N | Y | N | N | **无** |
| AgentMessage | N | N | Y | N | N | **无** |
| Steering | N | N | Y | N | N | **无** |
| Cron | Y | Y | N | N | Y | **无** |
| Self-Evolution | N | Y | N | N | Y | **无** |
| Trajectory压缩 | Y | N | N | N | N | **无** |

## 三、三阶段实施计划

### 阶段一：Agent 学习闭环

#### 1.1 Cron 定时任务
- 新增 electron/cron/scheduler.js，基于 node-cron
- 任务类型：code-review、summary、memory-cleanup、skill-scan
- 与 hooks.js SessionStart 集成

#### 1.2 FTS5 全文搜索
- database.js 创建 FTS5 虚拟表
- 替换 autoMemory.js 关键词匹配为 FTS5 MATCH
- 增加 LLM 摘要召回

#### 1.3 技能自创建
- Agent 识别重复模式 → auto_draft SKILL.md
- 用户审核后移至正式目录
- 已有 skills.record 基础

### 阶段二：Self-Evolution 引擎

#### 2.1 事件流系统（借鉴 pi）
- 定义 AgentEvent 类型系统
- toolLoop.js 回调改为事件发射器
- 统一生命周期：agent:start → turn:start → message:delta → tool:start → tool:end → turn:end → agent:end

#### 2.2 GEP 进化协议（借鉴 Evolver）
- Gene = 轻量级策略片段
- Capsule = 可复用进化资产包
- Gene/Capsule 映射到 Skill 系统
- 新增 electron/evolution/ 目录

#### 2.3 进化循环
- 扫描 memory/ → 检测信号 → 选择 Gene → 生成 GEP 提示 → 记录 EvolutionEvent
- 策略预设：balanced / innovate / harden / repair-only
- 信号去重

### 阶段三：体验增强

#### 3.1 AgentMessage 抽象层（借鉴 pi）
- AgentMessage → transformContext → convertToLlm
- 分离 UI 消息和 LLM 消息

#### 3.2 Steering / Follow-up（借鉴 pi）
- agent.steer() 运行中插入指令
- agent.followUp() 完成后排队工作

#### 3.3 Trajectory 压缩（借鉴 Hermes）
- 长对话自动压缩中间步骤
- 保留关键决策点

#### 3.4 输入框引用（借鉴 SonettoHere）
- @技能名 / #工具名 / !宏名
- 自动补全

## 四、优先级

阶段一: Cron → FTS5 → 技能自创建
阶段二: 事件流 → GEP → 进化循环
阶段三: AgentMessage → Steering → Trajectory → 输入框引用

## 五、设计原则

- 全部 TypeScript/JS，不引入 Python/Rust
- 不破坏 IPC 契约，check-ipc.js 校验
- 不引入重量级依赖
- Evolver 同为 Node.js，可复用核心逻辑
