import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { ShieldCheck, Activity, Shield, Lock, ShieldAlert, Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 「安全面板」——让 Aether 的「默认安全」看得见：
//   1. 安全能力清单(静态, 展示默认开启的硬加固)
//   2. 最近 agent 活动(跨 session 审计轨迹)
//   3. safe mode 一键 + 关键安全 flag
// ─────────────────────────────────────────────────────────────────────────────

// 默认开启的硬安全加固(非 flag, 始终生效)—— 证明「默认安全」。
const SECURITY_CAPABILITIES: { name: string; desc: string }[] = [
  { name: '命令白名单沙箱', desc: '默认拒绝非白名单命令，多段命令逐段校验' },
  { name: '敏感路径写保护', desc: '.aetherai/hooks、.git、.ssh 等默认拒写' },
  { name: '权限阶梯', desc: 'plan / 只读 / ask / 完全访问，危险工具需确认' },
  { name: 'API 密钥打码', desc: '列表与导出默认脱敏，内部解密通道分离' },
  { name: 'Prompt 注入防御', desc: '外部内容消毒 + 中文注入模式库' },
  { name: '记忆来源隔离', desc: '外部不可信内容降权、不持久化' },
  { name: 'MCP 安装确认', desc: '原生确认对话框 + runtime 白名单' },
  { name: '更新确认', desc: '不静默下载安装，需用户显式触发' },
  { name: 'SSRF / 网络防护', desc: '私网与 IPv6-mapped 地址拦截' },
  { name: '窗口 / CSP 加固', desc: '外链走系统浏览器，CSP 限制资源加载' },
]

// 在面板里展示的关键安全 flag（feature_flag.* 中的那些）。
const SECURITY_FLAGS = ['agent.toolRouter', 'agent.worktreeIsolation', 'agent.backgroundReview', 'network.policy']

interface AuditRow {
  id: number
  session_id: number
  turn_id: number
  created_at: string
  payload: { toolCalls?: { name: string }[]; finalStatus?: string }
}

export default function SecurityPage() {
  const { toast } = useUI()
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [flags, setFlags] = useState<{ key: string; enabled: boolean; description: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [rows, fl] = await Promise.all([
        window.electronAPI.learning.recentAudit(30),
        window.electronAPI.flags.list(),
      ])
      setAudit(rows || [])
      setFlags((fl || []).filter((f) => SECURITY_FLAGS.includes(f.key)))
    } catch { setAudit([]); setFlags([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const applySafeMode = async () => {
    setBusy(true)
    try {
      const res = await window.electronAPI.flags.safeMode()
      toast(`已写入安全默认，关闭 ${res?.written?.length ?? 0} 项实验能力`, { type: 'success' })
      await load()
    } catch { toast('safe mode 执行失败', { type: 'error' }) }
    finally { setBusy(false) }
  }

  const toggleFlag = async (key: string, next: boolean) => {
    try {
      await window.electronAPI.flags.set(key, next)
      await load()
    } catch { toast('切换失败', { type: 'error' }) }
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>安全</h1>
          <button onClick={applySafeMode} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
            一键安全默认 (safe mode)
          </button>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Aether 默认安全——以下加固始终开启，不需要配置。最近 agent 活动与安全开关在下方。
        </p>

        {/* 1. 安全能力清单 */}
        <div className="rounded-xl border p-4 mb-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-1.5 mb-3">
            <ShieldCheck size={15} style={{ color: 'var(--success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>默认安全能力</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SECURITY_CAPABILITIES.map((c) => (
              <div key={c.name} className="flex items-start gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--content-bg)' }}>
                <Lock size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                <div className="min-w-0">
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                  <div className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. 安全 flag */}
        {flags.length > 0 && (
          <div className="rounded-xl border p-4 mb-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-1.5 mb-3">
              <ShieldAlert size={15} style={{ color: 'var(--warning)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>安全开关（可调）</span>
            </div>
            <div className="space-y-1.5">
              {flags.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: 'var(--content-bg)' }}>
                  <div className="min-w-0">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{f.key}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{f.description}</div>
                  </div>
                  <button onClick={() => toggleFlag(f.key, !f.enabled)}
                    className="shrink-0 w-8 h-4 rounded-full relative transition-colors"
                    style={{ backgroundColor: f.enabled ? 'var(--success)' : 'var(--border)' }}>
                    <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: f.enabled ? '18px' : '2px' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. 最近活动 */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Activity size={15} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>最近 agent 活动</span>
          </div>
          {loading ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>加载中…</div>
          ) : audit.length === 0 ? (
            <div className="rounded-xl border px-4 py-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              还没有 agent 活动记录。开个工具循环任务后这里会显示每次调用。
            </div>
          ) : (
            <div className="space-y-1.5">
              {audit.map((a) => {
                const tools = (a.payload?.toolCalls || []).map((t) => t.name)
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="min-w-0">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>会话 #{a.session_id}</span>
                      <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>{(a.created_at || '').slice(0, 16)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end max-w-[60%]">
                      {tools.length === 0 ? (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : tools.slice(0, 4).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--content-bg)', color: 'var(--text-secondary)' }}>{t}</span>
                      ))}
                      {tools.length > 4 && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>+{tools.length - 4}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}