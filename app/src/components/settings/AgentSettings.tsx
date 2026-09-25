import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import {
  Shield,
  ShieldCheck,
  FolderOpen,
  FileText,
  Cpu,
  Zap,
  Brain,
  Code2,
  Sliders,
} from 'lucide-react'
import {
  AXIS_OPTIONS,
  type AxisPolicy,
  AXES,
  type FlagItem,
  EXEC_SELF_HEAL_FLAGS,
  CONTEXT_CACHE_FLAGS,
  INTEL_EVOLUTION_FLAGS,
} from './agentSettingsDefs'

function SwitchButton({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative w-10 h-5 rounded-full transition-colors shrink-0 cursor-pointer"
      style={{ backgroundColor: checked ? 'var(--accent)' : 'var(--border)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
        style={{ left: checked ? '20px' : '2px' }}
      />
    </button>
  )
}

export default function AgentSettings() {
  const { toast } = useUI()
  const [workspace, setWorkspace] = useState('')
  const [busy, setBusy] = useState(false)
  const [maxIter, setMaxIter] = useState(25)
  const [toolTimeoutSec, setToolTimeoutSec] = useState(60)
  const [microcompactEnabled, setMicrocompactEnabled] = useState(true)
  const [microcompactKeepRecent, setMicrocompactKeepRecent] = useState(5)
  const [cacheTtlMin, setCacheTtlMin] = useState(60)
  const [strictReadGuard, setStrictReadGuard] = useState(true)
  const [autoMemory, setAutoMemory] = useState(true)
  const [projectInst, setProjectInst] = useState<{ has: boolean; fileName: string | null }>({ has: false, fileName: null })
  const [axes, setAxes] = useState<Record<string, AxisPolicy | null>>({ filesystem: null, shell: null, network: null })
  const [flagMap, setFlagMap] = useState<Record<string, boolean>>({})

  const loadAllFlags = () => {
    try {
      window.electronAPI?.flags?.list?.().then((list) => {
        const next: Record<string, boolean> = {}
        for (const item of list || []) {
          next[item.key] = !!item.enabled
        }
        setFlagMap(next)
      }).catch(() => {})
    } catch {}
  }

  useEffect(() => {
    try { window.electronAPI?.agent?.getWorkspace?.().then(setWorkspace).catch(() => {}) } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_max_iterations').then((v) => {
        const n = Number(v)
        if (Number.isInteger(n) && n > 0) setMaxIter(n)
      }).catch(() => {})
    } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_tool_timeout_ms').then((v) => {
        const ms = Number(v)
        if (Number.isFinite(ms) && ms >= 5000) setToolTimeoutSec(Math.round(ms / 1000))
      }).catch(() => {})
    } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_microcompact_enabled').then((v) => {
        setMicrocompactEnabled(v !== '0')
      }).catch(() => {})
    } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_microcompact_keep_recent').then((v) => {
        const n = Number(v)
        if (Number.isInteger(n) && n >= 1 && n <= 30) setMicrocompactKeepRecent(n)
      }).catch(() => {})
    } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_cache_ttl_minutes').then((v) => {
        const n = Number(v)
        if (Number.isInteger(n) && n >= 5 && n <= 240) setCacheTtlMin(n)
      }).catch(() => {})
    } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_strict_read_before_edit').then((v) => {
        setStrictReadGuard(v !== '0')
      }).catch(() => {})
    } catch {}
    try { window.electronAPI?.settings?.get?.('auto_memory_enabled').then((v) => setAutoMemory(v !== '0')).catch(() => {}) } catch {}
    try { window.electronAPI?.agent?.hasProjectInstructions?.().then(setProjectInst).catch(() => {}) } catch {}
    loadAllFlags()
    try {
      Promise.all([
        window.electronAPI?.settings?.get?.('capability.filesystem').catch(() => null),
        window.electronAPI?.settings?.get?.('capability.shell').catch(() => null),
        window.electronAPI?.settings?.get?.('capability.network').catch(() => null),
      ]).then(([fs, sh, nw]) => {
        setAxes({
          filesystem: (AXIS_OPTIONS as readonly string[]).includes(fs || '') ? fs as AxisPolicy : null,
          shell: (AXIS_OPTIONS as readonly string[]).includes(sh || '') ? sh as AxisPolicy : null,
          network: (AXIS_OPTIONS as readonly string[]).includes(nw || '') ? nw as AxisPolicy : null,
        })
      })
    } catch {}
  }, [])

  const saveAxis = async (axis: string, v: AxisPolicy | null) => {
    setAxes((p) => ({ ...p, [axis]: v }))
    try {
      if (v) await window.electronAPI?.settings?.set?.(`capability.${axis}`, v)
      else await window.electronAPI?.settings?.set?.(`capability.${axis}`, '')
      toast(t('settings.agent.capability_set', t('capability.axis.' + axis), v ? t('capability.' + v) : t('settings.agent.capability_default')), { type: 'success' })
    } catch { toast(t('settings.agent.capability_failed'), { type: 'error' }) }
  }

  const saveMaxIter = async (v: number) => {
    const clamped = Math.max(1, Math.min(200, Math.floor(v)))
    setMaxIter(clamped)
    try { await window.electronAPI?.settings?.set?.('agent_max_iterations', String(clamped)) } catch {}
  }

  const saveToolTimeoutSec = async (sec: number) => {
    setToolTimeoutSec(sec)
    try { await window.electronAPI?.settings?.set?.('agent_tool_timeout_ms', String(sec * 1000)) } catch {}
  }

  const saveMicrocompactEnabled = async (v: boolean) => {
    setMicrocompactEnabled(v)
    try { await window.electronAPI?.settings?.set?.('agent_microcompact_enabled', v ? '1' : '0') } catch {}
  }

  const saveMicrocompactKeepRecent = async (n: number) => {
    setMicrocompactKeepRecent(n)
    try { await window.electronAPI?.settings?.set?.('agent_microcompact_keep_recent', String(n)) } catch {}
  }

  const saveCacheTtlMin = async (n: number) => {
    setCacheTtlMin(n)
    try { await window.electronAPI?.settings?.set?.('agent_cache_ttl_minutes', String(n)) } catch {}
  }

  const saveStrictReadGuard = async (v: boolean) => {
    setStrictReadGuard(v)
    try { await window.electronAPI?.settings?.set?.('agent_strict_read_before_edit', v ? '1' : '0') } catch {}
  }

  const saveAutoMemory = async (v: boolean) => {
    setAutoMemory(v)
    try { await window.electronAPI?.settings?.set?.('auto_memory_enabled', v ? '1' : '0') } catch {}
  }

  const toggleFeatureFlag = async (key: string, nextVal: boolean) => {
    setFlagMap((prev) => ({ ...prev, [key]: nextVal }))
    try {
      const r = await window.electronAPI?.flags?.set?.(key, nextVal)
      if (!r?.ok) {
        setFlagMap((prev) => ({ ...prev, [key]: !nextVal }))
      }
    } catch {
      setFlagMap((prev) => ({ ...prev, [key]: !nextVal }))
    }
  }

  const pickFolder = async () => {
    setBusy(true)
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.webkitdirectory = true
      input.onchange = () => {
        // @ts-expect-error .path is Electron-only
        const firstPath = input.files?.[0]?.path || ''
        const target = firstPath ? firstPath.replace(/[/\\][^/\\\\]*$/, '') : ''
        if (target) applyWorkspace(target)
      }
      input.click()
    } finally { setBusy(false) }
  }

  const applyWorkspace = async (dir: string | null) => {
    const res = await window.electronAPI.agent.setWorkspace({ dir })
    if (res?.success) {
      setWorkspace(res.root)
      toast(t('settings.agent.workspace_saved'), { type: 'success' })
    }
  }

  const resetToDefault = () => applyWorkspace(null)

  const [safeBusy, setSafeBusy] = useState(false)
  const applySafeMode = async () => {
    setSafeBusy(true)
    try {
      const r = await window.electronAPI?.flags?.safeMode?.()
      if (r?.ok) {
        loadAllFlags()
        toast(r.written.length > 0
          ? t('settings.agent.safe_mode_enabled', String(r.written.length))
          : t('settings.agent.safe_mode_already'), { type: 'success' })
      } else {
        toast(t('settings.agent.safe_mode_failed'), { type: 'error' })
      }
    } catch { toast(t('settings.agent.safe_mode_failed'), { type: 'error' }) }
    finally { setSafeBusy(false) }
  }

  const renderFlagList = (items: FlagItem[]) => (
    <div className="space-y-2.5">
      {items.map((item) => {
        const enabled = !!flagMap[item.key]
        return (
          <div
            key={item.key}
            className="flex items-start justify-between gap-3 p-2.5 rounded-lg border transition-colors"
            style={{
              borderColor: enabled ? 'var(--accent)' : 'var(--border)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {item.label}
                </span>
                {item.badge && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {item.desc}
              </p>
            </div>
            <SwitchButton
              checked={enabled}
              onChange={(next) => toggleFeatureFlag(item.key, next)}
              label={item.label}
            />
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* ── Card 1: Workspace Sandbox & 3-Axis Capability Policy ── */}
      <div className="rounded-lg p-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Shield size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.title')}</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.desc')}</p>

        <div className="space-y-3">
          {/* Workspace root picker */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.agent.workspace')}</label>
            <div className="flex items-center gap-2">
              <input readOnly value={workspace} placeholder={t('settings.agent.workspace_placeholder')}
                className="flex-1 px-3 py-2 text-xs rounded-lg border outline-none font-mono"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }} />
              <button onClick={pickFolder} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--border)' }}>
                <FolderOpen size={13} />{t('settings.agent.browse')}
              </button>
              <button onClick={resetToDefault} className="px-3 py-2 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>{t('settings.agent.reset')}</button>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.workspace_hint')}</p>
          </div>

          {/* Command blocklist — always on, informational */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Shield size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.blocklist')}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.blocklist_hint')}</p>
            </div>
          </div>

          {/* One-click safe mode */}
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-2">
              <ShieldCheck size={14} className="text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.safe_mode')}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.agent.safe_mode_desc')}
                </p>
              </div>
            </div>
            <button onClick={applySafeMode} disabled={safeBusy}
              className="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-50 transition-opacity shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}>
              {safeBusy ? '应用中…' : '应用'}
            </button>
          </div>

          {/* Capability axis policies — filesystem / shell / network */}
          <div className="p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={13} className="text-gray-400" />
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.capability_title')}</p>
            </div>
            <p className="text-[10px] mb-2.5" style={{ color: 'var(--text-muted)' }}>
              {t('settings.agent.capability_desc')}
            </p>
            <div className="space-y-2">
              {AXES.map((a) => {
                const Icon = a.icon
                const cur = axes[a.key] || ''
                return (
                  <div key={a.key} className="flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon size={13} className="text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{a.label}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{a.desc}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {AXIS_OPTIONS.map((opt) => (
                        <button key={opt} onClick={() => saveAxis(a.key, cur === opt ? null : opt)}
                          className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${cur === opt ? 'text-white' : ''}`}
                          style={cur === opt ? { backgroundColor: opt === 'deny' ? 'var(--error)' : opt === 'ask' ? '#d97706' : 'var(--accent)', borderColor: 'transparent' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                          {opt === 'allow' ? t('capability.allow') : opt === 'ask' ? t('capability.ask') : t('capability.deny')}{cur === opt ? ' ✓' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Project instructions status */}
          <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ backgroundColor: projectInst.has ? 'rgba(34,197,94,0.06)' : 'var(--bg-secondary)' }}>
            <FileText size={13} className={projectInst.has ? 'text-green-500 mt-0.5 shrink-0' : 'text-gray-400 mt-0.5 shrink-0'} />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.project_inst')}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {projectInst.has
                  ? t('settings.agent.project_inst_active', projectInst.fileName || '')
                  : t('settings.agent.project_inst_empty')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 2: Execution Loop & Self-Healing Engine (Hermes / ZCode Runtime) ── */}
      <div className="rounded-lg p-4 space-y-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              执行循环与自愈引擎 (Execution Loop & Self-Healing)
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Plan → Act → Observe
          </span>
        </div>

        {/* Max Iterations with presets */}
        <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.agent.max_iterations')}
            </label>
            <div className="flex items-center gap-1.5">
              {[
                { label: '15 轻量', val: 15 },
                { label: '25 标准', val: 25 },
                { label: '50 深度', val: 50 },
                { label: '100 自治', val: 100 },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => saveMaxIter(p.val)}
                  className="px-2 py-0.5 text-[10px] rounded border transition-colors font-mono"
                  style={
                    maxIter === p.val
                      ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                      : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                  }
                >
                  {p.label}
                </button>
              ))}
              <span className="text-xs font-mono font-semibold ml-1" style={{ color: 'var(--accent)' }}>
                {maxIter} 轮
              </span>
            </div>
          </div>
          <input
            type="range"
            min={3}
            max={120}
            step={1}
            value={maxIter}
            onChange={(e) => saveMaxIter(parseInt(e.target.value, 10))}
            className="effort-slider w-full"
            style={{ ['--fill' as string]: `${((maxIter - 3) / 117) * 100}%` }}
          />
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.max_iterations_hint')}</p>
        </div>

        {/* Per-tool execution timeout & strict read-before-edit guard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="p-2.5 rounded-lg border flex flex-col justify-between gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>单次工具执行超时 (Tool Timeout)</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>防止长阻塞命令或外部进程挂死整个 Agent 循环</p>
            </div>
            <div className="flex gap-1.5">
              {[30, 60, 120, 300].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => saveToolTimeoutSec(sec)}
                  className="flex-1 py-1 text-[11px] font-mono rounded border transition-colors"
                  style={
                    toolTimeoutSec === sec
                      ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                      : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                  }
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-lg border flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Sliders size={12} style={{ color: 'var(--accent)' }} />
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>8 级容错编辑 + 读后写 mtime 锁</p>
              </div>
              <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                强制先读后改、检测外部修改冲突，并自动剥离误抄行号前缀与还原弯引号
              </p>
            </div>
            <SwitchButton
              checked={strictReadGuard}
              onChange={saveStrictReadGuard}
              label="8 级容错编辑 + 读后写 mtime 锁"
            />
          </div>
        </div>

        {renderFlagList(EXEC_SELF_HEAL_FLAGS)}
      </div>

      {/* ── Card 3: Context Microcompact & Prompt Cache Engine (ZCode Architecture) ── */}
      <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              上下文微压缩与 Prompt Cache 引擎 (Microcompact & KV-Cache)
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Zero-LLM Cost
          </span>
        </div>

        <div className="p-3 rounded-lg border space-y-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                零 LLM 成本本地微压缩 (Local Microcompact)
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                在触发耗时耗 Token 的 LLM 摘要前，本地 0 延迟剥离早期轮次的巨型陈旧工具输出（保留错误与媒体块）
              </p>
            </div>
            <SwitchButton
              checked={microcompactEnabled}
              onChange={saveMicrocompactEnabled}
              label="零 LLM 成本本地微压缩"
            />
          </div>

          {microcompactEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  完整保留最近工具调用组数 (Keep Recent Groups)
                </p>
                <div className="flex gap-1.5">
                  {[3, 5, 8, 12].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => saveMicrocompactKeepRecent(n)}
                      className="flex-1 py-1 text-[11px] font-mono rounded border transition-colors"
                      style={
                        microcompactKeepRecent === n
                          ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                          : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                      }
                    >
                      {n} 轮{n === 5 ? ' (推荐)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Prompt Cache TTL 空闲过期清理阈值
                </p>
                <div className="flex gap-1.5">
                  {[30, 60, 120].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => saveCacheTtlMin(m)}
                      className="flex-1 py-1 text-[11px] font-mono rounded border transition-colors"
                      style={
                        cacheTtlMin === m
                          ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                          : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                      }
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {renderFlagList(CONTEXT_CACHE_FLAGS)}
      </div>

      {/* ── Card 4: Code Intelligence, Memory Evolution & Provider Resilience ── */}
      <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              代码情报、长期记忆与多模型容灾 (Code Intel & Self-Evolution)
            </h2>
          </div>
          <Code2 size={14} style={{ color: 'var(--text-muted)' }} />
        </div>

        {/* Auto long-term memory toggle */}
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.auto_memory')}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.auto_memory_hint')}</p>
          </div>
          <SwitchButton
            checked={autoMemory}
            onChange={saveAutoMemory}
            label={t('settings.agent.auto_memory')}
          />
        </div>

        {renderFlagList(INTEL_EVOLUTION_FLAGS)}
      </div>
    </div>
  )
}
