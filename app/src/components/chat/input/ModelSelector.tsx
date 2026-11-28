import { useMemo, useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search, X, Sparkles } from 'lucide-react'
import { t } from '@/utils/i18n'

export function formatSuggestionReason(modelSuggestion: ModelSuggestion | null): string {
  if (!modelSuggestion) return t('chat.model_switch')
  const rp = modelSuggestion.reasonParts
  if (!rp || rp.noMatch) return t('model.suggest.no_match')

  const lines: string[] = []
  const taskKey = rp.task ? `model.suggest.task.${rp.task}` : null
  lines.push(t('model.suggest.task', taskKey ? t(taskKey) : rp.taskLabel || ''))

  lines.push(t('model.suggest.heuristic', rp.heuristic ?? 0, rp.family || ''))

  if (rp.eloScore != null) {
    const elo = Number(rp.eloScore).toFixed(1)
    const sigmaStr = rp.eloSigma ? ` ±${rp.eloSigma}` : ''
    lines.push(rp.eloReliable
      ? t('model.suggest.elo', `${elo}${sigmaStr}`, rp.eloWins ?? 0, rp.eloTotal ?? 0)
      : t('model.suggest.elo_insufficient', `${elo}${sigmaStr}`))
  }

  if (rp.useTools) {
    lines.push(rp.reasonPickUsed ? t('model.suggest.reason_pick') : t('model.suggest.tools'))
  }

  if (rp.closeRace && rp.gap != null && rp.runnerUpName) {
    lines.push(t('model.suggest.close_race', rp.gap, rp.runnerUpName))
  }

  if (rp.secondary && rp.secondary.length) {
    const labels = rp.secondary
      .map(s => t(`model.suggest.task.${s.type}`))
      .filter(l => !l.startsWith('model.suggest.task.'))
    if (labels.length) lines.push(t('model.suggest.secondary', labels.join(', ')))
  }

  if (rp.confidence != null) lines.push(t('model.suggest.confidence', rp.confidence))

  return lines.join('\n')
}

export interface ModelSelectorProps {
  providers: { id: number; name: string }[]
  allModels: { id: number; provider_id: number; model_name: string; display_name?: string | null }[]
  activeModelId: number | null
  onSelect: (modelId: number, providerId: number) => void
  modelSuggestion: ModelSuggestion | null
  scoreByModel: Record<number, number>
  currentPrompt?: string
}

