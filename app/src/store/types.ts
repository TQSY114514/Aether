import type { Provider, Model, Persona, Session, Message, ViewType, ArenaResult, ModelScore } from '@/types'
import { type LangCode, LANGS, getLangDir } from '@/utils/i18n'

// Set <html dir> for RTL languages (Arabic).
export function applyLangDir(code: LangCode) {
  document.documentElement.dir = getLangDir(code)
}

export const LANGS_CODES = LANGS.map(l => l.code)

export interface SessionConfig {
  providerId: number | null
  modelId: number | null
  personaId: number | null
  workspace?: string | null
}

// ───────────────────────────────────────────────────────────────────────────
// Feature A — background tasks (docs/p0-agent-workbench.md 功能 A).
// A task runs `runToolLoop` in its own child session in the main process; the
// renderer keeps a mirror of the TaskManager's list so TaskPanel can show live
// progress and open a task's session to read the full trace.
// ───────────────────────────────────────────────────────────────────────────

export type TaskStatus = 'queued' | 'running' | 'plan' | 'paused' | 'done' | 'cancelled' | 'error' | 'pending'

export interface TaskInfo {
  id: number
  sessionId: number
  status: TaskStatus
  title: string
  createdAt: number
  finalContent?: string | null
  error?: string | null
  /** Renderer-only: newest `task:progress` line, condensed to one line. Never
   *  sent over IPC, so a fresh `task.list()` must not clobber it. */
  lastProgress?: string | null
}

export type TaskProgressType = 'tool-call' | 'plan-step' | 'status' | 'todo-update' | 'chunk' | 'paused' | 'resumed'

/** The `task:*` IPC surface (handler + preload + env.d.ts — AGENTS.md hard rule).
 *  Mirrored here so the renderer half type-checks and degrades gracefully when
 *  it runs against an older main process: `electron/` files are NOT hot-reloaded,
 *  so a rebuilt renderer can legitimately meet a preload without `task`. */
interface TaskApi {
  start: (params: { content: string; modelId: number; agentMode?: AppState['agentMode'] }) => Promise<{ taskId: number; sessionId: number; error?: string }>
  list: () => Promise<TaskInfo[]>
  cancel: (taskId: number) => Promise<{ ok: boolean }>
  pause: (taskId: number) => Promise<{ ok: boolean }>
  resume: (taskId: number) => Promise<{ ok: boolean }>
  derive: (params: { content: string; modelId: number; agentMode?: AppState['agentMode'] }) => Promise<{ taskId: number; sessionId: number; error?: string }>
  getResult: (taskId: number) => Promise<{ status: string; finalContent: string | null } | null>
  onStarted: (cb: (task: TaskInfo) => void) => () => void
  onProgress: (cb: (p: { taskId: number; type: TaskProgressType; payload: unknown }) => void) => () => void
  onDone: (cb: (p: { taskId: number; sessionId: number; finalContent: string }) => void) => () => void
  onCancelled: (cb: (p: { taskId: number }) => void) => () => void
  onError: (cb: (p: { taskId: number; error: string }) => void) => () => void
}

/** Returns the task IPC bridge, or null when the running main process predates
 *  Feature A (see TaskApi). Callers must handle null instead of throwing. */
export function taskApi(): TaskApi | null {
  const api: unknown = window.electronAPI
  if (!api || typeof api !== 'object') return null
  const task = (api as { task?: unknown }).task
  return task && typeof task === 'object' ? (task as TaskApi) : null
}

// Field-by-field merge: `undefined` in the patch means "not reported", which
// must keep the previous value; explicit `null` means "cleared".
export function mergeTask(prev: TaskInfo, patch: Partial<TaskInfo>): TaskInfo {
  return {
    id: prev.id,
    sessionId: patch.sessionId ?? prev.sessionId,
    status: patch.status ?? prev.status,
    title: patch.title ?? prev.title,
    createdAt: patch.createdAt ?? prev.createdAt,
    finalContent: patch.finalContent !== undefined ? patch.finalContent : prev.finalContent ?? null,
    error: patch.error !== undefined ? patch.error : prev.error ?? null,
    lastProgress: patch.lastProgress !== undefined ? patch.lastProgress : prev.lastProgress ?? null,
  }
}

