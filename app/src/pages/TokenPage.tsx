import { useState, useEffect, useMemo } from 'react'
import { t } from '@/utils/i18n'

// ───────────────────────────────────────────────────────────────────────────
// Usage statistics page. Backed by the usage_log table (one row per real API
// call), so the numbers are server-reported tokens + computed cost + cache
// stats — not client estimates. Layout mirrors a cc-switch-style dashboard:
// stat tiles, a range-pickable trend chart, provider/model breakdowns, and a
// recent request-log table.
// ───────────────────────────────────────────────────────────────────────────

type RangeKey = '1d' | '7d' | '30d' | 'all'
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1d', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All' },
]

function rangeToIso(key: RangeKey): { since?: string; until?: string } {
  if (key === 'all') return {}
  const days = key === '1d' ? 1 : key === '7d' ? 7 : 30
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString()
  return { since }
}

const fmt = (n: number) => n.toLocaleString()
const fmtCost = (n: number) => (n > 0 ? `$${n.toFixed(4)}` : `$0`)
const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n))

export default function TokenPage() {
  const [range, setRange] = useState<RangeKey>('7d')
  const [stats, setStats] = useState<any>(null)
  const [byProvider, setByProvider] = useState<any[]>([])
  const [byModel, setByModel] = useState<any[]>([])
  const [daily, setDaily] = useState<any[]>([])
  const [log, setLog] = useState<any[]>([])

  useEffect(() => {
    const r = rangeToIso(range)
    Promise.all([
      window.electronAPI.usage.stats(r),
      window.electronAPI.usage.byProvider(r),
      window.electronAPI.usage.byModel(r),
      window.electronAPI.usage.daily(r),
      window.electronAPI.usage.log(r),
    ]).then(([s, p, m, d, l]) => {
      setStats(s); setByProvider(p || []); setByModel(m || []); setDaily(d || []); setLog(l || [])
    })
  }, [range])

  const cacheHitRate = useMemo(() => {
    if (!stats) return 0
    const read = stats.cache_read_tokens || 0
    const prompt = stats.prompt_tokens || 0
    if (prompt <= 0) return 0
    return Math.min(100, Math.round((read / prompt) * 1000) / 10)
  }, [stats])

  const maxDaily = useMemo(() => Math.max(1, ...daily.map((d) => d.total_tokens || 0)), [daily])

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>📊 {t('tokens.title')}</h1>
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {RANGES.map(r => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${range === r.key ? 'text-white' : ''}`}
                style={range === r.key ? { backgroundColor: 'var(--accent)' } : { color: 'var(--text-muted)' }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Tile label={t('usage.real_tokens')} value={fmtTok(stats?.total_tokens || 0)} sub={fmt(stats?.total_tokens || 0)} accent />
          <Tile label={t('usage.total_requests')} value={fmt(stats?.requests || 0)} />
          <Tile label={t('usage.total_cost')} value={fmtCost(stats?.cost || 0)} accent2 />
          <Tile label={t('usage.cache_hit_rate')} value={cacheHitRate > 0 ? `${cacheHitRate}%` : '—'} sub={`${t('usage.cache_read')} ${fmtTok(stats?.cache_read_tokens || 0)}`} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Tile small label={t('usage.input_tokens')} value={fmtTok(stats?.prompt_tokens || 0)} />
          <Tile small label={t('usage.output_tokens')} value={fmtTok(stats?.completion_tokens || 0)} />
          <Tile small label={t('usage.cache_creation')} value={fmtTok(stats?.cache_creation_tokens || 0)} />
          <Tile small label={t('usage.avg_latency')} value={stats?.latency_avg ? `${Math.round(stats.latency_avg)}ms` : '—'} />
        </div>

        {/* Trend chart */}
        <Section title={t('usage.trend')}>
          {daily.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1">
              {daily.slice(-30).map((d) => {
                const pct = Math.round(((d.total_tokens || 0) / maxDaily) * 100)
                return (
                  <div key={d.day} className="flex items-center gap-2">
                    <span className="text-[10px] w-20 text-right shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>{d.day}</span>
                    <div className="flex-1 h-3 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }} />
                    </div>
                    <span className="text-[10px] w-14 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{fmtTok(d.total_tokens || 0)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {byProvider.length > 0 && (
            <Section title={t('usage.by_provider')}>
              <Table rows={byProvider} nameKey="provider_name" />
            </Section>
          )}
          {byModel.length > 0 && (
            <Section title={t('usage.by_model')}>
              <Table rows={byModel} nameKey="model_name" />
            </Section>
          )}
        </div>

        {/* Request log */}
        <Section title={t('usage.request_log')}>
          {log.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th className="text-left px-2 py-1 font-medium">{t('usage.col.time')}</th>
                    <th className="text-left px-2 py-1 font-medium">{t('usage.col.provider')}</th>
                    <th className="text-left px-2 py-1 font-medium">{t('usage.col.model')}</th>
                    <th className="text-right px-2 py-1 font-medium">{t('usage.col.input')}</th>
                    <th className="text-right px-2 py-1 font-medium">{t('usage.col.output')}</th>
                    <th className="text-right px-2 py-1 font-medium">{t('usage.col.cost')}</th>
                    <th className="text-right px-2 py-1 font-medium">{t('usage.col.latency')}</th>
                    <th className="text-right px-2 py-1 font-medium">{t('usage.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-2 py-1 font-mono whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{String(r.created_at || '').slice(5, 16).replace('T', ' ')}</td>
                      <td className="px-2 py-1 truncate max-w-[120px]" style={{ color: 'var(--text-secondary)' }}>{r.provider_name || '—'}</td>
                      <td className="px-2 py-1 truncate max-w-[140px] font-mono" style={{ color: 'var(--text-primary)' }}>{r.model_name || '—'}</td>
                      <td className="px-2 py-1 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{fmt(r.prompt_tokens || 0)}</td>
                      <td className="px-2 py-1 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{fmt(r.completion_tokens || 0)}</td>
                      <td className="px-2 py-1 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtCost(r.cost || 0)}</td>
                      <td className="px-2 py-1 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{r.latency_ms ? `${r.latency_ms}ms` : '—'}</td>
                      <td className="px-2 py-1 text-right font-mono" style={{ color: r.status === 200 ? 'var(--success)' : 'var(--error)' }}>{r.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function Tile({ label, value, sub, accent, accent2, small }: { label: string; value: string; sub?: string; accent?: boolean; accent2?: boolean; small?: boolean }) {
  const color = accent ? 'var(--accent)' : accent2 ? 'var(--success)' : 'var(--text-primary)'
  return (
    <div className="rounded-xl p-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className={`${small ? 'text-base' : 'text-xl'} font-bold`} style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
      <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-4" style={{ border: '1px solid var(--border)' }}>
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </div>
  )
}

function Table({ rows, nameKey }: { rows: any[]; nameKey: string }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ color: 'var(--text-muted)' }}>
          <th className="text-left px-2 py-1 font-medium">名称</th>
          <th className="text-right px-2 py-1 font-medium">请求</th>
          <th className="text-right px-2 py-1 font-medium">Tokens</th>
          <th className="text-right px-2 py-1 font-medium">成本</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
            <td className="px-2 py-1 truncate max-w-[160px]" style={{ color: 'var(--text-primary)' }}>{r[nameKey] || '—'}</td>
            <td className="px-2 py-1 text-right" style={{ color: 'var(--text-secondary)' }}>{r.requests}</td>
            <td className="px-2 py-1 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtTok(r.total_tokens || 0)}</td>
            <td className="px-2 py-1 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtCost(r.cost || 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Empty() {
  return <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>暂无数据，发消息后自动统计</div>
}
