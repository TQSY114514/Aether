export interface GhostCommandLike {
  id: string
  name?: string
  description?: string
  argOptions?: string[]
}

export interface ActiveReferenceSuggestion {
  prefix: '@' | '#' | '!'
  query: string
  replacement: string
  displayText: string
}

export interface SlashArgCandidate {
  commandId: string
  value: string
  prefix: string
}

export interface GhostCompletionInput {
  input: string
  cursorPos: number
  selectionEnd?: number
  isComposing?: boolean
  dismissed?: boolean
  slashCommands?: GhostCommandLike[]
  slashResults?: GhostCommandLike[]
  slashSelectedIndex?: number
  activeReference?: ActiveReferenceSuggestion | null
  recentUserPrompts?: string[]
}

export interface GhostCompletionResult {
  ghostSuffix: string
  source: 'none' | 'slash-cmd' | 'slash-arg' | 'reference' | 'history'
  slashArgCandidates: SlashArgCandidate[]
  activeSlashCommandId: string | null
}

const MAX_HISTORY_GHOST_CHARS = 140

/**
 * Extract deduplicated, most-recent-first single-line user prompts for history prefix matching.
 */
export function extractRecentUserPrompts(messages: Array<{ role?: string; content?: string | null }>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user' || !m.content) continue
    const trimmed = m.content.trim()
    if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('[File:') || trimmed.startsWith('[Snippet') || trimmed.startsWith('📎 ')) continue
    const firstLine = trimmed.split(/\r?\n/)[0].trim()
    if (!firstLine || firstLine.length < 4 || seen.has(firstLine)) continue
    seen.add(firstLine)
    out.push(firstLine)
    if (out.length >= 30) break
  }
  return out
}

/**
 * Parse discrete `/command [argPrefix]` state on the current line up to cursor.
 * Never falls back to filesystem completion for slash commands (prevents omp #4808).
 */
export function parseSlashArgumentContext(
  beforeCursor: string,
  slashCommands: GhostCommandLike[]
): { command: GhostCommandLike | null; argToken: string; candidates: SlashArgCandidate[] } {
  const lastLine = beforeCursor.split(/\r?\n/).pop() || ''
  const argMatch = /^\/([a-zA-Z0-9:_-]+)\s+([^\s]*)$/.exec(lastLine)
  if (!argMatch) {
    return { command: null, argToken: '', candidates: [] }
  }
  const cmdId = argMatch[1].toLowerCase()
  const argToken = argMatch[2]
  const cmd = slashCommands.find((c) => c.id.toLowerCase() === cmdId) || null
  if (!cmd || !Array.isArray(cmd.argOptions) || cmd.argOptions.length === 0) {
    return { command: cmd, argToken, candidates: [] }
  }
  const lowerArg = argToken.toLowerCase()
  const prefix = `/${cmd.id} `
  const matching = cmd.argOptions.filter((opt) => opt.toLowerCase().startsWith(lowerArg))
  return {
    command: cmd,
    argToken,
    candidates: matching.map((value) => ({ commandId: cmd.id, value, prefix })),
  }
}

/**
 * Compute inline gray ghost-text completion and discrete slash argument options.
 * Always slices against the live cursor token so async debounce races never produce
 * stale or inverted completions (prevents omp #4809).
 */
