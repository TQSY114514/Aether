import { create } from 'zustand'
import type { Provider, Model, Persona, Session, Message, ViewType, ArenaResult, ModelScore } from '@/types'
import { setLang, detectLang, t, type LangCode, LANGS } from '@/utils/i18n'
import { getLangDir } from '@/utils/i18n'
import { applyTheme, getThemes } from '@/utils/theme'
import log from '@/utils/logger'

// Set <html dir> for RTL languages (Arabic).
function applyLangDir(code: LangCode) {
  document.documentElement.dir = getLangDir(code)
}
const LANGS_CODES = LANGS.map(l => l.code)

interface SessionConfig {
  providerId: number | null
  modelId: number | null
  personaId: number | null
}

interface AppState {
  // Navigation
  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  // Sessions
  sessions: Session[]
  currentSessionId: number | null
  messages: Message[]
  loadSessions: () => Promise<void>
  createSession: () => Promise<void>
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
  // session. `sending` is a convenience boolean derived from the current session's entry.
  streamingBySession: Record<number, { content: string; messageId: number | null }>
  sending: boolean
  // Per-message tool-call invocations, keyed by the assistant messageId the
  // tool belongs to. Each entry is the list of tool calls for that message.
  toolCallsByMessage: Record<number, { name: string; args: unknown; result: string | null; error: string | null; risk?: string | null; latencyMs?: number | null }[]>
  // Per-message agent plan steps (the assistant's reasoning each round).
  planStepsByMessage: Record<number, { step: number; depth: number; assistantText: string }[]>
  // Per-message agent todo checklist (updated via the todo_write tool).
  todosByMessage: Record<number, { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }[]>
  // Inline status lines per message (compaction notice, budget-exhausted, etc.).
  statusLinesByMessage: Record<number, string[]>
  // Pending AskUserQuestion dialogs awaiting a user answer.
  pendingQuestions: { reqId: string; questions: { question: string; header?: string; options: { label: string; description?: string }[] }[] }[]
  resolveQuestion: (reqId: string, answers: { question: string; answer: string }[]) => void
  // Agent permission mode, in increasing order of risk:
  //   'off'   — no tools at all (plain chat)
  //   'plan'  — read-only tools only (read_file/list_dir/grep/web_search…); no writes/commands
  //   'ask'   — dangerous tools require a confirm dialog (recommended)
  //   'auto'  — run everything, no confirms (still inside the workspace sandbox)
  //   'yolo'  — FULL permission: skip the workspace path guard AND the command blocklist.
  //             DANGER: the model can write any file and run any command. Only for
  //             trusted models + throwaway VMs. Warned on enable.
  agentMode: 'off' | 'plan' | 'ask' | 'auto' | 'yolo'
  setAgentMode: (v: 'off' | 'plan' | 'ask' | 'auto' | 'yolo') => void
  // Pending permission requests awaiting a user decision (rendered as a dialog).
  permissionRequests: { reqId: string; messageId: number; sessionId: number; name: string; args: unknown; risk: 'safe' | 'dangerous' }[]
  resolvePermission: (reqId: string, allowed: boolean, remember?: boolean) => void
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
  // Thinking/reasoning effort level sent to the model (real param: reasoning_effort
  // for OpenAI o-series, thinking.budget_tokens for Claude). 'off' = no param.
  effortLevel: 'off' | 'low' | 'medium' | 'high'
  setEffortLevel: (v: 'off' | 'low' | 'medium' | 'high') => void
  stopGeneration: () => Promise<void>
  regenerate: () => Promise<void>
  editMessage: (messageId: number, newContent: string) => Promise<void>
  sendMessage: (content: string, attachments?: { name: string; mime: string; kind: 'text' | 'image'; dataUrl?: string; preview?: string }[]) => Promise<void>
  loadMessages: (sessionId: number) => Promise<void>

  // Arena
  arenaResults: ArenaResult[]
  arenaAggregate: { content: string; model_name: string; provider_name: string } | null
  arenaModelIds: number[]
  setArenaModelIds: (ids: number[]) => void
  arenaError: string | null
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
  defaultEffort: 'off' | 'low' | 'medium' | 'high'  // default thinking effort for new sessions
  // Advanced generation params (advanced users). Empty/0 means "let the provider default".
  maxTokens: number            // 0 = unset (use provider default); else cap output tokens
  temperature: number          // 0 = unset; 0.0–2.0 sampling temperature
  topP: number                 // 0 = unset; 0–1 nucleus sampling
  systemPrefix: string         // custom text prepended to every system prompt
  autoTitle: boolean           // auto-generate a summary title for new sessions
  titleLanguage: string        // language for generated titles ('auto' follows UI lang)
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
  setDefaultEffort: (v: 'off' | 'low' | 'medium' | 'high') => Promise<void>
  setBackgroundImage: (dataUrl: string | null) => Promise<void>
  setBackgroundOpacity: (v: number) => Promise<void>
  setBackgroundBlur: (v: number) => Promise<void>