export default function ModelSelector({
  providers,
  allModels,
  activeModelId,
  onSelect,
  modelSuggestion,
  scoreByModel,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    return ms.length ? { providerId: p.id, providerName: p.name, models: ms } : null
  }).filter(Boolean) as { providerId: number; providerName: string; models: typeof allModels }[], [providers, allModels])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map(g => {
        const providerMatches = g.providerName.toLowerCase().includes(q)
        const models = providerMatches
          ? g.models
          : g.models.filter(m => (m.display_name || m.model_name).toLowerCase().includes(q) || m.model_name.toLowerCase().includes(q))
        return models.length ? { ...g, models } : null
      })
      .filter(Boolean) as typeof groups
  }, [groups, query])

  const flatFilteredModels = useMemo(
    () => filteredGroups.flatMap(g => g.models),
    [filteredGroups]
  )

  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const activeIndex = allModels.findIndex(m => m.id === activeModelId)
    setHighlightIdx(activeIndex >= 0 ? activeIndex : 0)
    const timer = setTimeout(() => inputRef.current?.focus(), 10)
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [open, activeModelId, allModels])

  if (groups.length === 0) return null

  const activeModel = allModels.find(m => m.id === activeModelId) || null
  const activeLabel = activeModel
    ? (activeModel.display_name || activeModel.model_name)
    : t('chat.select_model')

  const reasonTitle = formatSuggestionReason(modelSuggestion)
  const arenaElo = modelSuggestion?.reasonParts?.arenaElo ?? (
    modelSuggestion?.reasonParts?.eloTotal &&
    modelSuggestion?.reasonParts?.eloTotal > 0 &&
    modelSuggestion?.reasonParts?.eloScore
      ? Math.round(modelSuggestion.reasonParts.eloScore)
      : null
  )
  const suggestedModelId = modelSuggestion?.suggestedModelId ?? null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (flatFilteredModels.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(prev => (prev + 1) % flatFilteredModels.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(prev => (prev - 1 + flatFilteredModels.length) % flatFilteredModels.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = flatFilteredModels[highlightIdx] || flatFilteredModels[0]
      if (picked) {
        onSelect(picked.id, picked.provider_id)
        setOpen(false)
      }
    }
  }

  let runningFlatIdx = -1

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        title={arenaElo != null ? `${reasonTitle}${reasonTitle ? '\n' : ''}Arena ELO ${arenaElo}` : reasonTitle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="h-6.5 flex items-center gap-1.5 text-[11px] font-medium rounded-[6px] border border-transparent hover:border-[var(--border)] px-2 outline-none max-w-[160px] sm:max-w-[215px] bg-transparent hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
        style={{
          color: open ? 'var(--text-primary)' : 'var(--text-secondary)',
          backgroundColor: open ? 'var(--bg-secondary)' : undefined,
          borderColor: open ? 'var(--border)' : undefined,
        }}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown
          size={11}
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          onKeyDown={handleKeyDown}
          className="absolute bottom-full left-0 mb-1.5 w-64 sm:w-72 rounded-xl border shadow-xl z-50 flex flex-col overflow-hidden animate-spring-up"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: '0 16px 36px -8px rgba(0, 0, 0, 0.28)',
          }}
        >
          {/* Instant Filter Search Bar */}
          <div
            className="flex items-center gap-2 px-2.5 py-2 border-b"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <Search size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('chat.search_model', '搜索模型或服务商…')}
              className="flex-1 bg-transparent outline-none text-[11.5px] placeholder:text-[var(--text-muted)]"
              style={{ color: 'var(--text-primary)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="p-0.5 rounded hover:bg-[var(--border)] cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Grouped Models List */}
          <div ref={listRef} className="max-h-64 overflow-y-auto p-1.5 space-y-1.5">
            {filteredGroups.length === 0 ? (
              <div className="py-6 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('common.no_results', '无匹配模型')}
              </div>
            ) : (
              filteredGroups.map((g) => (
                <div key={g.providerId} className="space-y-0.5">
                  <div
                    className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase select-none truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {g.providerName}
                  </div>
                  {g.models.map((m) => {
                    runningFlatIdx += 1
                    const flatIdx = runningFlatIdx
                    const isSelected = m.id === activeModelId
                    const isHighlighted = flatIdx === highlightIdx
                    const isSuggested = suggestedModelId === m.id
                    const score = scoreByModel[m.id]

                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setHighlightIdx(flatIdx)}
                        onClick={() => {
                          onSelect(m.id, m.provider_id)
                          setOpen(false)
                        }}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-[11.5px] transition-colors cursor-pointer"
                        style={{
                          backgroundColor: isHighlighted
                            ? 'var(--bg-secondary)'
                            : isSelected
                            ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                            : 'transparent',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        }}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className={`truncate ${isSelected ? 'font-semibold' : 'font-normal'}`}>
                            {m.display_name || m.model_name}
                          </span>
                          {isSuggested && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-mono shrink-0"
                              style={{
                                backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                                color: 'var(--accent)',
                              }}
                              title={reasonTitle}
                            >
                              <Sparkles size={8.5} />
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {score != null && score > 0 && (
                            <span
                              className="text-[10px] font-mono tabular-nums px-1 py-0.2 rounded"
                              style={{
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {score}
                            </span>
                          )}
                          {isSelected && <Check size={12} className="shrink-0" style={{ color: 'var(--accent)' }} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
