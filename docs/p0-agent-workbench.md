# P0 实施方案:Agent 工作台(三件套)

> 状态:已批准存档(2026-08)。实施顺序与验证见文末。
> 背景:把 AetherAI 从"聊天软件"观感升级为"agent 工作台"。借鉴仓库:
> Claude Code(后台任务)、SonettoHere(消息注入打断、任务进度)、OpenClaw(权限模型)。

**目标**:三件独立能力,全部复用现有 `runToolLoop` 与 IPC 事件机制,不重写循环、不加依赖、不动 DB schema。

**关键现状**(已核实):

- `ChatInput.handleSubmit`(`app/src/components/chat/ChatInput.tsx:211`)在 streaming 时只做 `enqueueMessage` → 等**所有**流结束才发(`app/src/store/index.ts:1296`)——这就是"执行中不能插话"的根源。
- `preload.js` 里的 `background` 是**壁纸图片**,不是后台任务——后台任务要从零建。
- `toolLoop.js`(`app/electron/llm/toolLoop.js`)的 callback 机制(`onToolCall/onPlanStep/onStatus/...`)足够支撑全部三件套,不用改循环核心,只需加两个可选参数。
- 注入消息**不落库**的取舍见「明确不做」一节(避免 DB 行序问题)。

---

## 功能 A:后台任务系统(最大块)

**设计**:借鉴 Claude Code `run_in_background` + 现有 subAgent 模式(建子会话 → runToolLoop → 写结果)。后台任务跑在**独立子会话**,完成后写 assistant 消息,点开任务就能看完整轨迹。

### A1 新文件 `app/electron/llm/backgroundTasks.js`

```
TaskManager:
  tasks: Map<taskId, { id, sessionId, status: 'running'|'done'|'cancelled'|'error',
                      createdAt, title, finalContent?, controller, events: [] }>
  start({ db, parentSessionId, content, modelId, agentMode }) → taskId
    - 建子会话(title: `任务: ${content.slice(0,20)}`)
    - db.addMessage user 行 → 构建 messages → runToolLoop(全量 callbacks)
    - callbacks 全部转发到 emit(taskId, event) 供 ipc 层广播
    - 结束后:db.addMessage assistant 行(finalContent)
  cancel(taskId)  /  list()  /  get(taskId)
  并发上限 MAX_CONCURRENT_TASKS = 3
```

- 权限模型:沿用 `ask/auto/yolo`;ask 模式下弹确认框(见 A5)。
- 复用 `subAgent.js` 的模式但**保留子会话**(subAgent 用完即删,任务要保留)。

### A2 新文件 `app/electron/ipc/task.handler.js`(从 chat.handler.js:336-431 抽公共回调)

- **先做一个小重构**:把 chat.handler 里 `onToolCall/onPlanStep/onStatus/onTodoUpdate/onStream/onAudit/onAskUser/requestPermission` 那 ~90 行抽成共享 `buildToolLoopCallbacks({ db, wc, sessionId, msgId, controller, source })`,chat.handler 与 task.handler 共用。`source: 'chat' | 'task'` 用于权限弹窗标注"后台任务"。(理由:不抽就要复制 90 行,ask-user/permission 的闭包逻辑最容易抄错)
- `task:start` `task:list` `task:cancel` `task:get-result`
- 事件:`task:started` / `task:progress { taskId, type: 'tool-call'|'plan-step'|'status'|'chunk', payload }` / `task:done` / `task:cancelled` / `task:error`

### A3 注册:`app/electron/main.js` 加 `registerTaskHandlers(ipcMain, db, getWebContents)`

### A4 IPC 契约三件套(preload.js + env.d.ts)

```
task: { start(params), list(), cancel(taskId), getResult(taskId),
        onStarted(cb), onProgress(cb), onDone(cb), onCancelled(cb), onError(cb) }
```

类型:TaskInfo { id, sessionId, status, title, createdAt, finalContent? }

### A5 渲染端

- `app/src/store/index.ts`: `tasks: TaskInfo[]`, `addTask/updateTask`, 全局 `task:on*` 监听(一次性注册,同 ensureChunkListener 模式)
- 新组件 `app/src/components/tasks/TaskPanel.tsx`(侧边栏新增入口):
  - 顶部输入框 + 模型选择(默认当前会话模型)+ "开始任务"
  - 运行中列表:live 状态(当前 plan step / 最近 tool call / 状态行)
  - 点击任务 → `selectSession(task.sessionId)` 打开完整轨迹
- **权限弹窗**:任务在 ask 模式下复用 `chat:permission-request`(payload 带 sessionId=子会话 + `source: 'task'`);PermissionDialog 保持全局渲染,加"后台任务"标签即可——在任何会话都能批准

---

## 功能 B:待发消息注入(打断工具循环)⭐ 最小改动、最高感知

**设计**:借鉴 SonettoHere 的 mid-turn injection。用户在工具循环运行中发消息 → 消息进入主进程缓冲区 → `toolLoop` 下一轮迭代前注入 convo → 模型优先回应新消息。

### B1 `app/electron/llm/toolLoop.js`(+12 行)

- `runToolLoop` 增加两个可选参数:`getPendingInjections: () => string[]`、`clearPendingInjections: () => void`
- `while (budget.consume())` 顶部、`completeChatMessage` 之前:

