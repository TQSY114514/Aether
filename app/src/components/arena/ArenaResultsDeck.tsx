import { useState, useEffect, useMemo } from 'react'
import { Star, Check, Wrench, Loader2, FileText, AlertTriangle, Swords } from 'lucide-react'
import { arenaRoundToMarkdown, downloadText } from '@/utils/arenaExport'
import { t } from '@/utils/i18n'
import { useUI } from '@/components/ui/feedback'

export interface ArenaResultItem {
  model_id: number
  model_name: string
  provider_name: string
  content: string
  variant?: string | null
  latency_ms?: number
  usage?: { total_tokens: number; cost: number }
}

export interface ArenaResultsDeckProps {
  results: ArenaResultItem[]
  voted: boolean
  winnerId: number | null
  onVote: (winner: { model_id: number; model_name: string }, losers: { model_id: number; model_name: string }[]) => Promise<void>
  renderMarkdown: (md: string) => string
  prompt: string
  sessionId?: number | null
}

export default function ArenaResultsDeck({
  results,
  voted,
  winnerId,
  onVote,
  renderMarkdown,
  prompt,
  sessionId,
}: ArenaResultsDeckProps) {
  const { toast } = useUI()
  const [revealed, setRevealed] = useState(new Set<string>())
  const [done, setDone] = useState(false)
  const [applying, setApplying] = useState<Record<string, boolean>>({})
  const [applied, setApplied] = useState<Record<string, string[]>>({})
  const [applyError, setApplyError] = useState<Record<string, string>>({})

  // Round summary: fastest and cheapest models
  const withLatency = useMemo(() => results.filter((r) => r.latency_ms != null), [results])
  const withCost = useMemo(() => results.filter((r) => r.usage?.cost != null && r.usage.cost > 0), [results])
  const fastest = useMemo(() => (withLatency.length >= 2 ? withLatency.reduce((a, b) => (a.latency_ms! < b.latency_ms! ? a : b)) : null), [withLatency])
  const cheapest = useMemo(() => (withCost.length >= 2 ? withCost.reduce((a, b) => (a.usage!.cost < b.usage!.cost ? a : b)) : null), [withCost])

  useEffect(() => {
    setRevealed(new Set())
    setDone(false)
  }, [results.length])

  useEffect(() => {
    if (results.length === 0 || done) return

    const modelIds = results.map(r => `${r.model_id}::${r.variant || 'default'}`)
    const toReveal = modelIds.filter(id => !revealed.has(id))
    if (toReveal.length === 0) {
      setDone(true)
      return
    }

    let idx = 0
    const interval = setInterval(() => {
      if (idx >= toReveal.length) {
        clearInterval(interval)
        setDone(true)
        return
      }
      setRevealed(prev => new Set([...prev, toReveal[idx]]))
      idx++
    }, 200)

    return () => clearInterval(interval)
  }, [results.length, revealed, done])

  const handleApplyPatch = async (key: string, content: string, modelName: string) => {
    setApplying(prev => ({ ...prev, [key]: true }))
    setApplyError(prev => ({ ...prev, [key]: '' }))
    try {
      const res = await window.electronAPI.arena.applyPatch({
        sessionId: sessionId ?? null,
        content,
      })
      if (!res.ok) {
        const errMsg = res.conflicts?.join('; ') || res.error || t('chat.arena.patch_failed', '未检测到可应用的修改')
        setApplyError(prev => ({ ...prev, [key]: errMsg }))
        toast(errMsg, { type: 'error' })
      } else {
        const files = res.filesModified || []
        setApplied(prev => ({ ...prev, [key]: files }))
        toast(t('chat.arena.patch_applied', files.join(', ') || modelName), { type: 'success' })
      }
    } catch (err: any) {
      const msg = err?.message || 'Apply error'
      setApplyError(prev => ({ ...prev, [key]: msg }))
      toast(msg, { type: 'error' })
    } finally {
      setApplying(prev => ({ ...prev, [key]: false }))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
          <Swords size={14} className="text-[var(--accent)]" />
          <span>{t('chat.arena.result')}</span>
        </div>
        {results.length > 0 && (
          <button
            onClick={() => {
              try {
                const md = arenaRoundToMarkdown(prompt, results)
                downloadText(`aether-arena-${Date.now()}.md`, md, 'text/markdown')
              } catch {}
            }}
            className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-1"
          >
            <FileText size={11} /> {t('chat.arena.export_report', '导出报告')}
          </button>
        )}
      </div>

      {(fastest || cheapest) && (
        <div className="flex items-center flex-wrap gap-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] bg-[var(--content-bg)] text-[var(--text-secondary)]">
          {fastest && (
            <span>
              最快 <span className="font-medium text-[var(--text-primary)]">{fastest.model_name}</span> · {fastest.latency_ms}ms
            </span>
          )}
          {cheapest && (
            <span>
              最便宜 <span className="font-medium text-[var(--text-primary)]">{cheapest.model_name}</span> · ${cheapest.usage!.cost.toFixed(4)}
            </span>
          )}
        </div>
      )}

      {results.map((r) => {
        const key = `${r.model_id}::${r.variant || 'default'}`
        const isRevealed = revealed.has(key)
        const isWinner = voted && r.model_id === winnerId
        const isLoser = voted && r.model_id !== winnerId
        const hasPatch = /(?:^|\n)--- (?:a\/)?|<<<<<<< SEARCH\b/m.test(r.content)
        const isApplying = !!applying[key]
        const appliedFiles = applied[key]
        const err = applyError[key]

        return (
          <div
            key={key}
            className="border rounded-lg overflow-hidden animate-blur-fade transition-all duration-200"
            style={{
              borderColor: isWinner ? 'var(--success)' : isLoser ? 'var(--border)' : 'var(--border)',
              opacity: isLoser ? 0.6 : isRevealed ? 1 : 0,
              backgroundColor: isLoser ? 'var(--bg-secondary)' : undefined,
            }}
          >
            <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between text-sm font-medium">
              <span style={{ color: isWinner ? 'var(--success)' : isLoser ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {r.model_name}
                {r.variant ? <span className="text-[10px] ml-1.5 font-normal text-[var(--text-muted)]">{r.variant}</span> : null}
              </span>
              <span className="text-[10px] flex items-center gap-1.5 shrink-0 text-[var(--text-muted)]">
                <span>{r.provider_name}</span>
                {r.latency_ms != null && <span className="tabular-nums">{r.latency_ms}ms</span>}
                {r.usage?.total_tokens != null && <span className="tabular-nums">{r.usage.total_tokens} tok</span>}
                {r.usage?.cost != null && r.usage.cost > 0 && <span className="tabular-nums">${r.usage.cost.toFixed(4)}</span>}
              </span>
            </div>

            <div className="p-3 text-sm leading-relaxed max-h-72 overflow-y-auto">
              <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content) }} />
            </div>

            <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!voted ? (
                  <button
                    onClick={() =>
                      onVote(
                        { model_id: r.model_id, model_name: r.model_name },
                        results.filter(x => x.model_id !== r.model_id).map(x => ({ model_id: x.model_id, model_name: x.model_name }))
                      )
                    }
                    disabled={!done}
                    title={done ? t('chat.arena.vote') : t('chat.arena.wait_all')}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Star size={12} /> {t('chat.arena.vote')}
                  </button>
                ) : isWinner ? (
                  <div className="text-xs flex items-center gap-1 text-[var(--success)] font-medium">
                    <Check size={12} /> {t('chat.arena.voted')}
                  </div>
                ) : null}

                {/* Apply Patch Action Button */}
                {hasPatch && (
                  <button
                    onClick={() => handleApplyPatch(key, r.content, r.model_name)}
                    disabled={isApplying}
                    title={t('chat.arena.apply_patch', '应用修改到工作区')}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--content-bg)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                  >
                    {isApplying ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : appliedFiles ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <Wrench size={12} />
                    )}
                    <span>
                      {isApplying
                        ? t('chat.arena.patch_applying', '正在应用...')
                        : appliedFiles
                        ? t('chat.arena.patch_applied', appliedFiles.join(', '))
                        : t('chat.arena.apply_patch', '应用到工作区')}
                    </span>
                  </button>
                )}
              </div>

              {err && (
                <div className="text-[11px] text-[var(--error)] flex items-center gap-1 max-w-[50%] truncate" title={err}>
                  <AlertTriangle size={11} className="shrink-0" />
                  <span className="truncate">{err}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