export function newTask(patch: Partial<TaskInfo> & { id: number }): TaskInfo {
  return {
    id: patch.id,
    sessionId: patch.sessionId ?? 0,
    status: patch.status ?? 'running',
    title: patch.title ?? '',
    createdAt: patch.createdAt ?? Date.now(),
    finalContent: patch.finalContent ?? null,
    error: patch.error ?? null,
    lastProgress: patch.lastProgress ?? null,
  }
}

// Condense one `task:progress` event into a single summary line. Returns null
// for events that carry no summary (streamed chunks, malformed payloads).
export function taskProgressText(type: TaskProgressType, payload: unknown): string | null {
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
  const str = (v: unknown, key: string): string => {
    if (!isRecord(v)) return ''
    const raw = v[key]
    return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  }
  switch (type) {
    case 'status': {
      const text = str(payload, 'text')
      return text || null
    }
    case 'tool-call': {
      const name = str(payload, 'name')
      if (!name) return null
      const failed = isRecord(payload) && payload.error != null && payload.error !== ''
      return `${failed ? '⚠️' : '🔧'} ${name}`
    }
    case 'plan-step': {
      const text = str(payload, 'assistantText')
      return text ? text.slice(0, 140) : null
    }
    case 'todo-update': {
      if (!Array.isArray(payload) || payload.length === 0) return null
      const done = payload.filter((x) => isRecord(x) && x.status === 'completed').length
      return `📋 ${done}/${payload.length}`
    }
    case 'chunk':
      return null
    case 'paused':
      return '⏸️ ' + (str(payload, 'text') || '已暂停')  // shown as lastProgress
    case 'resumed':
      return '▶️ ' + (str(payload, 'text') || '已恢复')
  }
}

export interface AppState {
  // Navigation
  currentView: ViewType
  setCurrentView: (view: ViewType) => void
  newChat: () => void
  // Chat mode
  sessions: Session[]
  currentSessionId: number | null
  messages: Message[]
  loadSessions: () => Promise<void>
  createSession: () => Promise<number | null>
  selectSession: (id: number) => Promise<void>
  deleteSession: (id: number) => Promise<void>

  // Per-session config map
  sessionConfigs: Record<number, SessionConfig>
  getSessionConfig: (id: number) => SessionConfig
  saveSessionConfig: (id: number, config: Partial<SessionConfig>) => Promise<void>

  // Providers
  providers: Provider[]
  allModels: Model[]
  loadProviders: () => Promise<void>
  addProvider: (data: Omit<Provider, 'id' | 'created_at'>) => Promise<void>
  updateProvider: (id: number, data: Partial<Provider>) => Promise<void>
  deleteProvider: (id: number) => Promise<void>

  // Models
  modelsByProvider: Record<number, Model[]>
  loadModels: (providerId: number) => Promise<void>
  addModel: (data: Omit<Model, 'id' | 'created_at'>) => Promise<void>
  updateModel: (id: number, data: Partial<Model>) => Promise<void>
  deleteModel: (id: number) => Promise<void>
  loadAllModels: () => Promise<void>

  // Personas
  personas: Persona[]
  loadPersonas: () => Promise<void>
  addPersona: (data: Omit<Persona, 'id' | 'created_at'>) => Promise<void>
  updatePersona: (id: number, data: Partial<Persona>) => Promise<void>
  deletePersona: (id: number) => Promise<void>

  // Chat mode
  chatMode: 'normal' | 'arena'
  setChatMode: (mode: 'normal' | 'arena') => void

  // Message search (scoped to current session)
  messageSearchQuery: string
  setMessageSearchQuery: (q: string) => void