```js
const pending = getPendingInjections ? getPendingInjections() : []
if (pending.length) {
  for (const text of pending) convo.push({ role: 'user', content: text })
  convo.push({ role: 'system', content: '[用户打断:优先回应这条新消息,再决定是否继续原任务]' })
  clearPendingInjections?.()
  try { onStatus?.({ text: `📥 已插入你的新消息`, kind: 'injection' }) } catch {}
}
```

### B2 `app/electron/ipc/chat.handler.js`

- 模块级:`activeToolLoops: Set<sessionId>`、`pendingInjections: Map<sessionId, string[]>`
- runToolLoop 调用处:`activeToolLoops.add(sessionId)`(finally 里 delete);传 `getPendingInjections`/`clearPendingInjections`
- runToolLoop 前后广播 **`chat:tool-loop-start` / `chat:tool-loop-end`**(渲染端据此判断"可打断")
- 新 IPC **`chat:inject`** `{ sessionId, content }` → push 进 `pendingInjections` + 广播 `chat:injection-queued { sessionId, content }` → return `{ queued: true }`(不写 DB、不新建消息)
- `chat:send` 顶部加兜底守卫:若该 session 正在 loop → 走注入逻辑(防止渲染端状态不同步时消息被当新轮次发出)

### B3 渲染端

- `app/src/store/index.ts`:`loopingSessions: Set<number>`,监听 `onToolLoopStart/End`
- `ChatInput.handleSubmit` 判定改为:
  - 本会话 **looping** → `window.electronAPI.chat.inject(...)` + 乐观 push user 气泡(标记 `injected`)→ 提示"将打断 agent"
  - 仅普通 streaming → 保留现有 `enqueueMessage` 兜底
- `onInjectionQueued` → 乐观 push 气泡(样式区别于普通消息,标注"已插入")

---

## 功能 C:任务卡片 UI(纯渲染,最便宜)

- 新组件 `app/src/components/chat/TaskCard.tsx`:
  - 输入:`todos`(来自 `todosByMessage`)、`planSteps`、`statusLines`
  - 渲染:`📋 任务执行中 3/5`,进度条,当前 `in_progress` 项高亮,最后一条 plan step 摘要;todos 全 completed → "✅ 已完成"
- 集成:`app/src/components/chat/MessageBubble.tsx` 顶部,`todosByMessage[messageId].length > 0` 时渲染
- **零 IPC 改动**——`onTodoUpdate → todosByMessage` 管线已存在(`app/src/store/index.ts:83`, `app/electron/ipc/chat.handler.js:355`)

---

## IPC 契约三件套清单(AGENTS.md 硬规则)

| 新 channel | handler | preload | env.d.ts |
|---|---|---|---|
| `chat:inject` / `chat:injection-queued` | chat.handler.js | ✅ | ✅ |
| `chat:tool-loop-start/end` | chat.handler.js | ✅ | ✅ |
| `task:start/list/cancel/get-result` | **新** task.handler.js | ✅ | ✅ |
| `task:started/progress/done/cancelled/error` | **新** task.handler.js | ✅ | ✅ |

每个 channel 必须三处同步,漏一处就是 bug。

---

## 实施顺序与验证

| Step | 内容 | 验证 |
|---|---|---|
| 1 | **B 注入** | `node -e "require('./electron/ipc/chat.handler.js')"` 冒烟;跑一个多步任务,中途发消息,确认模型中断回应;`npm run build` 过 |
| 2 | **C 任务卡片** | `npm run build`;多步任务看进度条 1/5→5/5 |
| 3 | **A 后台任务**(含 buildToolLoopCallbacks 抽取) | 同开 2 个任务 + 1 个会话互不阻塞;ask 模式批准弹窗;取消任务;任务会话点开看轨迹 |
| 每步结束 | — | `npm run build` 必须过;**主进程改动需完全重启**(AGENTS.md) |

## 明确不做(v1,含理由)

1. **注入消息不落库**——写 DB 有行序问题(消息按自增 id 排序,无法插到 assistant 行之前)。v1 注入消息仅内存 + 乐观气泡,reload 后消失(状态行留痕)。v2 方案:注入消息单独落库 + 排序字段,或 message 表加 `client_seq`。
2. **任务持久化**——TaskManager 内存态,重启后任务消失(会注明);v2 加 `task` 表存历史。
3. 远程 MCP、粒度权限、Skill Workshop → 都在 P1/P2,不在本次。

## 风险与对策

- **并发写 DB**:sql.js 是同步调用,主进程单线程天然串行,无竞态——仅需验证后台任务与主会话同时跑时无 UI 卡顿(runToolLoop 的 await 让出事件循环,已具备)
- **权限弹窗跨会话**:任务弹窗带 `source:'task'` + 子会话 id,PermissionDialog 全局渲染即可,不按 session 过滤
- **`chat:inject` 与 `chat:send` 竞态**:loop 结束瞬间的输入走原 queue 兜底(渲染端以 `loopingSessions` 判定,主进程以 `activeToolLoops` 兜底,双保险)
- **重构风险**:buildToolLoopCallbacks 抽取会动 chat.handler 的 90 行——这是"THE central handler",抽取后立即跑 Step 1 验证回归