  // UI
  sidebarOpen: boolean
  toggleSidebar: () => void
}

// Apply the font-scale multiplier as a root CSS var; index.css uses it on html.
function applyFontScale(scale: number) {
  const clamped = Math.min(1.25, Math.max(0.85, scale || 1))
  document.documentElement.style.setProperty('--font-scale', String(clamped))
}

function decodeDataUrlText(dataUrl: string): string {
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

// Config bundle shape mirrors `electron/ipc/config.handler.js` (the canonical
// main-process serializer). The `buildConfigBundle` in `src/types/config.ts`
// produces the same structure for the renderer-side export path.

// Shared model-resolution helper: try allModels (cached), then primary API,
// then listAll API. Returns { providerId, modelId } or null. Also optionally
// persists to session config if sessionId is given.
async function resolveModelId(): Promise<{ providerId: number | null; modelId: number | null }> {
  const { allModels } = get()
  if (allModels.length > 0) {
    const primary = allModels.find(m => m.is_primary) || allModels[0]
    return { providerId: primary.provider_id, modelId: primary.id }
  }
  try {
    const primary = await window.electronAPI.model.primary()
    if (primary) return { providerId: primary.provider_id, modelId: primary.id }
  } catch (e) { log.warn('resolveModelId: primary() failed:', e) }
  try {
    const all = await window.electronAPI.model.listAll()
    if (all.length > 0) return { providerId: all[0].provider_id, modelId: all[0].id }
  } catch (e) { log.warn('resolveModelId: listAll() failed:', e) }
  return { providerId: null, modelId: null }
}

// Generic setter: persist to DB then update Zustand state.
async function setSetting(key: string, value: string, patch: Record<string, unknown>) {
  await window.electronAPI.settings.set(key, value)
  set(patch)
}

export const useStore = create<AppState>((set, get) => ({
  // Navigation
  currentView: 'chat',
  setCurrentView: (view) => set({ currentView: view }),

  // Sessions
  sessions: [],
  currentSessionId: null,
  messages: [],
  // Per-session streaming buffers: { [sessionId]: { content, messageId } }
  streamingBySession: {},
  sending: false,
  toolCallsByMessage: {},
  planStepsByMessage: {},
  todosByMessage: {},
  statusLinesByMessage: {},
  pendingQuestions: [],
  proposedHabits: [],
  queuedMessages: [],
  sessionHistory: [],
  sessionHistoryIdx: -1,
  activeHints: [],
  seenHints: [],
  agentMode: 'off',
  permissionRequests: [],
  effortLevel: 'off',
  completionToasts: [] as any[],
  pinSession: async (id: number) => Promise<void>,
  notifyComplete: async (sessionId: number, sessionTitle: string) => {},
  dismissToast: async (id: number) => {},

  loadSessions: async () => {
    const sessions = await window.electronAPI.session.list()
    set({ sessions })
  },
  createSession: async () => {
    let cfg = { providerId: null as number | null, modelId: null as number | null, personaId: null as number | null }
    try { const r = await resolveModelId(); if (r) cfg = r } catch {}
    const result = await window.electronAPI.session.createAndSelect(cfg)
    const sid = result.session.id
    const sessionCfg = result.config
    set((s) => ({
      currentView: 'chat',
      currentSessionId: sid,
      sessionConfigs: { ...s.sessionConfigs, [sid]: sessionCfg },
      messages: result.messages || [],
      sessions: [...s.sessions, result.session],
    }))
    if (sessionCfg.providerId) get().loadModels(sessionCfg.providerId)
  },
  pinSession: async (id: number, pinned: number = 1) => {
    try { await window.electronAPI.session.pin(id, pinned) } catch {}
    await get().loadSessions()
  },
  selectSession: async (id) => {
    // Push to the navigation history unless we got here via goBack/goForward
    // (those move the pointer, they don't push a new entry).
    if (!_navigating) {
      const { sessionHistory, sessionHistoryIdx } = get()
      const truncated = sessionHistory.slice(0, sessionHistoryIdx + 1)
      if (truncated[truncated.length - 1] !== id) {
        truncated.push(id)
        set({ sessionHistory: truncated, sessionHistoryIdx: truncated.length - 1 })
      }
    }
    // Always reload messages from DB when switching sessions. This ensures
    // messages completed while the user was viewing another session are
    // visible on switch-back (cross-session streaming fix).
    let msgs: Message[] = []
    try { msgs = await window.electronAPI.message.list(id) } catch (e) { log.error('preload', e) }
    set({ currentSessionId: id, messages: msgs, arenaResults: [] })
    // Load per-session config from DB. If missing/incomplete, resolve from allModels.
    try {
      let cfg = await window.electronAPI.session.getConfig(id)
      if (!cfg || !cfg.modelId) {
        const { providerId } = await resolveModelId()
        cfg = { providerId, modelId: null, personaId: null }
        window.electronAPI.session.setConfig(id, cfg).catch(() => {})
      }
      set((s) => ({
        currentSessionId: id,
        sessionConfigs: { ...s.sessionConfigs, [id]: cfg },
      }))
      if (cfg.providerId) get().loadModels(cfg.providerId)
    } catch {
      set({ currentSessionId: id })
    }
  },

  // Per-session config
  sessionConfigs: {},
  getSessionConfig: (id) => {
    return get().sessionConfigs[id] || { providerId: null, modelId: null, personaId: null }
  },
  saveSessionConfig: async (id, partial) => {
    const existing = get().sessionConfigs[id] || { providerId: null, modelId: null, personaId: null }
    const updated = { ...existing, ...partial }
    await window.electronAPI.session.setConfig(id, updated)
    set((s) => ({ sessionConfigs: { ...s.sessionConfigs, [id]: updated } }))
  },

  deleteSession: async (id) => {
    await window.electronAPI.session.delete(id)
    const { currentSessionId } = get()
    // Clean up per-session state so deleted sessions don't leak streaming
    // buffers / configs in memory.
    set((s) => {
      const nextStream = { ...s.streamingBySession }
      delete nextStream[id]
      const nextConfigs = { ...s.sessionConfigs }
      delete nextConfigs[id]
      return {
        streamingBySession: nextStream,
        sessionConfigs: nextConfigs,
        ...(currentSessionId === id ? { currentSessionId: null, messages: [] } : {}),
      }
    })
    await get().loadSessions()
  },

  // Providers
  providers: [],
  allModels: [],
  loadProviders: async () => {
    const providers = await window.electronAPI.provider.list()
    set({ providers })
  },
  addProvider: async (data) => {
    await window.electronAPI.provider.create(data)
    await get().loadProviders()
  },
  updateProvider: async (id, data) => {
    await window.electronAPI.provider.update(id, data)
    await get().loadProviders()
  },
  deleteProvider: async (id) => {
    await window.electronAPI.provider.delete(id)
    const { currentSessionId, sessionConfigs } = get()
    // Clean up session configs that referenced the deleted provider, and
    // evict the provider's cached model list so stale rows don't surface.
    const nextConfigs = { ...sessionConfigs }
    for (const sid of Object.keys(nextConfigs)) {
      const numSid = Number(sid)
      const c = nextConfigs[numSid]
      if (c.providerId === id) {
        const cfg = { providerId: null as number | null, modelId: null as number | null, personaId: c.personaId }
        if (numSid === currentSessionId) await window.electronAPI.session.setConfig(numSid, cfg)
        nextConfigs[numSid] = cfg
      }
    }
    const nextModels = { ...get().modelsByProvider }
    delete nextModels[id]
    set((s) => ({
      providers: s.providers.filter(p => p.id !== id),
      allModels: s.allModels.filter(m => m.provider_id !== id),
      modelsByProvider: nextModels,
      sessionConfigs: nextConfigs,
    }))
    await get().loadAllModels()
  },

  // Models
  modelsByProvider: {},
  loadModels: async (providerId) => {
    const models = await window.electronAPI.model.list(providerId)
    set((s) => ({ modelsByProvider: { ...s.modelsByProvider, [providerId]: models } }))
  },
  addModel: async (data) => {
    await window.electronAPI.model.create(data)
    await get().loadModels(data.provider_id)
    await get().loadAllModels()
  },
  updateModel: async (id, data) => {
    await window.electronAPI.model.update(id, data)
    await get().loadAllModels()
    // Refresh the provider's models if we know which provider
    const { allModels } = get()
    const updated = allModels.find(m => m.id === id)
    if (updated) await get().loadModels(updated.provider_id)
  },
  deleteModel: async (id) => {
    const { allModels, currentSessionId } = get()
    const target = allModels.find(m => m.id === id)
    await window.electronAPI.model.delete(id)
    const updatedAll = allModels.filter(m => m.id !== id)
    const nextConfigs = { ...get().sessionConfigs }
    for (const sid of Object.keys(nextConfigs)) {
      const numSid = Number(sid)
      const c = nextConfigs[numSid]
      if (c.modelId === id) {
        const fallback = updatedAll.find(m => m.provider_id === c.providerId)
        const cfg = { providerId: c.providerId, modelId: fallback?.id ?? null, personaId: c.personaId }
        if (numSid === currentSessionId) await window.electronAPI.session.setConfig(numSid, cfg)
        nextConfigs[numSid] = cfg
      }
    }
    set((s) => ({ allModels: updatedAll, sessionConfigs: nextConfigs }))
    if (target) {
      await get().loadModels(target.provider_id)
    }
  },
  loadAllModels: async () => {
    const allModels = await window.electronAPI.model.listAll()
    set({ allModels })
  },

  // Personas
  personas: [],
  loadPersonas: async () => {
    const personas = await window.electronAPI.persona.list()
    set({ personas })
  },
  addPersona: async (data) => {
    await window.electronAPI.persona.create(data)
    await get().loadPersonas()
  },
  updatePersona: async (id, data) => {
    await window.electronAPI.persona.update(id, data)
    await get().loadPersonas()
  },
  deletePersona: async (id) => {
    await window.electronAPI.persona.delete(id)
    await get().loadPersonas()
  },

  // Chat mode
  chatMode: 'normal',
  setChatMode: (mode) => set({ chatMode: mode }),

  // Message search
  messageSearchQuery: '',
  setMessageSearchQuery: (q) => set({ messageSearchQuery: q }),

  // Chat
  sendMessage: async (content, attachments) => {
    const { currentSessionId, agentMode, effortLevel, maxTokens, temperature, topP, systemPrefix, chatMode } = get()
    const cfg = currentSessionId ? get().sessionConfigs[currentSessionId] : null
    let modelId = cfg?.modelId
    // Auto-resolve missing model: try allModels (already loaded globally)
    if (!modelId) {
      const resolved = await resolveModelId()
      modelId = resolved.modelId
      if (currentSessionId && resolved.providerId) {
        const newCfg = { providerId: resolved.providerId, modelId: resolved.modelId, personaId: cfg?.personaId || null }
        await window.electronAPI.session.setConfig(currentSessionId, newCfg)
        set((s) => ({ sessionConfigs: { ...s.sessionConfigs, [currentSessionId]: newCfg } }))
        get().loadModels(resolved.providerId)
      }
    }
    if (!currentSessionId || !modelId) {
      log.warn('sendMessage: no session or model configured')
      return
    }

    // Fold text attachments into the prompt as fenced context blocks.
    let finalContent = content
    const imageAttachments: { name: string; mime: string; dataUrl: string }[] = []
    const firstAttachment = attachments && attachments.length > 0 ? attachments[0] : null
    if (attachments && attachments.length > 0) {
      const textBlocks: string[] = []
      for (const a of attachments) {
        if (a.kind === 'image' && a.dataUrl) {
          imageAttachments.push({ name: a.name, mime: a.mime, dataUrl: a.dataUrl })
        } else if (a.kind === 'text' && a.dataUrl) {
          // dataUrl like data:text/plain;base64,XXXX
          const text = decodeDataUrlText(a.dataUrl)
          textBlocks.push(`📎 ${a.name}:\n\`\`\`\n${text}\n\`\`\``)
        }
      }
      if (textBlocks.length > 0) {
        finalContent = textBlocks.join('\n\n') + (content ? '\n\n' + content : '')
      }
    }

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: Date.now(), session_id: currentSessionId, role: 'user',
      content: finalContent, model_used: null, provider_used: null,
      token_count: null, latency_ms: null,
      status: 'success', error_message: null,
      created_at: new Date().toISOString(),
      attachment: firstAttachment ? { name: firstAttachment.name, mime: firstAttachment.mime, kind: firstAttachment.kind, preview: firstAttachment.kind === 'image' ? firstAttachment.dataUrl : undefined } : null,
    }

    set((s) => ({
      sending: true,
      // Initialize this session's streaming buffer (replacing any prior completed one).
      streamingBySession: { ...s.streamingBySession, [currentSessionId]: { content: '', messageId: null } },
      messages: [...s.messages, tempUserMsg],
    }))

    // Pin the session so the active conversation moves to the top.
    get().pinSession(currentSessionId)

    // Ensure the global chunk listener is registered exactly once; it routes every
    // chunk to whichever session it belongs to, so background streams keep flowing.
    ensureChunkListener()
    ensureToolCallListener()

    try {
      await window.electronAPI.chat.send({
        sessionId: currentSessionId,
        content: finalContent,
        modelId,
        mode: chatMode,
        personaId: cfg?.personaId ?? null,
        attachments: imageAttachments,
        useTools: agentMode !== 'off',
        agentMode: agentMode === 'off' ? 'ask' : agentMode,
        effortLevel,
        genParams: { maxTokens, temperature, topP },
        systemPrefix,
        })
    } catch (err) {
      log.error('[AetherAI] chat.send FAILED:', err)
      // Drop this session's streaming buffer on error; keep other sessions intact.
      set((s) => {
        const next = { ...s.streamingBySession }
        delete next[currentSessionId]
        return { streamingBySession: next, sending: get().currentSessionId !== currentSessionId ? s.sending : false }
      })
      log.error('chat error', err)
    }
  },

  setAgentMode: (v) => set({ agentMode: v }),
  resolvePermission: (reqId, allowed, remember = false) => {
    window.electronAPI.chat.replyPermission({ reqId, allowed, remember })
    set((s) => ({ permissionRequests: s.permissionRequests.filter((r) => r.reqId !== reqId) }))
  },
  resolveQuestion: (reqId, answers) => {
    window.electronAPI.chat.replyQuestion({ reqId, answers })
    set((s) => ({ pendingQuestions: s.pendingQuestions.filter((q) => q.reqId !== reqId) }))
  },
  resolveHabit: (key, accept) => {
    if (accept) window.electronAPI.chat.confirmHabit(key).catch(() => {})
    else window.electronAPI.chat.dismissHabit(key).catch(() => {})
    set((s) => ({ proposedHabits: s.proposedHabits.filter((h) => h.key !== key) }))
  },
  enqueueMessage: (content) => {
    set((s) => ({ queuedMessages: [...s.queuedMessages, { id: Date.now() + Math.random(), content }] }))
    get().triggerHint('first_queue', t('hint.first_queue'))
  },
  removeQueued: (id) => {
    set((s) => ({ queuedMessages: s.queuedMessages.filter((m) => m.id !== id) }))
  },
  goBack: () => {
    const { sessionHistory, sessionHistoryIdx } = get()
    if (sessionHistoryIdx <= 0) return
    const newIdx = sessionHistoryIdx - 1
    set({ sessionHistoryIdx: newIdx })
    _navigating = true
    get().selectSession(sessionHistory[newIdx]).finally(() => { _navigating = false })
  },
  goForward: () => {
    const { sessionHistory, sessionHistoryIdx } = get()
    if (sessionHistoryIdx >= sessionHistory.length - 1) return
    const newIdx = sessionHistoryIdx + 1
    set({ sessionHistoryIdx: newIdx })
    _navigating = true
    get().selectSession(sessionHistory[newIdx]).finally(() => { _navigating = false })
  },
  triggerHint: (flag, text) => {
    const { seenHints, activeHints } = get()
    if (seenHints.includes(flag) || activeHints.some((h) => h.flag === flag)) return
    set((s) => ({ activeHints: [...s.activeHints, { flag, text }] }))
  },
  dismissHint: (flag) => {
    const seen = [...new Set([...get().seenHints, flag])]
    set((s) => ({ activeHints: s.activeHints.filter((h) => h.flag !== flag), seenHints: seen }))
    try { window.electronAPI.settings.set('seen_hints', JSON.stringify(seen)) } catch (e) { log.warn('dismissHint persist failed:', e) }
  },
  setEffortLevel: (v) => set({ effortLevel: v }),
  stopGeneration: async () => {
    await window.electronAPI.chat.stop()
    await window.electronAPI.arena.stop().catch(() => {})
    // Clear streaming buffers for all sessions; nothing is sending anymore.
    set({ streamingBySession: {}, sending: false })
  },

  regenerate: async () => {
    const { currentSessionId, messages, agentMode, effortLevel, maxTokens, temperature, topP, systemPrefix } = get()
    const cfg = currentSessionId ? get().sessionConfigs[currentSessionId] : null
    const activeModelId = cfg?.modelId
    if (!currentSessionId || !activeModelId || messages.length < 2) return
    let userIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { userIdx = i; break } }
    if (userIdx < 0) return
    set((s) => ({
      messages: messages.slice(0, userIdx + 1),
      sending: true,
      streamingBySession: { ...s.streamingBySession, [currentSessionId]: { content: '', messageId: null } },
    }))
    ensureChunkListener()
    try {
      await window.electronAPI.chat.send({
        sessionId: currentSessionId, content: messages[userIdx].content, modelId: activeModelId, regenerate: true,
        personaId: cfg?.personaId ?? null,
        useTools: agentMode !== 'off',
        agentMode: agentMode === 'off' ? 'ask' : agentMode,
        effortLevel,
        genParams: { maxTokens, temperature, topP },
        systemPrefix,
      })
    } catch (err) {
      set((s) => {
        const next = { ...s.streamingBySession }
        delete next[currentSessionId]
        return { streamingBySession: next, sending: get().currentSessionId !== currentSessionId ? s.sending : false }
      })
      log.error('regenerate error:', err)
    }
  },

  // Edit a past user message: overwrite its content, drop everything after it
  // (both in DB and in-memory), then re-send as a regenerate so the model
  // replies to the edited prompt. No branching (overwrites history) — matches
  // ChatGPT's simple edit; a future parent_id model could add branches.
  editMessage: async (messageId, newContent) => {
    const { currentSessionId, messages, agentMode, effortLevel, maxTokens, temperature, topP, systemPrefix } = get()
    const cfg = currentSessionId ? get().sessionConfigs[currentSessionId] : null
    const activeModelId = cfg?.modelId
    if (!currentSessionId || !activeModelId) return
    const target = messages.find(m => m.id === messageId)
    if (!target || target.role !== 'user') return
    const content = newContent.trim()
    if (!content) return
    // Persist: update the edited message + delete everything after it.
    await window.electronAPI.message.update(messageId, { content })
    await window.electronAPI.message.deleteAfter(currentSessionId, messageId)
    // Truncate in-memory to the edited message (inclusive), with new content.
    const idx = messages.findIndex(m => m.id === messageId)
    const truncated = messages.slice(0, idx + 1).map(m => m.id === messageId ? { ...m, content } : m)
    set((s) => ({
      messages: truncated,
      sending: true,
      streamingBySession: { ...s.streamingBySession, [currentSessionId]: { content: '', messageId: null } },
    }))
    ensureChunkListener()
    try {
      await window.electronAPI.chat.send({
        sessionId: currentSessionId, content, modelId: activeModelId, regenerate: true,
        personaId: cfg?.personaId ?? null,
        useTools: agentMode !== 'off',
        agentMode: agentMode === 'off' ? 'ask' : agentMode,
        effortLevel,
        genParams: { maxTokens, temperature, topP },
        systemPrefix,
      })
    } catch (err) {
      set((s) => {
        const next = { ...s.streamingBySession }
        delete next[currentSessionId]
        return { streamingBySession: next, sending: get().currentSessionId !== currentSessionId ? s.sending : false }
      })
      log.error('editMessage error:', err)
    }
  },

  loadMessages: async (sessionId) => {
    try {
      const messages = await window.electronAPI.message.list(sessionId)
      set({ messages })
    } catch (err) {
      log.error('[AetherAI] loadMessages error:', err)
    }
  },

  // Arena
  arenaResults: [],
  arenaAggregate: null,
  arenaModelIds: [],
  arenaError: null,
  setArenaModelIds: (ids) => set({ arenaModelIds: ids }),

  runArena: async (content) => {
    const { currentSessionId, arenaModelIds } = get()
    if (!currentSessionId || arenaModelIds.length < 2) {
      set({ arenaError: '请先选择至少 2 个模型' }); return
    }
    set({ sending: true, arenaResults: [], arenaAggregate: null, arenaError: null })
    try {
      const { results, aggregate } = await window.electronAPI.arena.send({ sessionId: currentSessionId, content, modelIds: arenaModelIds, aggregate: true })
      if (!results || results.length === 0) {
        set({ sending: false, arenaError: '没有返回结果，请检查模型/网络' })
        return
      }
      set({ arenaResults: results, arenaAggregate: aggregate || null, sending: false, arenaError: null })
      // Reload messages so the persisted arena exchange (user prompt + each
      // model's answer) is in the message list too — survives a reload.
      get().loadMessages(currentSessionId)
      get().loadSessions()
    } catch (err) {
      set({ sending: false, arenaError: '竞技场请求失败: ' + (err?.message || String(err)) })
    }
  },

  arenaVote: async (winner, losers) => {
    const { messages, arenaResults } = get()
    const userMsg = messages.find(m => m.role === 'user') || arenaResults[0]
    const prompt = typeof userMsg?.content === 'string' ? userMsg.content : ''
    try {
      const result = await window.electronAPI.arena.vote({
        prompt,
        winnerModelId: winner.model_id,
        winnerModelName: winner.model_name,
        loserModelIds: losers.map(l => l.model_id),
        loserModelNames: losers.map(l => l.model_name),
      })
      if (result?.success) {
        await get().loadScores()
        // Collapse arena results to just the winner; clear the vote buttons.
        set({ arenaResults: [winner] })
      } else {
        set({ arenaError: '投票失败，请重试' })
      }
    } catch (err) {
      set({ arenaError: '投票失败: ' + (err?.message || String(err)) })
    }
  },

  // Scores
  scores: [],
  loadScores: async () => {
    const scores = await window.electronAPI.arena.scores()
    set({ scores })
  },

  // Settings
  language: 'en',
  theme: 'light',
  fallbackTimeout: 30000,
  fontScale: 1,
  bubbleWidth: 85,
  defaultEffort: 'off',
  maxTokens: 0,
  temperature: 0,
  topP: 0,
  systemPrefix: '',
  autoTitle: true,
  titleLanguage: 'auto',
  backgroundImage: null,
  backgroundOpacity: 100,
  backgroundBlur: 0,
  memories: [],
  loadMemories: async () => {
    try {
      const entries = await window.electronAPI.memory.list()
      set({ memories: entries })
    } catch (e) { log.warn('loadMemories failed:', e) }
  },

  loadSettings: async () => {
    try {
      const s = await window.electronAPI.settings.getAll()
      const saved = s.language as LangCode | undefined
      const lang: LangCode = saved && LANGS_CODES.includes(saved) ? saved : detectLang()
      const theme = s.theme || 'light'
      const timeout = parseInt(s.fallback_timeout_ms || '30000', 10)
      const bgOpacity = parseInt(s.backgroundOpacity ?? '100', 10)
      const bgBlur = parseInt(s.backgroundBlur ?? '0', 10)
      const fontScale = parseFloat(s.fontScale ?? '1')
      const bubbleWidth = parseInt(s.bubbleWidth ?? '85', 10)
      const defaultEffort = (s.defaultEffort ?? 'off') as 'off' | 'low' | 'medium' | 'high'
      const maxTokens = parseInt(s.maxTokens ?? '0', 10)
      const temperature = parseFloat(s.temperature ?? '0')
      const topP = parseFloat(s.topP ?? '0')
      const systemPrefix = s.systemPrefix ?? ''
      const autoTitle = (s.autoTitle ?? '1') === '1'
      const titleLanguage = s.titleLanguage ?? 'auto'
      const bgImage = await window.electronAPI.background.get()
      setLang(lang)
      applyTheme(theme, bgImage !== null)
      applyFontScale(fontScale)
      applyLangDir(lang)
      let seenHints: string[] = []
      try { seenHints = JSON.parse(s.seen_hints || '[]') } catch (e) { log.warn('parse seen_hints failed:', e) }
      set({ language: lang, theme, fallbackTimeout: timeout, fontScale, bubbleWidth, defaultEffort, maxTokens, temperature, topP, systemPrefix, autoTitle, titleLanguage, backgroundImage: bgImage, backgroundOpacity: bgOpacity, backgroundBlur: bgBlur, effortLevel: defaultEffort, seenHints })
    } catch (e) { log.warn('loadSettings failed:', e) }
  },
  setLanguage: async (lang) => {
    await window.electronAPI.settings.set('language', lang)
    setLang(lang)
    applyLangDir(lang)
    set({ language: lang })
  },
  setTheme: async (theme) => {
    await window.electronAPI.settings.set('theme', theme)
    if (_autoThemeCleanup) { _autoThemeCleanup(); _autoThemeCleanup = null }
    applyTheme(theme, get().backgroundImage !== null, (fn) => { _autoThemeCleanup = fn })
    set({ theme })
  },
  setFallbackTimeout: async (ms) => {
    await window.electronAPI.settings.set('fallback_timeout_ms', String(ms))
    set({ fallbackTimeout: ms })
  },
  setFontScale: async (v) => {
    await window.electronAPI.settings.set('fontScale', String(v))
    applyFontScale(v)
    set({ fontScale: v })
  },
  setBubbleWidth: async (v) => {
    await window.electronAPI.settings.set('bubbleWidth', String(v))
    set({ bubbleWidth: v })
  },
  setDefaultEffort: async (v) => {
    await window.electronAPI.settings.set('defaultEffort', v)
    set({ defaultEffort: v, effortLevel: v })
  },
  // Settings — simple numeric/string setters generated from a config map.
  setMaxTokens:   async (v) => setSetting('maxTokens', String(v), { maxTokens: v }),
  setTemperature: async (v) => setSetting('temperature', String(v), { temperature: v }),
  setTopP:        async (v) => setSetting('topP', String(v), { topP: v }),
  setSystemPrefix:async (v) => setSetting('systemPrefix', v, { systemPrefix: v }),
  setTitleLanguage:async (v) => setSetting('titleLanguage', v, { titleLanguage: v }),
  setBackgroundOpacity: async (v) => setSetting('backgroundOpacity', String(v), { backgroundOpacity: v }),
  setBackgroundBlur: async (v) => setSetting('backgroundBlur', String(v), { backgroundBlur: v }),
  // Special-case setters that need extra logic.
  setAutoTitle: async (v) => { await window.electronAPI.settings.set('autoTitle', v ? '1' : '0'); set({ autoTitle: v }) },
  setBackgroundImage: async (dataUrl) => {
    await window.electronAPI.background.set(dataUrl)
    applyTheme(get().theme, dataUrl !== null)
    set({ backgroundImage: dataUrl })
  },

  // UI
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  pinSession: async (id: number, pinned: number = 1) => {
    try { await window.electronAPI.session.pin(id, pinned) } catch {}
    await get().loadSessions()
  },
  notifyComplete: (sessionId: number, sessionTitle: string) => {
    const id = Date.now() + Math.random()
    set((s) => ({ completionToasts: [...s.completionToasts, { id, sessionId, sessionTitle }] }))
    setTimeout(() => set((s) => ({ completionToasts: s.completionToasts.filter(t => t.id !== id) })), 3000)
  },
  dismissToast: (id: number) => set((s) => ({ completionToasts: s.completionToasts.filter(t => t.id !== id) })),
}))

