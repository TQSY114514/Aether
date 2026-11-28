// ─────────────────────────────────────────────────────────────────────────────
// app/src/pages/ArenaPage.tsx
//
// Post-Digital Minimalist Arena Workbench:
// Side-by-Side Multi-Model Comparison & Personal Benchmark Replay.
// High-contrast industrial monochrome style, zero marketing fluff.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import { renderMarkdown } from '@/utils/markdown'
import { normalizeArenaCompareResponse, toArenaSlotState, type ArenaSlotState } from '@/utils/arenaExport'
import { t } from '@/utils/i18n'
import {
  FlaskConical,
  Trophy,
  Play,
  Check,
  Copy,
  Clock,
  ArrowRight,
  Square,
  AlertTriangle,
} from 'lucide-react'

interface ModelScoreItem {
  model_id: number
  model_name: string
  provider_name?: string
  score: number
  battles?: number
  wins?: number
}

interface BenchmarkTemplate {
  id: string
  name: string
  category: string
  prompt: string
  description?: string
}

export default function ArenaPage() {
  const [activeTab, setActiveTab] = useState<'compare' | 'benchmark'>('compare')
  const allModels = useStore((s) => s.allModels)
  const loadAllModels = useStore((s) => s.loadAllModels)
  const loadScores = useStore((s) => s.loadScores)
  const scores = useStore((s) => s.scores)

  // Arena models selection
  const [modelAId, setModelAId] = useState<number | null>(null)
  const [modelBId, setModelBId] = useState<number | null>(null)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<{
    a: ArenaSlotState
    b: ArenaSlotState
  } | null>(null)
  const [votedWinner, setVotedWinner] = useState<'a' | 'b' | 'tie' | 'bad' | null>(null)
  const [copiedSlot, setCopiedSlot] = useState<'a' | 'b' | null>(null)
  const activeRunIdRef = useRef<number | null>(null)

  // Benchmarks list
  const [templates, setTemplates] = useState<BenchmarkTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  useEffect(() => {
    loadAllModels()
    loadScores()
    return () => {
      if (activeRunIdRef.current != null) {
        window.electronAPI.arena.stop(activeRunIdRef.current).catch(() => {})
        activeRunIdRef.current = null
      }
    }
  }, [loadAllModels, loadScores])

  // Default models selection
  useEffect(() => {
    if (allModels.length >= 2 && !modelAId && !modelBId) {
      setModelAId(allModels[0].id)
      setModelBId(allModels[1].id)
    } else if (allModels.length === 1 && !modelAId && !modelBId) {
      setModelAId(allModels[0].id)
      setModelBId(allModels[0].id)
    }
  }, [allModels, modelAId, modelBId])

  // Load benchmark templates
  useEffect(() => {
    if (activeTab === 'benchmark') {
      setLoadingTemplates(true)
      window.electronAPI.arena.benchmarkTemplates?.()
        .then((tpls: any) => {
          if (Array.isArray(tpls)) setTemplates(tpls)
        })
        .catch(() => setTemplates([]))
        .finally(() => setLoadingTemplates(false))
    }
  }, [activeTab])

  const modelA = useMemo(() => allModels.find((m) => m.id === modelAId) || null, [allModels, modelAId])
  const modelB = useMemo(() => allModels.find((m) => m.id === modelBId) || null, [allModels, modelBId])

  const handleStopCompare = useCallback(async () => {
    const runId = activeRunIdRef.current
    if (runId == null) return
    try {
      await window.electronAPI.arena.stop(runId)
    } catch {}
  }, [])

  const handleRunCompare = useCallback(async () => {
    if (!prompt.trim() || !modelAId || !modelBId || running) return
    const runId = -Date.now()
    activeRunIdRef.current = runId
    setRunning(true)
    setVotedWinner(null)
    setResults({
      a: { content: '', done: false },
      b: { content: '', done: false },
    })

    const startA = Date.now()
    const startB = Date.now()
    const unsubModelDone = window.electronAPI.arena.onModelDone?.((payload) => {
      if (payload?.sessionId !== runId || activeRunIdRef.current !== runId) return
      const r = payload.result
      if (!r) return
      setResults((prev) => {
        if (!prev) return prev
        const nextSlot = toArenaSlotState(r)
        if (r.slot_index === 0) return { ...prev, a: nextSlot }
        if (r.slot_index === 1) return { ...prev, b: nextSlot }
        if (!prev.a.done && r.model_id === modelAId) return { ...prev, a: nextSlot }
        if (!prev.b.done && r.model_id === modelBId) return { ...prev, b: nextSlot }
        return prev
      })
    })

    try {
      const arenaRes = await window.electronAPI.arena.send({
        sessionId: runId,
        content: prompt.trim(),
        modelIds: [modelAId, modelBId],
      })
      if (activeRunIdRef.current !== runId) return
      setResults(normalizeArenaCompareResponse(arenaRes, modelAId, modelBId, startA, startB))
    } catch (err: any) {
      const msg = err?.message || 'Unknown error'
      setResults({
        a: { content: `[Error: ${msg}]`, error: msg, latency_ms: Date.now() - startA, done: true },
        b: { content: `[Error: ${msg}]`, error: msg, latency_ms: Date.now() - startB, done: true },
      })
      useStore.getState().triggerToast(t('arena.exec_failed', msg), 'warning')
    } finally {
      unsubModelDone?.()
      if (activeRunIdRef.current === runId) activeRunIdRef.current = null
      setRunning(false)
    }
  }, [prompt, modelAId, modelBId, running])

  const handleVote = useCallback(
    async (verdict: 'a' | 'b' | 'tie' | 'bad') => {
      if (!modelA || !modelB || votedWinner) return
      setVotedWinner(verdict)
      try {
        let winnerModelId: number | null = null
        let winnerModelName = verdict === 'tie' ? 'TIE' : 'BOTH_BAD'
        let loserModelIds: number[] = []
        let loserModelNames: string[] = []
        if (verdict === 'a') {
          winnerModelId = modelA.id
          winnerModelName = modelA.model_name
          loserModelIds = modelB.id !== modelA.id ? [modelB.id] : []
          loserModelNames = modelB.id !== modelA.id ? [modelB.model_name] : []
        } else if (verdict === 'b') {
          winnerModelId = modelB.id
          winnerModelName = modelB.model_name
          loserModelIds = modelA.id !== modelB.id ? [modelA.id] : []
          loserModelNames = modelA.id !== modelB.id ? [modelA.model_name] : []
        }
        await window.electronAPI.arena.vote({
          prompt: prompt.trim() || 'Arena Battle',
          winnerModelId,
          winnerModelName,
          loserModelIds,
          loserModelNames,
        })
        loadScores()
        useStore.getState().triggerToast(
          verdict === 'a' || verdict === 'b' ? t('arena.vote_success') : t('arena.vote_recorded'),
          'success'
        )
      } catch (err: any) {
        setVotedWinner(null)
        useStore.getState().triggerToast(t('arena.vote_failed', err.message), 'warning')
      }
    },
    [modelA, modelB, votedWinner, loadScores, prompt]
  )

  const handleReplayTemplate = (tpl: BenchmarkTemplate) => {
    setPrompt(tpl.prompt)
    setActiveTab('compare')
    useStore.getState().triggerToast(t('arena.template_loaded', tpl.name), 'info')
  }

  const handleCopySlot = (slot: 'a' | 'b', text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedSlot(slot)
    setTimeout(() => setCopiedSlot(null), 2000)
  }

  // Sorted leaderboard
  const leaderboard = useMemo(() => {
    return [...scores].sort((a, b) => b.score - a.score)
  }, [scores])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-primary)] overflow-y-auto">
      {/* Industrial Monochrome Header */}
      <div
        className="px-6 py-4 border-b shrink-0 flex items-center justify-between"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center border font-mono text-xs font-semibold"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <FlaskConical size={16} />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {t('arena.page.title')}
            </h1>
            <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {t('arena.page.subtitle')}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          className="flex items-center p-0.5 rounded-md border text-xs font-medium font-mono"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <button
            onClick={() => setActiveTab('compare')}
            className={`px-3 py-1 rounded-[5px] transition-colors cursor-pointer ${
              activeTab === 'compare'
                ? 'bg-[var(--content-bg)] text-[var(--text-primary)] font-semibold shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('arena.tab.compare')}
          </button>
          <button
            onClick={() => setActiveTab('benchmark')}
            className={`px-3 py-1 rounded-[5px] transition-colors cursor-pointer ${
              activeTab === 'benchmark'
                ? 'bg-[var(--content-bg)] text-[var(--text-primary)] font-semibold shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('arena.tab.benchmark')} ({leaderboard.length})
          </button>
        </div>
      </div>

      {activeTab === 'compare' ? (
        <div key="compare" className="p-6 max-w-6xl mx-auto w-full space-y-4 tab-fade-in">
          {/* Controls Bar: Model Selectors & Run */}
          <div
            className="p-3 rounded-lg border grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
          >
            <div className="md:col-span-5 flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                Model A
              </span>
              <select
                value={modelAId ?? ''}
                onChange={(e) => setModelAId(Number(e.target.value) || null)}
                className="flex-1 h-7.5 text-xs font-mono px-2.5 rounded-md border outline-none bg-[var(--bg-secondary)] hover:bg-[var(--content-bg)] transition-colors cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="" disabled>{t('arena.select_model_a')}</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.model_name}{m.provider_name ? ` (${m.provider_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 text-center text-xs font-mono font-bold text-[var(--text-muted)]">
              VS
            </div>

            <div className="md:col-span-5 flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                Model B
              </span>
              <select
                value={modelBId ?? ''}
                onChange={(e) => setModelBId(Number(e.target.value) || null)}
                className="flex-1 h-7.5 text-xs font-mono px-2.5 rounded-md border outline-none bg-[var(--bg-secondary)] hover:bg-[var(--content-bg)] transition-colors cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="" disabled>{t('arena.select_model_b')}</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.model_name}{m.provider_name ? ` (${m.provider_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prompt Input */}
          <div
            className="rounded-lg border p-3 space-y-2.5"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('arena.prompt_placeholder')}
              rows={3}
              className="w-full text-xs font-mono leading-relaxed bg-transparent outline-none resize-y placeholder:text-[var(--text-muted)]"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {t('arena.prompt_meta', prompt.length)}
              </span>
              <button
                onClick={running ? handleStopCompare : handleRunCompare}
                disabled={!running && (!prompt.trim() || !modelAId || !modelBId)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium font-mono bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-[var(--accent)] transition-opacity disabled:opacity-30 cursor-pointer"
              >
                {running ? <Square size={12} className="fill-current" /> : <Play size={12} className="fill-current" />}
                <span>{running ? t('arena.stop_battle') : t('arena.start_battle')}</span>
              </button>
            </div>
          </div>

          {/* Side-by-Side Results Display */}
          {results && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 inline-card-enter">
              {([
                { key: 'a' as const, label: modelA?.display_name || modelA?.model_name || 'Model A', slot: results.a },
                { key: 'b' as const, label: modelB?.display_name || modelB?.model_name || 'Model B', slot: results.b },
              ]).map(({ key, label, slot }) => (
                <div
                  key={key}
                  className="rounded-lg border flex flex-col min-h-[300px]"
                  style={{ borderColor: slot.error ? 'var(--error)' : 'var(--border)', backgroundColor: 'var(--content-bg)' }}
                >
                  <div
                    className="px-3.5 py-2 border-b flex items-center justify-between shrink-0"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                        {label}
                      </span>
                      {slot.latency_ms != null && slot.done && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1 shrink-0">
                          <Clock size={10} /> {slot.latency_ms}ms
                        </span>
                      )}
                      {slot.tokens != null && slot.tokens > 0 && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                          {slot.tokens} tok
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleCopySlot(key, slot.content)}
                      disabled={!slot.content}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
                      title={t('arena.copy_reply')}
                      aria-label={t('arena.copy_reply')}
                    >
                      {copiedSlot === key ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div className="p-4 flex-1 text-xs leading-relaxed overflow-y-auto max-h-[500px] break-words prose-container">
                    {slot.error ? (
                      <div className="flex items-start gap-2 text-xs font-mono p-2.5 rounded border" style={{ color: 'var(--error)', borderColor: 'var(--error)', backgroundColor: 'var(--bg-secondary)' }}>
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span className="break-all">{slot.error}</span>
                      </div>
                    ) : !slot.done && !slot.content ? (
                      <div className="text-xs font-mono text-[var(--text-muted)] animate-pulse">
                        {t('arena.generating')}
                      </div>
                    ) : slot.content ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(slot.content),
                        }}
                      />
                    ) : (
                      <div className="text-xs font-mono text-[var(--text-muted)]">
                        {t('arena.empty_response')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Voting Action Bar */}
          {results && (
            <div
              className="p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
            >
              <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                {votedWinner ? t('arena.vote_done') : t('arena.vote_prompt')}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleVote('a')}
                  disabled={!!votedWinner || running}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'a'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {t('arena.vote_a_wins')}
                </button>
                <button
                  onClick={() => handleVote('b')}
                  disabled={!!votedWinner || running}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'b'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {t('arena.vote_b_wins')}
                </button>
                <button
                  onClick={() => handleVote('tie')}
                  disabled={!!votedWinner || running}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'tie'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {t('arena.vote_tie')}
                </button>
                <button
                  onClick={() => handleVote('bad')}
                  disabled={!!votedWinner || running}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'bad'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {t('arena.vote_both_bad')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Benchmark & ELO Leaderboard Tab */
        <div key="benchmark" className="p-6 max-w-6xl mx-auto w-full space-y-6 tab-fade-in">
          {/* ELO Leaderboard */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
          >
            <div
              className="px-4 py-2.5 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center gap-2">
                <Trophy size={14} className="text-[var(--accent)]" />
                <h2 className="text-xs font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {t('arena.elo.title')}
                </h2>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {t('arena.elo.subtitle')}
              </span>
            </div>

            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <th className="py-2.5 px-4 font-medium w-16">{t('arena.elo.col_rank')}</th>
                  <th className="py-2.5 px-4 font-medium">{t('arena.elo.col_model')}</th>
                  <th className="py-2.5 px-4 font-medium">{t('arena.elo.col_rating')}</th>
                  <th className="py-2.5 px-4 font-medium">{t('arena.elo.col_win_ratio')}</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-[var(--text-muted)]">
                      {t('arena.elo.empty')}
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((item, idx) => (
                    <tr key={`${item.model_id}-${(item as { intent?: string }).intent || idx}`} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-[var(--text-muted)]">
                        #{idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-[var(--text-primary)]">
                        {item.model_name}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-[var(--accent)]">
                        {Math.round(item.score)}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--text-muted)]">
                        {item.total_count ? `${Math.round(((item.win_count || 0) / item.total_count) * 100)}% (${item.win_count}/${item.total_count})` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Benchmark Templates */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
          >
            <div
              className="px-4 py-2.5 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <span className="text-xs font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                {t('arena.bench.title')}
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {t('arena.bench.hint')}
              </span>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.length === 0 ? (
                <div className="col-span-2 py-4 text-center text-xs text-[var(--text-muted)] font-mono">
                  {loadingTemplates ? t('arena.bench.loading') : t('arena.bench.empty')}
                </div>
              ) : (
                templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-3 rounded border text-xs space-y-2 hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">{tpl.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border text-[var(--text-muted)] font-mono">
                        {tpl.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                      {tpl.description || tpl.prompt}
                    </p>
                    <button
                      onClick={() => handleReplayTemplate(tpl)}
                      className="flex items-center gap-1 text-[11px] font-mono text-[var(--accent)] hover:underline pt-1 cursor-pointer"
                    >
                      <span>{t('arena.bench.load')}</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
