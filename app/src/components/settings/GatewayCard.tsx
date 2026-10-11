import { useState, useEffect } from 'react'
import { Plug, Copy } from 'lucide-react'
import { useUI } from '@/components/ui/feedback'

// "Local Gateway" card — connection info for VS Code / external tools
export default function GatewayCard() {
  const { toast } = useUI()
  const [info, setInfo] = useState<{ enabled: boolean; port: number; token: string | null; running: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const refresh = async () => {
    try { setInfo(await window.electronAPI?.gateway?.info?.()) } catch { setInfo(null) }
  }
  useEffect(() => { refresh() }, [])

  const toggle = async () => {
    if (!info) return
    setBusy(true)
    try { await window.electronAPI?.gateway?.setEnabled?.(!info.enabled); await refresh() } catch {}
    setBusy(false)
  }

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} 已复制`, { type: 'success' }) } catch { toast('复制失败', { type: 'error' }) }
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Local Gateway / VS Code 集成</h2>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              本地端口网关 · {info?.enabled ? (info?.running ? '运行中' : '已启用') : '未启用'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2.5 py-1 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {expanded ? '收起配置' : '配置连接'}
          </button>
          <button
            onClick={toggle}
            disabled={busy || !info}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all active:scale-[0.98] cursor-pointer ${
              info?.enabled ? 'text-white' : 'border'
            }`}
            style={info?.enabled ? { backgroundColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {info?.enabled ? '已启用' : '已停用'} · {busy ? '…' : '切换'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2.5" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            在 VS Code 里安装 Aether 扩展后，填入下面的地址与 Token 即可连接当前桌面 App，复用已配置的模型/记忆/技能。
          </p>
          {info ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--text-muted)' }}>服务地址</span>
                <button
                  onClick={() => copy(`http://127.0.0.1:${info.port}`, '地址')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-[var(--bg-secondary)] transition-colors font-mono active:scale-[0.98] cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  http://127.0.0.1:{info.port} <Copy size={11} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--text-muted)' }}>访问 Token</span>
                <button
                  onClick={() => info.token && copy(info.token, 'Token')}
                  disabled={!info.token}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-[var(--bg-secondary)] transition-colors font-mono disabled:opacity-40 active:scale-[0.98] cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {info.token ? `${info.token.slice(0, 12)}…` : '—'} <Copy size={11} />
                </button>
              </div>
              <div className="text-[11px] font-medium pt-1" style={{ color: info.running ? 'var(--success)' : '#dc2626' }}>
                {info.running ? '● 运行中（仅本机可访问）' : '● 未运行（启用后生效）'}
              </div>
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>加载中…</p>
          )}
        </div>
      )}
    </div>
  )
}
