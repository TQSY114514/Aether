import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { ShieldCheck, Activity, Shield, Lock, ShieldAlert, Loader2, FolderOpen, SquareTerminal, Wifi, CheckCircle2, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 「安全面板」——让 Aether 的「默认安全」看得见：
//   1. 安全能力清单(静态, 展示默认开启的硬加固)
//   2. 能力轴(filesystem / shell / network 的 allow / ask / deny)
//   3. 最近 agent 活动(跨 session 审计轨迹)
//   4. safe mode 一键 + 关键安全 flag
// ─────────────────────────────────────────────────────────────────────────────

// 默认开启的硬安全加固(非 flag, 始终生效)—— 证明「默认安全」。
const SECURITY_CAPABILITIES: { name: string; desc: string }[] = [
  { name: '零外部遥测 (0-Telemetry)', desc: '100% 本地离线，无三方隐私埋点，审计日志完整保存在本地 SQLite' },
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

// 能力轴定义
type CapabilityValue = 'allow' | 'ask' | 'deny'
interface CapabilityAxis {
  key: string
  label: string
  icon: typeof FolderOpen
  desc: string
}
const CAPABILITY_AXES: CapabilityAxis[] = [
  { key: 'capability.filesystem', label: '文件系统', icon: FolderOpen, desc: 'read_file / write_file / edit_file 等文件操作' },
  { key: 'capability.shell', label: 'Shell', icon: SquareTerminal, desc: 'run_command 等命令执行' },
  { key: 'capability.network', label: '网络', icon: Wifi, desc: 'web_fetch / web_search 等网络访问' },
]
const CAPABILITY_OPTIONS: { value: CapabilityValue; label: string }[] = [
  { value: 'allow', label: '允许' },
  { value: 'ask', label: '询问' },
  { value: 'deny', label: '拒绝' },
]

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
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityValue>>({})
  const [capLoading, setCapLoading] = useState(true)

  const [rules, setRules] = useState<{ tool: string; ruleKey: string; decision: string; key: string }[]>([])
  const [newTool, setNewTool] = useState('run_command')
  const [newRuleKey, setNewRuleKey] = useState('')
  const [rulesLoading, setRulesLoading] = useState(false)

  const loadRules = async () => {
    setRulesLoading(true)
    try {
      const res = await window.electronAPI.chat.listPermissionRules()
      setRules(res?.persisted || [])
    } catch {
      setRules([])
    } finally {
      setRulesLoading(false)
    }
  }

  const handleAddRule = async () => {
    const k = newRuleKey.trim()
    if (!k) return
    try {
      await window.electronAPI.chat.savePermissionRule(newTool, k, 'allow')
      setNewRuleKey('')
      toast(`已添加自动允许规则: ${newTool} (${k})`, { type: 'success' })
      await loadRules()
    } catch {
      toast('添加规则失败', { type: 'error' })
    }
  }

  const handleRemoveRule = async (tool: string, rKey: string) => {
    try {
      await window.electronAPI.chat.removePermissionRule(tool, rKey)
      toast(`已移除规则: ${tool} (${rKey})`, { type: 'info' })
      await loadRules()
    } catch {
      toast('移除规则失败', { type: 'error' })
    }
  }

  const handleApplyPreset = async (preset: 'safe_git' | 'test_runners' | 'read_tools') => {
    try {
      const res = await window.electronAPI.chat.applyPermissionPreset(preset)
      toast(`已启用预设，添加了 ${res?.added ?? 0} 条安全规则`, { type: 'success' })
      await loadRules()
    } catch {
      toast('启用预设失败', { type: 'error' })
    }
  }

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

  const loadCapabilities = async () => {
    setCapLoading(true)
    try {
      const entries = await Promise.all(
        CAPABILITY_AXES.map(async (ax) => {
          const v = await window.electronAPI.settings.get(ax.key)
          return [ax.key, (v as CapabilityValue) || 'ask'] as [string, CapabilityValue]
        })
      )
      setCapabilities(Object.fromEntries(entries))
    } catch { /* ignore */ }
    setCapLoading(false)
  }

  useEffect(() => { load(); loadCapabilities(); loadRules() }, [])

  const setCapability = async (key: string, value: CapabilityValue) => {
    setCapabilities((prev) => ({ ...prev, [key]: value }))
    try {
      await window.electronAPI.settings.set(key, value)
    } catch {
      toast('保存失败', { type: 'error' })
      loadCapabilities()
    }
  }

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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
            一键安全默认 (safe mode)
          </button>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Aether 默认安全——以下加固始终开启，不需要配置。最近 agent 活动与安全开关在下方。
        </p>

        {/* 1. 安全能力清单 */}
        <div className="rounded-lg border p-4 mb-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-1.5 mb-3">
            <ShieldCheck size={15} style={{ color: 'var(--success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>默认安全能力</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SECURITY_CAPABILITIES.map((c) => (
              <div key={c.name} className="flex items-start gap-2 rounded-md px-2.5 py-2 border border-[var(--border)]" style={{ backgroundColor: 'var(--content-bg)' }}>
                <Lock size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                <div className="min-w-0">
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                  <div className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. 能力轴 */}
        <div className="rounded-lg border p-4 mb-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-1.5 mb-3">
            <ShieldAlert size={15} style={{ color: 'var(--warning)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>能力轴</span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
            控制 agent 在文件、Shell、网络三类能力上的默认行为。允许 = 自动执行，询问 = 每次确认，拒绝 = 直接拒绝。
          </p>
          {capLoading ? (
            <div className="text-center py-4 text-xs" style={{ color: 'var(--text-muted)' }}>加载中…</div>
          ) : (
            <div className="space-y-2">
              {CAPABILITY_AXES.map((ax) => {
                const Icon = ax.icon
                const current = capabilities[ax.key] || 'ask'
                return (
                  <div key={ax.key} className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 border border-[var(--border)]" style={{ backgroundColor: 'var(--content-bg)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon size={13} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
                      <div className="min-w-0">
                        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{ax.label}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{ax.desc}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 rounded-md p-0.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      {CAPABILITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setCapability(ax.key, opt.value)}
                          className="px-2.5 py-1 text-[11px] rounded-md transition-colors"
                          style={{
                            backgroundColor: current === opt.value ? 'var(--accent)' : 'transparent',
                            color: current === opt.value ? 'white' : 'var(--text-secondary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 3. 自动审批白名单规则 (Cline & Claude Code 对齐) */}
        <div className="rounded-lg border p-4 mb-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={15} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>自动审批规则 (Auto-Approval Whitelist)</span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">{rules.length} 条已保存规则</span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
            命中白名单的命令或操作将自动执行，无需反复弹窗确认（对齐 Cline / Claude Code）。受污染或高危操作除外。
          </p>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-[10px] text-[var(--text-muted)] mr-1">快捷预设:</span>
            <button
              onClick={() => handleApplyPreset('safe_git')}
              className="text-[10px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors press-scale"
            >
              + Git 安全只读 (status/diff/log)
            </button>
            <button
              onClick={() => handleApplyPreset('test_runners')}
              className="text-[10px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors press-scale"
            >
              + 测试运行器 (npm/cargo/pytest)
            </button>
            <button
              onClick={() => handleApplyPreset('read_tools')}
              className="text-[10px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors press-scale"
            >
              + 文件探索只读
            </button>
          </div>

          {/* Active Rules List */}
          {rulesLoading ? (
            <div className="text-center py-4 text-xs text-[var(--text-muted)]">加载规则中…</div>
          ) : rules.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--text-muted)] mb-3">
              暂无已保存的自动审批规则。在对话中点击“记住此规则”或点击上方快捷预设开启。
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-3 max-h-48 overflow-y-auto p-1">
              {rules.map((r) => (
                <div
                  key={r.key}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--border)] bg-[var(--content-bg)] text-[11px] font-mono"
                >
                  <span className="text-[var(--accent)] font-medium">{r.tool}:</span>
                  <span className="text-[var(--text-primary)]">{r.ruleKey}</span>
                  <button
                    onClick={() => handleRemoveRule(r.tool, r.ruleKey)}
                    className="ml-1 text-[var(--text-muted)] hover:text-red-500 transition-colors p-0.5"
                    title="移除此规则"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add custom rule form */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
            <select
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              className="text-[11px] rounded border border-[var(--border)] px-2 py-1 bg-[var(--content-bg)] text-[var(--text-primary)] outline-none"
            >
              <option value="run_command">run_command</option>
              <option value="write_file">write_file</option>
              <option value="edit_file">edit_file</option>
              <option value="read_file">read_file</option>
            </select>
            <input
              type="text"
              placeholder={newTool === 'run_command' ? '命令前缀，例如: git log 或 npm test' : '路径前缀或 *'}
              value={newRuleKey}
              onChange={(e) => setNewRuleKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddRule() }}
              className="flex-1 text-[11px] font-mono rounded border border-[var(--border)] px-2.5 py-1 bg-[var(--content-bg)] text-[var(--text-primary)] outline-none"
            />
            <button
              onClick={handleAddRule}
              disabled={!newRuleKey.trim()}
              className="px-3 py-1 rounded text-[11px] bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity press-scale shrink-0"
            >
              添加规则
            </button>
          </div>
        </div>

        {/* 4. 安全 flag */}
        {flags.length > 0 && (
          <div className="rounded-lg border p-4 mb-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-1.5 mb-3">
              <ShieldAlert size={15} style={{ color: 'var(--warning)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>安全开关（可调）</span>
            </div>
            <div className="space-y-1.5">
              {flags.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 border border-[var(--border)]" style={{ backgroundColor: 'var(--content-bg)' }}>
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

        {/* 4. 最近活动 */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Activity size={15} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>最近 agent 活动</span>
          </div>
          {loading ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>加载中…</div>
          ) : audit.length === 0 ? (
            <div className="rounded-lg border px-4 py-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
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