// Streaming chunk listener
// Registered once globally; routes each chunk to its owning session so multiple
// sessions can stream concurrently. The main process pushes one delta per token
// (~20-50/sec) — each setState fan-out used to trigger O(subs) React reconciler
// work per delta. We now batch deltas into a rAF frame so the renderer fires
// at most 60Hz regardless of token rate.
// ───────────────────────────────────────────────────────────────────────────
// Session back/forward nav guard: set true during goBack/goForward so
// selectSession doesn't push a duplicate entry into history.
// Auto-theme listener cleanup: torn down when switching away from 'auto'.
let _navigating = false
let chunkListenerInstalled = false
let _toolCallListenerInstalled = false
let _streamRaf = 0
let _pendingDeltas: Record<number, string> = {}
let _autoThemeCleanup: (() => void) | null = null

function ensureToolCallListener() {
  if (_toolCallListenerInstalled) return
  _toolCallListenerInstalled = true
  window.electronAPI.chat.onToolCall(({ messageId, sessionId, tool }) => {
    const entry = { name: tool.name, args: tool.args, result: tool.result, error: tool.error, risk: tool.risk, latencyMs: tool.latencyMs }
    useStore.setState((s) => {
      const existing = s.toolCallsByMessage[messageId] || []
      // Append if new, replace if result changed (for live streaming)
      if (existing.length > 0 && existing[existing.length - 1].name === entry.name && entry.result == null && entry.error == null) {
        return { toolCallsByMessage: { ...s.toolCallsByMessage, [messageId]: [...existing.slice(0, -1), entry] } }
      }
      return { toolCallsByMessage: { ...s.toolCallsByMessage, [messageId]: [...existing, entry] } }
    })
  })
}

