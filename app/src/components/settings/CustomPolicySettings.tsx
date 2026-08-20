import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { Shield, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'

const CATEGORIES = [
  { key: 'filesystem', label: '文件读', desc: '读取本地文件', icon: Shield },
  { key: 'write', label: '文件写', desc: '编辑/创建/打补丁', icon: ShieldAlert },
  { key: 'shell', label: 'Shell 命令', desc: '执行任意 shell 命令', icon: ShieldOff },
  { key: 'network', label: '网络访问', desc: 'web search/fetch', icon: Shield },
  { key: 'lsp', label: 'LSP', desc: '语言服务器操作', icon: ShieldCheck },
  { key: 'agent', label: 'Agent', desc: '子代理/后台任务', icon: ShieldAlert },
]

const POLICIES = ['allow', 'ask', 'deny'] as const
type Policy = typeof POLICIES[number]

const POLICY_LABELS: Record<Policy, string> = {
  allow: '放行',
  ask: '询问',
  deny: '拒绝',
}

const POLICY_COLORS: Record<Policy, string> = {
  allow: '#22c55e',
  ask: '#f59e0b',
  deny: '#ef4444',
}

export default function CustomPolicySettings() {
  const agentWorkspace = useStore((s) => s.agentWorkspace)

  // Read custom mode settings via IPC
  const [policies, setPolicies] = useState<Record<string, Policy>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const all = await window.electronAPI?.settings?.getAll?.()
        if (!cancelled && all) {
          const map: Record<string, Policy> = {}
          for (const cat of CATEGORIES) {
            const v = all[`custom_mode.${cat.key}`]
            if (v === 'allow' || v === 'ask' || v === 'deny') map[cat.key] = v
          }
          setPolicies(map)
        }
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [])

  const save = async (key: string, value: Policy) => {
    setPolicies(p => ({ ...p, [key]: value }))
    try {
      await window.electronAPI?.settings?.set?.(`custom_mode.${key}`, value)
    } catch {}
  }

  return (
    <div className="space-y-2">
      {CATEGORIES.map(cat => {
        const cur = policies[cat.key] || (cat.key === 'shell' || cat.key === 'write' || cat.key === 'agent' ? 'ask' : 'allow')
        const Icon = cat.icon
        return (
          <div key={cat.key} className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Icon size={13} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{cat.label}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{cat.desc}</p>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {POLICIES.map(p => (
                <button
                  key={p}
                  onClick={() => save(cat.key, p)}
                  className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${cur === p ? 'text-white' : ''}`}
                  style={cur === p ? { backgroundColor: POLICY_COLORS[p], borderColor: 'transparent' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {POLICY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <p className="text-[10px] pt-1" style={{ color: 'var(--text-muted)' }}>
        更改在切换到 Custom 模式时生效。Custom 模式从聊天栏 Agent 模式选择器切换。
      </p>
    </div>
  )
}
