import { create } from 'zustand'
import type { Provider, Model, Persona, Session, Message, ViewType, ArenaResult, ModelScore } from '@/types'
import { setLang, detectLang, t, type LangCode, LANGS } from '@/utils/i18n'
import { getLangDir } from '@/utils/i18n'

// Set <html dir> for RTL languages (Arabic).
function applyLangDir(code: LangCode) {
  document.documentElement.dir = getLangDir(code)
}
const LANGS_CODES = LANGS.map(l => l.code)
import { applyTheme } from '@/utils/theme'

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
  toolCallsByMessage: Record<number, { name: string; args: unknown; result: string | null; error: string | null }[]>
  // Per-message agent plan steps (the assistant's reasoning each round).
  planStepsByMessage: Record<number, { step: number; depth: number; assistantText: string }[]>
  // Whether the current session should send tools with the request, and the
  // permission mode: 'ask' (confirm dangerous tools) | 'auto' (run all) |
  // 'plan' (safe tools only, read-only). 'off' = no tools at all.
  agentMode: 'off' | 'ask' | 'auto' | 'plan'
  setAgentMode: (v: 'off' | 'ask' | 'auto' | 'plan') => void
  // Pending permission requests awaiting a user decision (rendered as a dialog).
  permissionRequests: { reqId: string; messageId: number; sessionId: number; name: string; args: unknown; risk: 'safe' | 'dangerous' }[]
  resolvePermission: (reqId: string, allowed: boolean) => void
  // Thinking/reasoning effort level sent to the model (real param: reasoning_effort
  // for OpenAI o-series, thinking.budget_tokens for Claude). 'off' = no param.
  effortLevel: 'off' | 'low' | 'medium' | 'high'
  setEffortLevel: (v: 'off' | 'low' | 'medium' | 'high') => void
  stopGeneration: () => Promise<void>
  regenerate: () => Promise<void>
  sendMessage: (content: string, attachments?: { name: string; mime: string; kind: 'text' | 'image'; dataUrl?: string; preview?: string }[]) => Promise<void>
  loadMessages: (sessionId: number) => Promise<void>

  // Arena
  arenaResults: ArenaResult[]
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