  // Chat — per-session streaming state so multiple sessions can stream concurrently.
  // `streamingBySession[sid]` holds the live assistant content being streamed for that
  // session. Components should derive their own per-session `isStreaming` from this
  // map rather than relying on the global `sending` flag, so one session's stream
  // never blocks another session's input.
  streamingBySession: Record<number, { content: string; messageId: number | null }>
  sending: boolean
  appendArenaResult: (sessionId: number, result: ArenaResult) => void
  // Per-message tool-call invocations, keyed by the assistant messageId the
  // tool belongs to. Each entry is the list of tool calls for that message.
  toolCallsByMessage: Record<number, { name: string; args: unknown; result: string | null; error: string | null; failureKind?: string | null; recoveryHint?: { action?: string; hint?: string } | null; risk?: string | null; latencyMs?: number | null; startedAt?: number | null }[]>
  // Per-message agent plan steps (the assistant's reasoning each round).
  planStepsByMessage: Record<number, { step: number; depth: number; assistantText: string; kind?: 'plan' | 'act' | 'observe' }[]>
  // Per-message agent todo checklist (updated via the todo_write tool).
  todosByMessage: Record<number, { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }[]>
  // Per-message thinking/reasoning blocks from extended-thinking models (Claude
  // extended thinking, OpenAI o-series reasoning_content). Accumulated as
  // deltas arrive during streaming; cleared when the stream ends.
  thinkingBlocksByMessage: Record<number, string>
  // Inline status lines per message (compaction notice, budget-exhausted, etc.).
  statusLinesByMessage: Record<number, string[]>
  // Context budget indicator text (shown in status bar).
  contextBudgetText: string | null
  // Pending AskUserQuestion dialogs awaiting a user answer.
  pendingQuestions: { reqId: string; questions: { question: string; header?: string; options: { label: string; description?: string }[] }[] }[]
  resolveQuestion: (reqId: string, answers: { question: string; answer: string }[]) => void
  // Agent permission mode, in increasing order of risk:
  //   'off'          — no tools at all (plain chat)
  //   'plan'         — read-only tools only (read_file/list_dir/grep/web_search…); no writes/commands
  //   'ask'          — dangerous tools require a confirm dialog (recommended)
  //   'auto_confirm' — safe tools auto-allowed, dangerous tools still need confirm
  //   'auto'         — run everything, no confirms (still inside the workspace sandbox)
  //   'yolo'         — FULL permission: skip the workspace path guard AND the command blocklist.
  //                    DANGER: the model can write any file and run any command. Only for
  //                    trusted models + throwaway VMs. Warned on enable.
  agentMode: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo' | 'custom'
  setAgentMode: (v: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo' | 'custom') => void
  // Pending permission requests awaiting a user decision (rendered as a dialog).
  permissionRequests: { reqId: string; messageId: number; sessionId: number; name: string; args: unknown; risk: 'safe' | 'dangerous'; impact?: { summary: string; severity: string; affectedFiles: string[]; command?: string } | null }[]
  resolvePermission: (reqId: string, allowed: boolean, remember?: boolean | 'session' | 'remember') => void
  // Habit proposals awaiting user consent (promote vs dismiss). Surfaced as a
  // small inline card in ChatWindow — never auto-applied.
  proposedHabits: { key: string; imperative: string; reason: string }[]
  resolveHabit: (key: string, accept: boolean) => void
  // Message queue: when the user sends while a turn is streaming, the message
  // is queued (not lost, not interrupting) and auto-sent after the current turn.
  queuedMessages: { id: number; content: string }[]
  enqueueMessage: (content: string) => void
  removeQueued: (id: number) => void
  // Session navigation history (browser-style back/forward). selectSession pushes;
  // goBack/goForward move the pointer without pushing.
  sessionHistory: number[]
  sessionHistoryIdx: number
  goBack: () => void
  goForward: () => void
  // First-use contextual hints (show-once). Persisted in settings as seen_hints.
  activeHints: { flag: string; text: string }[]
  seenHints: string[]
  dismissHint: (flag: string) => void
  triggerHint: (flag: string, text: string) => void
  // Thinking/reasoning: separated into a toggle (on/off) and a depth slider.
  //   thinkingEnabled  — whether extended thinking is active at all. When off,
  //                      OpenAI/Claude send no reasoning param; DeepSeek sends
  //                      thinking:{type:'disabled'} (true off).
  //   effortLevel      — depth slider, one of 'low'|'medium'|'high'. Ignored when
  //                      thinkingEnabled is false. Maps to reasoning_effort for
  //                      OpenAI o-series, thinking.budget_tokens for Claude.
  thinkingEnabled: boolean
  setThinkingEnabled: (v: boolean) => void
  effortLevel: 'low' | 'medium' | 'high'
  setEffortLevel: (v: 'low' | 'medium' | 'high') => void
  // Last model-suggestion rationale from modelAdvisor (shown in ModelSelector).
  modelSuggestion: ModelSuggestion | null
  // Refresh the suggestion on session open (based on the latest user message).
  refreshModelSuggestion: () => Promise<void>
  // Feature B: mid-turn injection tracking.
  loopingSessions: Set<number>
  setLooping: (sessionId: number, looping: boolean) => void
  injectMessage: (content: string) => void
  isInjectedMsg: (id: number) => boolean
  // Feature A: background tasks. In-memory mirror of the main-process
  // TaskManager (which is itself not persisted — see the plan's 明确不做 #2),
  // hydrated by TaskPanel via `task.list()` on mount.
  tasks: TaskInfo[]
  // Add-or-merge by id. Fields left `undefined` keep their previous value, so a
  // fresh `task.list()` never wipes a running task's `lastProgress`.
  upsertTask: (task: Partial<TaskInfo> & { id: number }) => void
  // Explicit dismissal only. Finished/cancelled tasks stay in the list until
  // the user removes them — a cancelled task is still a result worth seeing.
  removeTask: (id: number) => void
  // TaskPanel drawer visibility. A drawer (not a `ViewType` page) because the
  // page switch lives in App.tsx, which this feature must not touch.
  tasksOpen: boolean
  setTasksOpen: (v: boolean) => void
  stopGeneration: () => Promise<void>
  continueMessage: () => Promise<void>

  regenerate: () => Promise<void>
  editLastUserMessage: () => void
  undoLastEdit: () => void
  editMessage: (messageId: number, newContent: string) => Promise<void>
  sendMessage: (content: string, attachments?: { name: string; mime: string; kind: 'text' | 'image'; dataUrl?: string; preview?: string }[]) => Promise<void>
  loadMessages: (sessionId: number) => Promise<void>

  // Arena
  arenaResults: ArenaResult[]
  arenaResultsSessionId: number | null
  arenaPending: number
  arenaModelIds: number[]
  setArenaModelIds: (ids: number[]) => void
  arenaTemperatures: number[] | null
  setArenaTemperatures: (temps: number[] | null) => void
  arenaError: string | null
  arenaVoted: boolean
  arenaVoteWinnerId: number | null
  runArena: (content: string) => Promise<void>
  arenaVote: (winner: { model_id: number; model_name: string }, losers: { model_id: number; model_name: string }[]) => Promise<void>

  // Scores
  scores: ModelScore[]
  loadScores: () => Promise<void>

  // Settings
  language: LangCode
  theme: string
  fallbackTimeout: number
  fontScale: number            // 0.85–1.25, base font-size multiplier
  bubbleWidth: number          // 60–100 (%), max width of message bubbles
  defaultThinkingEnabled: boolean  // default thinking toggle for new sessions
  defaultEffort: 'low' | 'medium' | 'high'  // default thinking effort for new sessions
  defaultModelId: number | null   // default model for new sessions (null = first enabled)
  defaultPersonaId: number | null // default persona for new sessions (null = none)
  // Advanced generation params (advanced users). Empty/0 means "let the provider default".
  maxTokens: number            // 0 = unset (use provider default); else cap output tokens
  temperature: number          // 0 = unset; 0.0–2.0 sampling temperature
  topP: number                 // 0 = unset; 0–1 nucleus sampling
  systemPrefix: string         // custom text prepended to every system prompt
  autoTitle: boolean           // auto-generate a summary title for new sessions
  titleLanguage: string        // language for generated titles ('auto' follows UI lang)
  titleModelId: number | null  // model to use for generating session titles (null = first enabled)
  backgroundImage: string | null
  backgroundOpacity: number   // 0–100, how visible the image is
  backgroundBlur: number      // 0–20px
  memories: { id: number; content: string; created_at: string }[]
  loadMemories: () => Promise<void>
  loadSettings: () => Promise<void>
  setLanguage: (lang: LangCode) => Promise<void>
  setTheme: (theme: string) => Promise<void>
  setFallbackTimeout: (ms: number) => Promise<void>
  setFontScale: (v: number) => Promise<void>
  setBubbleWidth: (v: number) => Promise<void>
  setMaxTokens: (v: number) => Promise<void>
  setTemperature: (v: number) => Promise<void>
  setTopP: (v: number) => Promise<void>
  setSystemPrefix: (v: string) => Promise<void>
  setAutoTitle: (v: boolean) => Promise<void>
  setTitleLanguage: (v: string) => Promise<void>
  setTitleModel: (id: number | null) => Promise<void>
  setDefaultEffort: (v: 'low' | 'medium' | 'high') => Promise<void>
  setDefaultThinkingEnabled: (v: boolean) => Promise<void>
  setDefaultModel: (id: number | null) => Promise<void>
  setDefaultPersona: (id: number | null) => Promise<void>
  setBackgroundImage: (dataUrl: string | null) => Promise<void>
  setBackgroundOpacity: (v: number) => Promise<void>
  setBackgroundBlur: (v: number) => Promise<void>

  // Model routing priority (used by modelRouter to pick models).
  modelRoutingPriority: 'quality' | 'speed' | 'cost'
  setModelRoutingPriority: (v: 'quality' | 'speed' | 'cost') => Promise<void>
  // Auto model routing: when enabled, suggestModelForTier blends Arena ELO +
  // price + latency instead of only using the tier heuristic (Task 3.3).
  modelAutoRoute: boolean
  setModelAutoRoute: (v: boolean) => Promise<void>
  // Auto-commit after test-gate verification passes.
  autoCommitOnTestPass: boolean
  setAutoCommitOnTestPass: (v: boolean) => Promise<void>
  // Auto-commit after each file change (write_file/edit_file/apply_patch).
  autoCommitAfterFileChange: boolean
  setAutoCommitAfterFileChange: (v: boolean) => Promise<void>

  // UI
  sidebarOpen: boolean
  toggleSidebar: () => void
  completionToasts: { id: number; sessionId: number; sessionTitle: string }[]
  toasts: { id: number; message: string; type?: 'info' | 'success' | 'warning' | 'error' }[]
  dismissToast: (id: number) => void
  triggerToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  pinSession: (id: number, pinned?: number) => Promise<void>
  notifyComplete: (sessionId: number, sessionTitle: string) => void
  // Agent workspace root (global, set from settings).
  agentWorkspace: string
  setAgentWorkspace: (dir: string) => Promise<void>
}

// Apply the font-scale multiplier as a root CSS var; index.css uses it on html.
export function applyFontScale(scale: number) {
  const clamped = Math.min(1.25, Math.max(0.85, scale || 1))
  document.documentElement.style.setProperty('--font-scale', String(clamped))
}

export function decodeDataUrlText(dataUrl: string): string {
  const m = /^data:[^;]*;base64,(.*)$/s.exec(dataUrl)
  if (!m) {
    // maybe data:text/plain,<urlencoded>
    const m2 = /^data:[^,]*,(.*)$/s.exec(dataUrl)
    if (m2) { try { return decodeURIComponent(m2[1]) } catch { return m2[1] } }
    return ''
  }
  try {
    const bin = atob(m[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}