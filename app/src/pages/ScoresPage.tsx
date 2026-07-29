import { useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

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

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>🏟 {t('scores.title')}</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>{t('scores.subtitle')}</p>
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
    </div>
  )
}