function guessDefaultModel(allModels: Model[], configs: Record<number, SessionConfig>): { providerId: number | null; modelId: number | null } {
  // Find a model id that appears in at least one existing session config
  for (const c of Object.values(configs)) {
    if (c.modelId && c.providerId) return { providerId: c.providerId, modelId: c.modelId }
  }
  // Fall back to primary model
  const primary = allModels.find(m => m.is_primary)
  if (primary) return { providerId: primary.provider_id, modelId: primary.id }
  // Fall back to first model
  const first = allModels[0]
  if (first) return { providerId: first.provider_id, modelId: first.id }
  return { providerId: null, modelId: null }
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
  agentMode: 'off',
  permissionRequests: [],
  effortLevel: 'off',

  loadSessions: async () => {
    const sessions = await window.electronAPI.session.list()
    set({ sessions })
  },
  createSession: async () => {
    const result = await window.electronAPI.session.create({})
    const sid = result.lastInsertRowid as number
    // Pre-seed a default model config so selectSession doesn't have to rebuild it.
    let providerId = null, modelId = null
    const allModels = get().allModels
    if (allModels.length > 0) {
      const primary = allModels.find(m => m.is_primary) || allModels[0]
      providerId = primary.provider_id; modelId = primary.id
    }
    if (!modelId) {
      try {
        const primary = await window.electronAPI.model.primary()
        if (primary) { providerId = primary.provider_id; modelId = primary.id }
      } catch {}
    }
    if (!modelId) {
      try {
        const all = await window.electronAPI.model.listAll()
        if (all.length > 0) { providerId = all[0].provider_id; modelId = all[0].id }
      } catch {}
    }
    const cfg: SessionConfig = { providerId, modelId, personaId: null }
    await window.electronAPI.session.setConfig(sid, cfg)
    set((s) => ({ sessionConfigs: { ...s.sessionConfigs, [sid]: cfg } }))
    // Navigate to chat view immediately (feels instant), then select via the same
    // code path the sidebar uses — that path is verified to highlight correctly.
    set({ currentView: 'chat' })
    if (providerId) get().loadModels(providerId)
    await get().loadSessions()
    await get().selectSession(sid)
  },
  selectSession: async (id) => {
    // Pre-load messages from DB before switching (never shows empty state)
    let msgs: Message[] = []
    try { msgs = await window.electronAPI.message.list(id) } catch (e) { console.error('[AetherAI] preload', e) }
    set({ currentSessionId: id, messages: msgs, arenaResults: [] })
    window.electronAPI.session.touch(id).catch(() => {})
    // Load per-session config from DB, then set currentSessionId
    try {
      let cfg = await window.electronAPI.session.getConfig(id)
      if (!cfg || !cfg.modelId) {
        // Missing or incomplete config — rebuild from allModels
        let providerId = null, modelId = null
        const allModels = get().allModels
        if (allModels.length > 0) {
          const primary = allModels.find(m => m.is_primary) || allModels[0]
          providerId = primary.provider_id; modelId = primary.id
        }
        cfg = { providerId, modelId, personaId: null }
        await window.electronAPI.session.setConfig(id, cfg)
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
    if (currentSessionId === id) {
      set({ currentSessionId: null, messages: [] })
    }
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
    await get().loadProviders()
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
    const { allModels } = get()
    const target = allModels.find(m => m.id === id)
    await window.electronAPI.model.delete(id)
    await get().loadAllModels()
    if (target) await get().loadModels(target.provider_id)
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
    const { currentSessionId, chatMode, allModels } = get()
    const cfg = currentSessionId ? get().sessionConfigs[currentSessionId] : null
    let modelId = cfg?.modelId
    // Auto-resolve missing model: try allModels (already loaded globally)
    if (!modelId && allModels.length > 0) {
      const primary = allModels.find(m => m.is_primary) || allModels[0]
      modelId = primary.id
      if (currentSessionId) {
        const newCfg = { providerId: primary.provider_id, modelId: primary.id, personaId: cfg?.personaId || null }
        await window.electronAPI.session.setConfig(currentSessionId, newCfg)
        set((s) => ({ sessionConfigs: { ...s.sessionConfigs, [currentSessionId]: newCfg } }))
        get().loadModels(primary.provider_id)
      }
    }
    if (!currentSessionId || !modelId) {
      console.warn('sendMessage: no session or model configured')
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
        useTools: get().agentMode !== 'off',
        agentMode: get().agentMode === 'off' ? 'ask' : get().agentMode,
        effortLevel: get().effortLevel,
        genParams: { maxTokens: get().maxTokens, temperature: get().temperature, topP: get().topP },
        systemPrefix: get().systemPrefix,
        })
    } catch (err) {
      // Drop this session's streaming buffer on error; keep other sessions intact.
      set((s) => {
        const next = { ...s.streamingBySession }
        delete next[currentSessionId]
        return { streamingBySession: next, sending: get().currentSessionId !== currentSessionId ? s.sending : false }
      })
      console.error('chat error', err)
    }
  },

  setAgentMode: (v) => set({ agentMode: v }),
  resolvePermission: (reqId, allowed) => {
    window.electronAPI.chat.replyPermission({ reqId, allowed })
    set((s) => ({ permissionRequests: s.permissionRequests.filter((r) => r.reqId !== reqId) }))
  },
  setEffortLevel: (v) => set({ effortLevel: v }),
  stopGeneration: async () => {
    await window.electronAPI.chat.stop()
    // Clear streaming buffers for all sessions; nothing is sending anymore.
    set({ streamingBySession: {}, sending: false })
  },

  regenerate: async () => {
    const { currentSessionId, messages } = get()
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
      await window.electronAPI.chat.send({ sessionId: currentSessionId, content: messages[userIdx].content, modelId: activeModelId, regenerate: true, personaId: null })
    } catch (err) {
      set((s) => {
        const next = { ...s.streamingBySession }
        delete next[currentSessionId]
        return { streamingBySession: next, sending: get().currentSessionId !== currentSessionId ? s.sending : false }
      })
      console.error('regenerate error:', err)
    }
  },

  loadMessages: async (sessionId) => {
    try {
      const messages = await window.electronAPI.message.list(sessionId)
      set({ messages })
    } catch (err) {
      console.error('[AetherAI] loadMessages error:', err)
    }
  },

  // Arena
  arenaResults: [],
  arenaModelIds: [],
  arenaError: null,
  setArenaModelIds: (ids) => set({ arenaModelIds: ids }),

  runArena: async (content) => {
    const { currentSessionId, arenaModelIds } = get()
    if (!currentSessionId || arenaModelIds.length < 2) {
      set({ arenaError: '请先选择至少 2 个模型' }); return
    }
    set({ sending: true, arenaResults: [], arenaError: null })
    try {
      const { results } = await window.electronAPI.arena.send({ sessionId: currentSessionId, content, modelIds: arenaModelIds })
      if (!results || results.length === 0) {
        set({ sending: false, arenaError: '没有返回结果，请检查模型/网络' })
        return
      }
      set({ arenaResults: results, sending: false, arenaError: null })
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

  loadSettings: async () => {
    try {
      const s = await window.electronAPI.settings.getAll()
      // Resolve language: saved pref > system detection > en.
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
      set({ language: lang, theme, fallbackTimeout: timeout, fontScale, bubbleWidth, defaultEffort, maxTokens, temperature, topP, systemPrefix, autoTitle, titleLanguage, backgroundImage: bgImage, backgroundOpacity: bgOpacity, backgroundBlur: bgBlur, effortLevel: defaultEffort })
    } catch {}
  },
  setLanguage: async (lang) => {
    await window.electronAPI.settings.set('language', lang)
    setLang(lang)
    applyLangDir(lang)
    set({ language: lang })
  },
  setTheme: async (theme) => {
    await window.electronAPI.settings.set('theme', theme)
    applyTheme(theme, get().backgroundImage !== null)
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
  setMaxTokens: async (v) => { await window.electronAPI.settings.set('maxTokens', String(v)); set({ maxTokens: v }) },
  setTemperature: async (v) => { await window.electronAPI.settings.set('temperature', String(v)); set({ temperature: v }) },
  setTopP: async (v) => { await window.electronAPI.settings.set('topP', String(v)); set({ topP: v }) },
  setSystemPrefix: async (v) => { await window.electronAPI.settings.set('systemPrefix', v); set({ systemPrefix: v }) },
  setAutoTitle: async (v) => { await window.electronAPI.settings.set('autoTitle', v ? '1' : '0'); set({ autoTitle: v }) },
  setTitleLanguage: async (v) => { await window.electronAPI.settings.set('titleLanguage', v); set({ titleLanguage: v }) },
  setBackgroundImage: async (dataUrl) => {
    await window.electronAPI.background.set(dataUrl)
    applyTheme(get().theme, dataUrl !== null)
    set({ backgroundImage: dataUrl })
  },
  setBackgroundOpacity: async (v) => {
    await window.electronAPI.settings.set('backgroundOpacity', String(v))
    set({ backgroundOpacity: v })
  },
  setBackgroundBlur: async (v) => {
    await window.electronAPI.settings.set('backgroundBlur', String(v))
    set({ backgroundBlur: v })
  },

  // UI
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))

// ── Streaming chunk listener ───────────────────────────────────────────────
// Registered once globally; routes each chunk to its owning session so multiple
// sessions can stream concurrently without the listener being torn down when a
// new send starts. `done` finalizes the assistant message for that session.
let chunkListenerInstalled = false
function ensureChunkListener() {
  if (chunkListenerInstalled) return
  chunkListenerInstalled = true
  window.electronAPI.chat.onChunk(({ messageId, delta, done, sessionId }) => {
    if (!sessionId) return
    const state = useStore.getState()
    const buf = state.streamingBySession[sessionId]
    // Ignore chunks for sessions we're not actively streaming (e.g. stale/aborted).
    if (!buf && !done) return
    if (done) {
      // Finalize: append the streamed content as an assistant message for the
      // session it belongs to. If that's the current session, append to `messages`
      // in-memory; otherwise the message is already in DB and will load on reselect.
      const finalContent = buf?.content ?? ''
      const isCurrent = state.currentSessionId === sessionId
      useStore.setState((s) => {
        const next = { ...s.streamingBySession }
        delete next[sessionId]
        const cur = s.currentSessionId
        // `sending` reflects whether the currently-viewed session is still streaming.
        const sending = !!(cur && next[cur])
        const patch: Partial<AppState> = { streamingBySession: next, sending }
        if (isCurrent) {
          const newMsg: Message = {
            id: messageId || Date.now() + 1,
            session_id: sessionId,
            role: 'assistant',
            content: finalContent,
            model_used: null, provider_used: null,
            token_count: null, latency_ms: null,
            status: 'success', error_message: null,
            created_at: new Date().toISOString(),
          }
          patch.messages = [...s.messages, newMsg]
        }
        return patch
      })
      useStore.getState().loadSessions()
    } else {
      // Accumulate delta into this session's buffer.
      useStore.setState((s) => ({
        streamingBySession: {
          ...s.streamingBySession,
          [sessionId]: { content: (buf?.content || '') + delta, messageId },
        },
      }))
    }
  })
}

// Tool-call events arrive for a specific assistant message; accumulate them so
// the UI can render a tool-call block under that message. Registered once.
let toolListenerInstalled = false
function ensureToolCallListener() {
  if (toolListenerInstalled) return
  toolListenerInstalled = true
  window.electronAPI.chat.onToolCall(({ messageId, tool }) => {
    if (!messageId || !tool) return
    useStore.setState((s) => {
      const prev = s.toolCallsByMessage[messageId] || []
      return { toolCallsByMessage: { ...s.toolCallsByMessage, [messageId]: [...prev, tool] } }
    })
  })
  // Dangerous-tool permission requests surface as a dialog in the renderer.
  window.electronAPI.chat.onPermissionRequest((req) => {
    useStore.setState((s) => ({ permissionRequests: [...s.permissionRequests, req] }))
  })
  // Agent plan steps (one per loop round) — live reasoning trace for the UI.
  window.electronAPI.chat.onPlanStep(({ messageId, step }) => {
    if (!messageId || !step) return
    useStore.setState((s) => {
      const prev = s.planStepsByMessage[messageId] || []
      return { planStepsByMessage: { ...s.planStepsByMessage, [messageId]: [...prev, step] } }
    })
  })
}
