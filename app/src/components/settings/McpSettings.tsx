import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { Plus, Trash2, RefreshCw, Plug, Server, Store, Search, Download, ChevronDown, Globe } from 'lucide-react'
import { t } from '@/utils/i18n'

type McpServer = { id: number; name: string; command: string; args: string[]; env: Record<string, string>; enabled: number }
type MarketServer = { name: string; title: string; description: string; version: string; repositoryUrl: string | null; installable: boolean; config: { name: string; command: string; args: string[]; env: Record<string, string> } | null }

// ───────────────────────────────────────────────────────────────────────────
// MCP server management UI (settings page card).
//
// Add/edit/delete stdio MCP server configs, and (re)connect each one to pull
// its tools into the agent. Shows live connection status + tool count.
// ───────────────────────────────────────────────────────────────────────────
export default function McpSettings() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [connected, setConnected] = useState<string[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState({ name: '', command: '', args: '', env: '' })
  const [marketOpen, setMarketOpen] = useState(false)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketServers, setMarketServers] = useState<MarketServer[]>([])
  const [marketQuery, setMarketQuery] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const { toast } = useUI()

  const load = async () => {
    setServers(await window.electronAPI.mcp.list())
    const st = await window.electronAPI.mcp.status()
    setConnected(st.connected || [])
  }
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name || !form.command) { toast(t('mcp.need_name_command'), { type: 'error' }); return }
    setBusy('new')
    try {
      let args: string[] = []
      let env: Record<string, string> = {}
      try { args = form.args ? JSON.parse(form.args) : [] } catch { toast(t('mcp.args_json_error'), { type: 'error' }); setBusy(null); return }
      try { env = form.env ? JSON.parse(form.env) : {} } catch { toast(t('mcp.env_json_error'), { type: 'error' }); setBusy(null); return }
      const res = await window.electronAPI.mcp.create({ name: form.name, command: form.command, args, env, enabled: 1 })
      // Auto-connect on add.
      await window.electronAPI.mcp.connect(res.lastInsertRowid)
      setForm({ name: '', command: '', args: '', env: '' })
      setShowAdd(false)
      toast(t('mcp.added'))
      await load()
    } finally { setBusy(null) }
  }

  const handleConnect = async (id: number) => {
    setBusy(id)
    try {
      const r = await window.electronAPI.mcp.connect(id)
      if (r.success) toast(t('mcp.connected', (r.tools?.length || 0)))
      else toast(r.error || t('mcp.connect_failed'), { type: 'error' })
      await load()
    } finally { setBusy(null) }
  }

  const handleDelete = async (id: number) => {
    await window.electronAPI.mcp.delete(id)
    toast(t('mcp.deleted'))
    await load()
  }

  const loadMarket = async (query?: string) => {
    setMarketLoading(true)
    try {
      const name = (query ?? '').trim()
      const res = name ? await window.electronAPI.market.search(name) : await window.electronAPI.market.list()
      setMarketServers(res?.servers || [])
    } catch { setMarketServers([]) } finally { setMarketLoading(false) }
  }

  const toggleMarket = () => {
    const next = !marketOpen
    setMarketOpen(next)
    if (next) loadMarket()
  }

  const handleInstall = async (entry: MarketServer) => {
    setInstalling(entry.name)
    try {
      const res = await window.electronAPI.market.install(entry)
      if (res.success) {
        toast(t('mcp.market.installed', entry.title))
        await load()
      } else {
        toast(res.error || t('mcp.market.install_failed'), { type: 'error' })
      }
    } finally { setInstalling(null) }
  }

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plug size={14} className="text-gray-400" />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('mcp.title')}</h2>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>
          <Plus size={12} />{t('mcp.add')}
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{t('mcp.desc')}</p>

      {showAdd && (
        <div className="mb-4 p-3 rounded-lg space-y-2" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('mcp.name_ph')} className="w-full px-2.5 py-1.5 text-xs rounded border outline-none bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
          <input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder={t('mcp.command_ph')} className="w-full px-2.5 py-1.5 text-xs rounded border outline-none font-mono bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
          <input value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} placeholder={t('mcp.args_ph')} className="w-full px-2.5 py-1.5 text-xs rounded border outline-none font-mono bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
          <input value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} placeholder={t('mcp.env_ph')} className="w-full px-2.5 py-1.5 text-xs rounded border outline-none font-mono bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={busy === 'new'} className="px-3 py-1.5 text-xs bg-black text-white rounded-lg hover:opacity-80 disabled:opacity-40">{t('mcp.add_btn')}</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs rounded-lg border" style={{ borderColor: 'var(--border)' }}>{t('models.cancel')}</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {servers.length === 0 && <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>{t('mcp.empty')}</p>}
        {servers.map((s) => {
          const isConnected = connected.includes(s.name)
          return (
            <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
              <Server size={14} className="shrink-0 text-gray-400" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{s.command} {(s.args || []).join(' ')}</div>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: isConnected ? 'rgba(22,163,74,0.12)' : 'rgba(156,163,175,0.15)', color: isConnected ? 'var(--success)' : 'var(--text-muted)' }}>
                {isConnected ? t('mcp.online') : t('mcp.offline')}
              </span>
              <button onClick={() => handleConnect(s.id)} disabled={busy === s.id} className="p-1 rounded hover:bg-[var(--border)]" title={t('mcp.reconnect')}>
                <RefreshCw size={12} className={busy === s.id ? 'animate-spin text-gray-400' : 'text-gray-400'} />
              </button>
              <button onClick={() => handleDelete(s.id)} className="p-1 rounded hover:bg-[var(--border)]"><Trash2 size={12} className="text-gray-400" /></button>
            </div>
          )
        })}
      </div>

      {/* Browse market */}
      <div className="mt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={toggleMarket} className="w-full flex items-center justify-between py-3 text-xs font-medium transition-colors" style={{ color: 'var(--text-primary)' }}>
          <span className="flex items-center gap-2">
            <Store size={14} className="text-gray-400" />
            {t('mcp.market.title')}
          </span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${marketOpen ? 'rotate-180' : ''}`} />
        </button>

        {marketOpen && (
          <div className="space-y-2 pb-1">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
              <Search size={12} className="text-gray-400 shrink-0" />
              <input value={marketQuery} onChange={(e) => { const v = e.target.value; setMarketQuery(v); loadMarket(v) }} placeholder={t('mcp.market.search_ph')}
                className="w-full bg-transparent outline-none text-xs" style={{ color: 'var(--text-primary)' }} />
            </div>

            {marketLoading ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>{t('mcp.market.loading')}</p>
            ) : marketServers.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>{t('mcp.market.empty')}</p>
            ) : (
              marketServers.map((m) => {
                const isInstalling = installing === m.name
                return (
                  <div key={m.name} className="flex items-start gap-2 p-2.5 rounded-lg" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
                        {m.version && <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{t('mcp.market.version', m.version)}</span>}
                        {!m.installable && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(156,163,175,0.15)', color: 'var(--text-muted)' }}>{t('mcp.market.not_installable')}</span>
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{m.description}</p>
                      {m.repositoryUrl && (
                        <a href={m.repositoryUrl} target="_blank" rel="noreferrer" className="text-[10px] flex items-center gap-1 mt-1 hover:underline" style={{ color: 'var(--accent)' }}>
                          <Globe size={9} />{t('mcp.market.repository')}
                        </a>
                      )}
                    </div>
                    {m.installable && (
                      <button onClick={() => handleInstall(m)} disabled={isInstalling} className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-lg bg-black text-white hover:opacity-80 disabled:opacity-40 shrink-0">
                        <Download size={10} className={isInstalling ? 'animate-spin' : ''} />{t('mcp.market.install')}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
