import { useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { scoresToCsv, scoresToMarkdown, downloadText } from '@/utils/arenaExport'
import BenchmarkPanel from '@/components/arena/BenchmarkPanel'

export default function ScoresPage() {
  const scores = useStore((s) => s.scores)

  const byIntent = useMemo(() => {
    const grouped: Record<string, typeof scores> = {}
    for (const s of scores) {
      if (!grouped[s.intent]) grouped[s.intent] = []
      grouped[s.intent].push(s)
    }
    for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => b.score - a.score)
    return grouped
  }, [scores])

  const intentLabels: Record<string, string> = useMemo(() => ({
    coding: t('scores.intent.coding'), math: t('scores.intent.math'),
    translation: t('scores.intent.translation'), summary: t('scores.intent.summary'), general: t('scores.intent.general'),
  }), [])

  const hasScores = scores.length > 0

  const exportCsv = () => {
    if (!hasScores) return
    downloadText('aetherai-arena-scores.csv', scoresToCsv(scores), 'text/csv')
  }

  const exportJson = () => {
    if (!hasScores) return
    downloadText('aetherai-arena-scores.json', JSON.stringify(scores, null, 2), 'application/json')
  }

  const copyMarkdown = async () => {
    if (!hasScores) return
    try {
      await navigator.clipboard.writeText(scoresToMarkdown(scores))
    } catch {}
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>🏟 {t('scores.title')}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('scores.subtitle')}</p>
          </div>
          {hasScores && (
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex gap-1.5">
                <button onClick={exportCsv} title={t('scores.export_hint')}
                  className="text-[11px] px-2.5 py-1 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {t('scores.export_csv')}
                </button>
                <button onClick={exportJson} title={t('scores.export_hint')}
                  className="text-[11px] px-2.5 py-1 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {t('scores.export_json')}
                </button>
                <button onClick={copyMarkdown} title={t('scores.export_hint')}
                  className="text-[11px] px-2.5 py-1 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {t('scores.copy_md')}
                </button>
              </div>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('scores.export_hint')}</span>
            </div>
          )}
        </div>
        {Object.keys(byIntent).length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>{t('scores.empty')}</div>
        )}
        {Object.entries(byIntent).map(([intent, rows]) => (
          <div key={intent} className="mb-6">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{intentLabels[intent] || intent}</h2>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                    <th className="text-left px-4 py-2 font-medium">{t('scores.model')}</th>
                    <th className="text-left px-4 py-2 font-medium">{t('scores.score')}</th>
                    <th className="text-left px-4 py-2 font-medium">{t('scores.wins')}</th>
                    <th className="text-left px-4 py-2 font-medium">{t('scores.total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {rows.map((s) => (
                    <tr key={s.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.model_name}</span>
                        <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{s.provider_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono font-medium ${s.score >= 1050 ? 'text-green-600' : s.score >= 980 ? 'text-amber-600' : ''}`} style={s.score < 980 ? { color: 'var(--text-muted)' } : {}}>
                          {s.score.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{s.win_count}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{s.total_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Arena 2.0: personal benchmark (review P0-3) */}
      <BenchmarkPanel />
    </div>
  )
}
