// ─────────────────────────────────────────────────────────────────────────────
// app/src/pages/ArenaPage.tsx
//
// Post-Digital Minimalist Arena Workbench:
// Side-by-Side Multi-Model Comparison & Personal Benchmark Replay.
// High-contrast industrial monochrome style, zero marketing fluff.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useStore } from '@/store'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import {
  FlaskConical,
  Trophy,
  Play,
  RotateCcw,
  Check,
  Copy,
  Clock,
  Coins,
  Zap,
  ArrowRight,
  Square,
  Sparkles,
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
  const providers = useStore((s) => s.providers)
  const loadAllModels = useStore((s) => s.loadAllModels)
  const loadProviders = useStore((s) => s.loadProviders)
  const loadScores = useStore((s) => s.loadScores)
  const scores = useStore((s) => s.scores)

  // Arena models selection
  const [modelAId, setModelAId] = useState<number | null>(null)
  const [modelBId, setModelBId] = useState<number | null>(null)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<{
    a: { content: string; latency_ms?: number; tokens?: number; cost?: number; done: boolean }
    b: { content: string; latency_ms?: number; tokens?: number; cost?: number; done: boolean }
  } | null>(null)
  const [votedWinner, setVotedWinner] = useState<'a' | 'b' | 'tie' | 'bad' | null>(null)
  const [copiedSlot, setCopiedSlot] = useState<'a' | 'b' | null>(null)

  // Benchmarks list
  const [templates, setTemplates] = useState<BenchmarkTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  useEffect(() => {
    loadAllModels()
    loadProviders()
    loadScores()
  }, [loadAllModels, loadProviders, loadScores])

  // Default models selection
  useEffect(() => {
    if (allModels.length >= 2 && !modelAId && !modelBId) {
      setModelAId(allModels[0].id)
      setModelBId(allModels[1].id)
    } else if (allModels.length === 1 && !modelAId) {
      setModelAId(allModels[0].id)
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

  const handleRunCompare = useCallback(async () => {
    if (!prompt.trim() || !modelAId || !modelBId || running) return
    setRunning(true)
    setVotedWinner(null)
    setResults({
      a: { content: '', done: false },
      b: { content: '', done: false },
    })

    const startA = Date.now()
    const startB = Date.now()

    // Run parallel stream requests
    const runSlot = async (
      model: typeof modelA,
      slotKey: 'a' | 'b',
      startTime: number
    ) => {
      if (!model) return
      try {
        const provider = providers.find((p) => p.id === model.provider_id)
        if (!provider) throw new Error('Provider not found')

        let accumulated = ''
        const res = await window.electronAPI.chat.test?.({
          cwd: undefined,
          sessionId: undefined,
          args: undefined,
        })
        // Fallback to simple completion via direct completion if stream channel is busy
        // or invoke arena:send
      } catch (err: any) {
        setResults((prev) =>
          prev
            ? {
                ...prev,
                [slotKey]: {
                  content: `Error: ${err.message || 'Generation failed'}`,
                  latency_ms: Date.now() - startTime,
                  done: true,
                },
              }
            : null
        )
      }
    }

    // Call arena:send for true unified dual-model run
    try {
      const arenaRes = await window.electronAPI.arena.send({
        sessionId: 0,
        content: prompt.trim(),
        modelIds: [modelAId, modelBId],
      })
      if (Array.isArray(arenaRes)) {
        const rA = arenaRes.find((r: any) => r.model_id === modelAId) || arenaRes[0]
        const rB = arenaRes.find((r: any) => r.model_id === modelBId) || arenaRes[1]
        setResults({
          a: {
            content: rA?.content || '',
            latency_ms: rA?.latency_ms || Date.now() - startA,
            tokens: rA?.usage?.total_tokens,
            cost: rA?.usage?.cost,
            done: true,
          },
          b: {
            content: rB?.content || '',
            latency_ms: rB?.latency_ms || Date.now() - startB,
            tokens: rB?.usage?.total_tokens,
            cost: rB?.usage?.cost,
            done: true,
          },
        })
      }
    } catch (err: any) {
      useStore.getState().triggerToast(`Arena 执行失败: ${err.message}`, 'warning')
    } finally {
      setRunning(false)
    }
  }, [prompt, modelAId, modelBId, running, modelA, modelB, providers])

  const handleVote = useCallback(
    async (verdict: 'a' | 'b' | 'tie' | 'bad') => {
      if (!modelA || !modelB || votedWinner) return
      setVotedWinner(verdict)
      try {
        let winnerModelId = modelA.id
        let winnerModelName = modelA.model_name
        let loserModelIds = [modelB.id]
        let loserModelNames = [modelB.model_name]
        if (verdict === 'b') {
          winnerModelId = modelB.id
          winnerModelName = modelB.model_name
          loserModelIds = [modelA.id]
          loserModelNames = [modelA.model_name]
        }
        await window.electronAPI.arena.vote({
          prompt: prompt.trim() || 'Arena Battle',
          winnerModelId,
          winnerModelName,
          loserModelIds,
          loserModelNames,
        })
        loadScores()
        useStore.getState().triggerToast('投票成功，已更新 ELO 基准排行', 'success')
      } catch (err: any) {
        useStore.getState().triggerToast(`投票失败: ${err.message}`, 'warning')
      }
    },
    [modelA, modelB, votedWinner, loadScores]
  )

  const handleReplayTemplate = (tpl: BenchmarkTemplate) => {
    setPrompt(tpl.prompt)
    setActiveTab('compare')
    useStore.getState().triggerToast(`已载入基准用例: ${tpl.name}`, 'info')
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
              Arena / 竞技场
            </h1>
            <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
              同屏双模型客观对比 · 个人基准 ELO 胜率排定
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
            Multi-Model Compare
          </button>
          <button
            onClick={() => setActiveTab('benchmark')}
            className={`px-3 py-1 rounded-[5px] transition-colors cursor-pointer ${
              activeTab === 'benchmark'
                ? 'bg-[var(--content-bg)] text-[var(--text-primary)] font-semibold shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Benchmark & ELO ({leaderboard.length})
          </button>
        </div>
      </div>

      {activeTab === 'compare' ? (
        <div className="p-6 max-w-6xl mx-auto w-full space-y-4">
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
                <option value="" disabled>选择 Model A</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.model_name}
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
                <option value="" disabled>选择 Model B</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.model_name}
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
              placeholder="输入测试提示词（例如：编写一段 TypeScript 并发限制器，或解释两阶段提交协议）…"
              rows={3}
              className="w-full text-xs font-mono leading-relaxed bg-transparent outline-none resize-y placeholder:text-[var(--text-muted)]"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {prompt.length} 字符 · 支持 Markdown 与多行代码
              </span>
              <button
                onClick={handleRunCompare}
                disabled={!prompt.trim() || !modelAId || !modelBId || running}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium font-mono bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity disabled:opacity-30 cursor-pointer"
              >
                {running ? <Square size={12} className="fill-current" /> : <Play size={12} className="fill-current" />}
                <span>{running ? '生成对比中...' : '开始对比 (Run Battle)'}</span>
              </button>
            </div>
          </div>

          {/* Side-by-Side Results Display */}
          {results && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Slot A */}
              <div
                className="rounded-lg border flex flex-col min-h-[300px]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              >
                <div
                  className="px-3.5 py-2 border-b flex items-center justify-between shrink-0"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {modelA?.model_name || 'Model A'}
                    </span>
                    {results.a.latency_ms && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1">
                        <Clock size={10} /> {results.a.latency_ms}ms
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopySlot('a', results.a.content)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    title="复制回复"
                  >
                    {copiedSlot === 'a' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="p-4 flex-1 text-xs leading-relaxed overflow-y-auto max-h-[500px] break-words prose-container">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(results.a.content || (running ? '生成中...' : '无内容')),
                    }}
                  />
                </div>
              </div>

              {/* Slot B */}
              <div
                className="rounded-lg border flex flex-col min-h-[300px]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              >
                <div
                  className="px-3.5 py-2 border-b flex items-center justify-between shrink-0"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {modelB?.model_name || 'Model B'}
                    </span>
                    {results.b.latency_ms && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1">
                        <Clock size={10} /> {results.b.latency_ms}ms
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopySlot('b', results.b.content)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    title="复制回复"
                  >
                    {copiedSlot === 'b' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="p-4 flex-1 text-xs leading-relaxed overflow-y-auto max-h-[500px] break-words prose-container">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(results.b.content || (running ? '生成中...' : '无内容')),
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Voting Action Bar */}
          {results && (
            <div
              className="p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
            >
              <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                {votedWinner ? '已完成本轮裁决 · ELO 积分已同步写入' : '裁决本次对比表现：'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleVote('a')}
                  disabled={!!votedWinner}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'a'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  Model A 胜出
                </button>
                <button
                  onClick={() => handleVote('b')}
                  disabled={!!votedWinner}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'b'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  Model B 胜出
                </button>
                <button
                  onClick={() => handleVote('tie')}
                  disabled={!!votedWinner}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'tie'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  势均力敌 (Tie)
                </button>
                <button
                  onClick={() => handleVote('bad')}
                  disabled={!!votedWinner}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                    votedWinner === 'bad'
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] disabled:opacity-40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  均不理想
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Benchmark & ELO Leaderboard Tab */
        <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
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
                  Personal Model ELO Leaderboard (个人模型天梯)
                </h2>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                基准分 1500 · 依据个人盲测对比实时收敛
              </span>
            </div>

            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <th className="py-2.5 px-4 font-medium w-16">Rank</th>
                  <th className="py-2.5 px-4 font-medium">Model</th>
                  <th className="py-2.5 px-4 font-medium">ELO Rating</th>
                  <th className="py-2.5 px-4 font-medium">Win Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-[var(--text-muted)]">
                      暂无对比积分数据，进行第一轮对决后将自动记录
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((item, idx) => (
                    <tr key={item.model_id} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
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
                Preset Engineering Benchmark Tasks (预设工程基准题库)
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                一键载入对比
              </span>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.length === 0 ? (
                <div className="col-span-2 py-4 text-center text-xs text-[var(--text-muted)] font-mono">
                  {loadingTemplates ? '载入基准题库中...' : '标准工程题库已内置于 prompt 中，可直接在对决栏键入测试'}
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
                      <span>载入对比</span>
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
