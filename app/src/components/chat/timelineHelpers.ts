export type TodoItem = {
  id?: string | number
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export type PlanStep = {
  step: number
  depth: number
  assistantText: string
  kind?: 'plan' | 'act' | 'observe'
}

export type ToolEntry = {
  name: string
  args: unknown
  result: string | null
  error: string | null
  failureKind?: string | null
  recoveryHint?: { action?: string; hint?: string } | null
  risk?: string | null
  latencyMs?: number | null
  startedAt?: number | null
  checkpointId?: number | null
  diff?: string | null
  afterSnapshot?: { path: string; content: string; truncated: boolean } | null
  liveOutput?: string
  liveOutputDone?: boolean
  exitCode?: number | null
  commandFailed?: boolean
  timedOut?: boolean
  added?: number | null
  removed?: number | null
  depth?: number
}

export type TimelineNode =
  | { kind: 'step'; key: string; step: PlanStep }
  | { kind: 'tool'; key: string; tool: ToolEntry }

export type StepVisualState = 'completed' | 'in_progress' | 'paused' | 'pending'

export type TranslateFn = (key: string, ...args: (string | number)[]) => string

/** Remove ANSI CSI/OSC escape sequences from terminal output. */
export function stripAnsi(text: string): string {
  if (!text) return ''
  return String(text).replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g, '')
}

/** Detect non-zero exit codes, timeouts, or missing commands on shell tool calls. */
export function detectCommandFailure(tool: Pick<ToolEntry, 'name' | 'exitCode' | 'error' | 'result' | 'timedOut' | 'commandFailed'>): {
  failed: boolean
  exitCode?: number
  reason: string
} {
  if (tool.name !== 'run_command' && !tool.name.includes('exec') && !tool.name.includes('terminal')) {
    return { failed: false, reason: '' }
  }
  if (tool.exitCode != null && tool.exitCode !== 0) {
    return { failed: true, exitCode: tool.exitCode, reason: `exit ${tool.exitCode}` }
  }
  const text = (tool.error || tool.result || '') + ''
  const exitMatch = text.match(/(?:\[FAILED:\s*exit\s+|exit\s+code:\s*)(-?\d+)/i)
  if (exitMatch) {
    const code = parseInt(exitMatch[1], 10)
    if (code !== 0) return { failed: true, exitCode: code, reason: `exit ${code}` }
  }
  if (text.includes('[TIMED OUT]') || tool.timedOut) {
    return { failed: true, reason: 'timeout' }
  }
  if (text.includes('[COMMAND NOT FOUND]')) {
    return { failed: true, exitCode: 127, reason: 'command not found' }
  }
  if (tool.commandFailed) {
    return { failed: true, reason: 'failed' }
  }
  return { failed: false, reason: '' }
}

/** Format a human-phrased label for a tool call using i18n keys. */
export function formatToolLabel(tool: Pick<ToolEntry, 'name' | 'args'>, tFn: TranslateFn): string {
  const a = (tool.args && typeof tool.args === 'object' ? tool.args : {}) as Record<string, unknown>
  const basename = (p: unknown) => {
    try {
      return String(p).replace(/\\/g, '/').split('/').pop() || String(p)
    } catch {
      return String(p ?? '')
    }
  }
  const first = (s: unknown, n = 40) => {
    const x = String(s || '').trim().replace(/\s+/g, ' ')
    return x.length > n ? x.slice(0, n) + '…' : x
  }
  switch (tool.name) {
    case 'read_file': return a.path ? `${tFn('tool.read_file')} ${basename(a.path)}` : tFn('tool.read_file')
    case 'list_dir': return a.path ? `${tFn('tool.list_dir')} ${basename(a.path)}` : tFn('tool.list_dir')
    case 'glob_find': return a.pattern ? `${tFn('tool.glob_find')} ${first(a.pattern, 30)}` : tFn('tool.glob_find')
    case 'grep_search': return a.pattern ? `${tFn('tool.grep_search')} ${first(a.pattern, 30)}` : tFn('tool.grep_search')
    case 'web_search': return a.query ? `${tFn('tool.web_search')} ${first(a.query)}` : tFn('tool.web_search')
    case 'web_fetch': return a.url ? `${tFn('tool.web_fetch')} ${first(a.url, 40)}` : tFn('tool.web_fetch')
    case 'agent_browser': {
      const act = a.action ? `[${String(a.action)}]` : ''
      const target = a.url ? ` ${first(a.url, 35)}` : (a.ref ? ` ${String(a.ref)}` : (a.selector ? ` ${first(a.selector, 25)}` : ''))
      return `${tFn('tool.agent_browser') || 'Browser'} ${act}${target}`.trim()
    }
    case 'write_file': return a.path ? `${tFn('tool.write_file')} ${basename(a.path)}` : tFn('tool.write_file')
    case 'edit_file': return a.path ? `${tFn('tool.edit_file')} ${basename(a.path)}` : tFn('tool.edit_file')
    case 'run_command': return a.command ? `${tFn('tool.run_command')} ${first(String(a.command).split(' ').slice(0, 3).join(' '), 30)}` : tFn('tool.run_command')
    case 'git_status': return tFn('tool.git_status')
    case 'git_diff': return tFn('tool.git_diff')
    case 'git_log': return a.count ? `${tFn('tool.git_log')} (${String(a.count)})` : tFn('tool.git_log')
    case 'git_commit': return a.message ? `${tFn('tool.git_commit')}: ${first(a.message, 30)}` : tFn('tool.git_commit')
    case 'memory_save': return tFn('tool.memory_save')
    case 'memory_list': return tFn('tool.memory_list')
    case 'use_skill': return a.name ? `${tFn('tool.use_skill')} ${first(a.name, 30)}` : tFn('tool.use_skill')
    case 'ask_user': return tFn('tool.ask_user')
    case 'history_search': return a.query ? `${tFn('tool.history_search')}: ${first(a.query, 30)}` : tFn('tool.history_search')
    case 'todo_write': return tFn('tool.todo_write')
    default: return tool.name
  }
}

/** Format elapsed milliseconds into compact `45s`, `3m`, or `3m 33s` labels. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

/** Map a todo item + streaming status into its visual step state (including paused). */
export function deriveStepVisualState(todo: Pick<TodoItem, 'status'>, streaming: boolean): StepVisualState {
  if (todo.status === 'completed') return 'completed'
  if (todo.status === 'in_progress') return streaming ? 'in_progress' : 'paused'
  return 'pending'
}

/** Derive live or settled activity duration in milliseconds without extra IPC. */
export function deriveActivityDurationMs(params: {
  toolCalls?: ToolEntry[]
  thinkingDuration?: number | null
  thinkingStartedAt?: number | null
  turnStartedAt?: number | null
  latencyMs?: number | null
  now?: number
  streaming?: boolean
}): number | null {
  const { toolCalls, thinkingDuration, thinkingStartedAt, turnStartedAt, latencyMs, now, streaming } = params
  if (streaming) {
    const candidates: number[] = []
    if (typeof turnStartedAt === 'number' && turnStartedAt > 0) candidates.push(turnStartedAt)
    if (typeof thinkingStartedAt === 'number' && thinkingStartedAt > 0) candidates.push(thinkingStartedAt)
    if (toolCalls) {
      for (const tc of toolCalls) {
        if (typeof tc.startedAt === 'number' && tc.startedAt > 0) candidates.push(tc.startedAt)
      }
    }
    if (candidates.length === 0) return null
    const earliest = Math.min(...candidates)
    return Math.max(0, (now ?? Date.now()) - earliest)
  }

  if (typeof latencyMs === 'number' && latencyMs > 0) {
    return latencyMs
  }
  const toolSum = (toolCalls || []).reduce((acc, tc) => {
    return acc + (typeof tc.latencyMs === 'number' && tc.latencyMs > 0 ? tc.latencyMs : 0)
  }, 0)
  const thinkMs = typeof thinkingDuration === 'number' && thinkingDuration > 0 ? Math.round(thinkingDuration * 1000) : 0
  const total = toolSum + thinkMs
  return total > 0 ? total : null
}

/** Derive the single-line live focus summary from active tools, todos, or status lines. */
export function deriveLiveFocusLabel(params: {
  toolCalls?: ToolEntry[]
  todos?: TodoItem[]
  statusLines?: string[]
  tFn: TranslateFn
}): string | null {
  const { toolCalls, todos, statusLines, tFn } = params
  if (toolCalls && toolCalls.length > 0) {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const tc = toolCalls[i]
      if (tc.result == null && tc.error == null) {
        return formatToolLabel(tc, tFn)
      }
    }
  }
  if (todos && todos.length > 0) {
    const active = todos.find((item) => item.status === 'in_progress')
    if (active) return (active.activeForm || active.content).trim() || null
  }
  if (statusLines && statusLines.length > 0) {
    for (let i = statusLines.length - 1; i >= 0; i--) {
      const line = statusLines[i]?.trim()
      if (line) return line
    }
  }
  if (toolCalls && toolCalls.length > 0) {
    return formatToolLabel(toolCalls[toolCalls.length - 1], tFn)
  }
  return null
}