export function computeGhostCompletion(opts: GhostCompletionInput): GhostCompletionResult {
  const {
    input,
    cursorPos,
    selectionEnd = cursorPos,
    isComposing = false,
    dismissed = false,
    slashCommands = [],
    slashResults = [],
    slashSelectedIndex = 0,
    activeReference = null,
    recentUserPrompts = [],
  } = opts

  const beforeCursor = input.slice(0, Math.max(0, Math.min(cursorPos, input.length)))
  const lastLine = beforeCursor.split(/\r?\n/).pop() || ''
  const argCtx = parseSlashArgumentContext(beforeCursor, slashCommands)

  const cursorAtEnd = cursorPos === input.length && selectionEnd === input.length
  if (isComposing || dismissed || !cursorAtEnd) {
    return {
      ghostSuffix: '',
      source: 'none',
      slashArgCandidates: isComposing ? [] : argCtx.candidates,
      activeSlashCommandId: argCtx.command?.id ?? null,
    }
  }

  // 1. Slash command name completion (/comp -> act)
  const cmdNameMatch = /^\/([^\s]*)$/.exec(lastLine)
  if (cmdNameMatch) {
    const liveQuery = cmdNameMatch[1]
    const pool = slashResults.length > 0 ? slashResults : slashCommands
    const selected = pool[slashSelectedIndex] || pool[0]
    if (
      selected &&
      selected.id.toLowerCase().startsWith(liveQuery.toLowerCase()) &&
      selected.id.length > liveQuery.length
    ) {
      return {
        ghostSuffix: selected.id.slice(liveQuery.length),
        source: 'slash-cmd',
        slashArgCandidates: [],
        activeSlashCommandId: null,
      }
    }
    return {
      ghostSuffix: '',
      source: 'none',
      slashArgCandidates: [],
      activeSlashCommandId: null,
    }
  }

  // 2. Discrete slash argument completion (/mode p -> lan); strictly opt-in via argOptions
  if (lastLine.startsWith('/')) {
    if (argCtx.candidates.length > 0) {
      const idx = Math.max(0, Math.min(slashSelectedIndex, argCtx.candidates.length - 1))
      const picked = argCtx.candidates[idx] || argCtx.candidates[0]
      if (
        picked &&
        picked.value.toLowerCase().startsWith(argCtx.argToken.toLowerCase()) &&
        picked.value.length > argCtx.argToken.length
      ) {
        return {
          ghostSuffix: picked.value.slice(argCtx.argToken.length),
          source: 'slash-arg',
          slashArgCandidates: argCtx.candidates,
          activeSlashCommandId: argCtx.command?.id ?? null,
        }
      }
    }
    return {
      ghostSuffix: '',
      source: 'none',
      slashArgCandidates: argCtx.candidates,
      activeSlashCommandId: argCtx.command?.id ?? null,
    }
  }

  // 3. @ / # / ! reference suffix (live-token verified against debounced suggestion)
  if (activeReference) {
    const refMatch = /([@#!])([^\s]*)$/.exec(beforeCursor)
    if (refMatch && refMatch[1] === activeReference.prefix) {
      const liveToken = refMatch[2]
      const lowerLive = liveToken.toLowerCase()
      const candidate = activeReference.displayText.toLowerCase().startsWith(lowerLive)
        ? activeReference.displayText
        : activeReference.replacement.toLowerCase().startsWith(lowerLive)
          ? activeReference.replacement
          : ''
      if (candidate && candidate.length > liveToken.length) {
        return {
          ghostSuffix: candidate.slice(liveToken.length),
          source: 'reference',
          slashArgCandidates: [],
          activeSlashCommandId: null,
        }
      }
    }
  }

  // 4. Session user-history prefix ghost text (single-line, >= 2 chars, non-slash)
  const trimmedStart = input.trimStart()
  if (trimmedStart.length >= 2 && !trimmedStart.startsWith('/') && !input.includes('\n')) {
    const lowerInput = input.toLowerCase()
    for (const hist of recentUserPrompts) {
      if (!hist || hist.length <= input.length) continue
      const singleLine = hist.split(/\r?\n/)[0]
      if (singleLine.length <= input.length) continue
      if (singleLine.toLowerCase().startsWith(lowerInput)) {
        const suffix = singleLine.slice(input.length, input.length + MAX_HISTORY_GHOST_CHARS)
        if (suffix) {
          return {
            ghostSuffix: suffix,
            source: 'history',
            slashArgCandidates: [],
            activeSlashCommandId: null,
          }
        }
      }
    }
  }

  return {
    ghostSuffix: '',
    source: 'none',
    slashArgCandidates: [],
    activeSlashCommandId: null,
  }
}

/**
 * Determine whether an idle composer should request a Stage 2 next-prompt prediction.
 */
export function canRequestIdlePrediction(opts: {
  enabled: boolean
  input: string
  isStreaming: boolean
  isArenaRunning: boolean
  sessionId: number | null
  modelId: number | null
  messages: Array<{ id?: number; role?: string; status?: string; content?: string | null }>
}): { ok: boolean; anchorKey: string | null } {
  const { enabled, input, isStreaming, isArenaRunning, sessionId, modelId, messages } = opts
  if (!enabled || input !== '' || isStreaming || isArenaRunning || !sessionId || !modelId || messages.length === 0) {
    return { ok: false, anchorKey: null }
  }
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant' || last.status === 'error' || !String(last.content || '').trim()) {
    return { ok: false, anchorKey: null }
  }
  return { ok: true, anchorKey: `${sessionId}:${last.id ?? messages.length}` }
}

/**
 * Combine deterministic ghost suffix with Stage 2 idle prediction when composer is empty.
 */
export function resolveEffectiveGhostSuffix(opts: {
  input: string
  deterministicGhost: string
  idlePrediction: string
  isComposing: boolean
  dismissed: boolean
  cursorAtEnd: boolean
}): string {
  const { input, deterministicGhost, idlePrediction, isComposing, dismissed, cursorAtEnd } = opts
  if (isComposing || dismissed || !cursorAtEnd) return ''
  if (deterministicGhost) return deterministicGhost
  if (input === '' && idlePrediction) return idlePrediction
  return ''
}
