// ─────────────────────────────────────────────────────────────────────────────
// eventTypes.js — 共享事件 schema 与任务状态机定义（单一来源）
//
// Phase 0 收敛点：CLI 的 NDJSON 事件、桌面的 task:progress IPC、agentEvents
// 的统一事件流，全部引用本文件的常量与形状，消灭三处字面量重复。
//
// 被依赖方（全部改从本文件 import）：
//   - app/electron/llm/agentEvents.js   (事件名)
//   - app/electron/llm/backgroundTasks.js (状态机 + 合法转换)
//   - app/electron/ipc/task.handler.js    (通道类型 + 状态)
//   - app/cli.js                          (NDJSON 事件名)
// ─────────────────────────────────────────────────────────────────────────────

// ─── 任务状态机（7 态） ──────────────────────────────────────────────────────
// planner 提示词要求：queued / running / plan / paused / done / cancelled / error
// `pending` 是 `queued` 的遗留别名（DB 存量行），读取时归一到 `queued`。
const TASK_STATUSES = Object.freeze([
  'queued',   // 排队等待调度（DB 存量值 pending 归一至此）
  'running',  // 工具循环执行中
  'plan',     // 只读规划阶段（plan 模式启动，等待批准进入执行）
  'paused',   // 用户暂停（下一个迭代边界生效）
  'done',     // 成功完成
  'cancelled',// 用户取消 / 超时中止
  'error',    // 失败（未耗尽重试预算时回退 queued 重试）
])

// DB CHECK 约束允许的值：7 态 + 遗留 pending（兼容存量行与旧代码路径）。
const TASK_STATUS_DB = Object.freeze([...TASK_STATUSES, 'pending'])

// 合法状态转换表（单向）。
//   queued   → running (调度派发) | plan (plan 模式启动) | cancelled (取消排队)
//   plan     → running (批准执行) | cancelled
//   running  → paused | plan | done | cancelled | error
//   paused   → running (resume) | cancelled
//   error    → queued (自动重试，预算内)
//   done/cancelled 为终态，无出边（error 出度仅 queued 重试）。
const TASK_TRANSITIONS = Object.freeze({
  queued:    new Set(['running', 'plan', 'done', 'cancelled']),
  plan:      new Set(['running', 'queued', 'cancelled']),
  running:   new Set(['plan', 'paused', 'done', 'cancelled', 'error']),
  paused:    new Set(['running', 'cancelled']),
  done:      new Set(),
  cancelled: new Set(),
  error:     new Set(['queued']),
})

function isValidTaskTransition(from, to) {
  const outs = TASK_TRANSITIONS[from]
  if (!outs) return false
  return outs.has(to)
}

/** 遗留 pending → queued（仅当值恰为 pending 时归一）。 */
function normalizeTaskStatus(status) {
  return status === 'pending' ? 'queued' : status
}

/** 引擎内部状态 → DB 持久化值（queued 写为 queued，新建表无 pending）。 */
function dbStatusFor(status) {
  return normalizeTaskStatus(status)
}

// ─── 事件名 ─────────────────────────────────────────────────────────────────

// agentEvents 统一事件流的事件名（pi 风格生命周期）。
const AGENT_EVENTS = Object.freeze({
  AGENT_START:    'agent:start',
  TURN_START:     'turn:start',
  MESSAGE_DELTA:  'message:delta',
  THINKING_START: 'thinking:start',
  THINKING_END:   'thinking:end',
  TOOL_START:     'tool:start',
  TOOL_END:       'tool:end',
  PLAN_STEP:      'plan:step',
  TURN_END:       'turn:end',
  AGENT_END:      'agent:end',
  AGENT_ERROR:    'agent:error',
  COMPACT_START:  'compact:start',
  COMPACT_END:    'compact:end',
  INJECT:         'inject',
})

// 任务域 IPC push 事件（task:started/progress/done/cancelled/error/derived）。
const TASK_EVENTS = Object.freeze({
  STARTED:   'task:started',
  PROGRESS:  'task:progress',
  DONE:      'task:done',
  CANCELLED: 'task:cancelled',
  ERROR:     'task:error',
  DERIVED:   'task:derived',   // CLI task:derive 桥：CLI 派生任务已入引擎
})

// task:progress 的载荷类型（与 CHANNEL_TO_TYPE 的映射值一一对应）。
const TASK_PROGRESS_TYPES = Object.freeze([
  'tool-call',
  'plan-step',
  'status',
  'todo-update',
  'chunk',
])

// CLI NDJSON 事件名（cli.js --json-lines 输出行 type）。
const CLI_EVENTS = Object.freeze({
  TOOL_START: 'tool:start',
  TOOL_END:   'tool:end',
  STATUS:     'status',
  PLAN:       'plan',
  TEXT:       'text',
  DONE:       'done',
  ERROR:      'error',
  TASK_DERIVED: 'task:derived',
})

module.exports = {
  TASK_STATUSES,
  TASK_STATUS_DB,
  TASK_TRANSITIONS,
  isValidTaskTransition,
  normalizeTaskStatus,
  dbStatusFor,
  AGENT_EVENTS,
  TASK_EVENTS,
  TASK_PROGRESS_TYPES,
  CLI_EVENTS,
}