/** Merge plan steps and tool calls into display-ordered timeline nodes. */
export function buildTimelineNodes(planSteps?: PlanStep[], toolCalls?: ToolEntry[]): TimelineNode[] {
  const steps = planSteps || []
  const tools = toolCalls || []

  if (steps.length === 0) {
    return tools.map((tool, idx) => ({ kind: 'tool', key: `tool-${idx}`, tool }))
  }
  if (tools.length === 0) {
    return steps.map((step, idx) => ({ kind: 'step', key: `step-${idx}`, step }))
  }

  const hasStepDepth = steps.some((s) => s.depth != null)
  const hasToolDepth = tools.some((t) => t.depth != null)

  if (hasStepDepth && hasToolDepth) {
    const depths = Array.from(
      new Set([...steps.map((s) => s.depth ?? 0), ...tools.map((t) => t.depth ?? 0)])
    ).sort((a, b) => a - b)

    const nodes: TimelineNode[] = []
    for (const d of depths) {
      const actOrPlanSteps = steps.filter((s) => (s.depth ?? 0) === d && s.kind !== 'observe')
      actOrPlanSteps.forEach((step, idx) => {
        nodes.push({ kind: 'step', key: `step-d${d}-${idx}`, step })
      })

      const depthTools = tools.filter((t) => (t.depth ?? 0) === d)
      depthTools.forEach((tool, idx) => {
        nodes.push({ kind: 'tool', key: `tool-d${d}-${idx}`, tool })
      })

      const observeSteps = steps.filter((s) => (s.depth ?? 0) === d && s.kind === 'observe')
      observeSteps.forEach((step, idx) => {
        nodes.push({ kind: 'step', key: `step-obs-d${d}-${idx}`, step })
      })
    }
    return nodes
  }

  const nodes: TimelineNode[] = []
  const maxLen = Math.max(steps.length, tools.length)
  for (let i = 0; i < maxLen; i++) {
    if (i < steps.length) {
      nodes.push({ kind: 'step', key: `step-${i}`, step: steps[i] })
    }
    if (i < tools.length) {
      nodes.push({ kind: 'tool', key: `tool-${i}`, tool: tools[i] })
    }
  }
  return nodes
}