function flushStreamUpdates() {
  const deltas = _pendingDeltas
  _pendingDeltas = {}
  if (Object.keys(deltas).length === 0) return
  useStore.setState((s) => {
    const next = { ...s.streamingBySession }
    for (const [sid, delta] of Object.entries(deltas)) {
      const n = Number(sid)
      const buf = next[n]
      if (buf) next[n] = { ...buf, content: buf.content + delta }
    }
    return { streamingBySession: next }
  })
}

function ensureChunkListener() {
  if (chunkListenerInstalled) return
  chunkListenerInstalled = true
  window.electronAPI.chat.onChunk(({ messageId, delta, done, sessionId }) => {
    if (!sessionId) return
    const state = useStore.getState()
    const buf = state.streamingBySession[sessionId]
    // Lazy-init: first chunk creates the buffer with the real messageId so the
    // StreamingBubble can render and track updates from this point forward.
    if (!buf && !done) {
      useStore.setState((s) => ({
        streamingBySession: { ...s.streamingBySession, [sessionId]: { content: delta, messageId } },
      }))
      return
    }
    if (done) {
      if (_streamRaf) { cancelAnimationFrame(_streamRaf); _streamRaf = 0 }
      _pendingDeltas = {}
      useStore.setState((s) => {
        const next = { ...s.streamingBySession }
        delete next[sessionId]
        const cur = s.currentSessionId
        const sending = !!(cur && next[cur])
        return { streamingBySession: next, sending }
      })
      const currentNow = useStore.getState().currentSessionId
      if (currentNow === sessionId) {
        window.electronAPI.message.list(sessionId).then(msgs => {
          if (useStore.getState().currentSessionId === sessionId) {
            useStore.setState({ messages: msgs })
          }
        }).catch(() => {})
      }
      get().pinSession(sessionId, 0).then(() => {
        const s = useStore.getState().sessions.find(x => x.id === sessionId)
        const title = s?.title || 'Chat'
        get().notifyComplete(sessionId, title)
      }).catch(() => {})
      useStore.getState().loadSessions()
      const st = useStore.getState()
      if (st.queuedMessages.length > 0 && Object.keys(st.streamingBySession).length === 0) {
        const q = st.queuedMessages[0]
        useStore.setState((s) => ({ queuedMessages: s.queuedMessages.slice(1) }))
        setTimeout(() => useStore.getState().sendMessage(q.content), 50)
      }
    } else {
      _pendingDeltas[sessionId] = (_pendingDeltas[sessionId] || '') + delta
      if (!_streamRaf) {
        _streamRaf = requestAnimationFrame(() => { _streamRaf = 0; flushStreamUpdates() })
      }
    }
  })
}
