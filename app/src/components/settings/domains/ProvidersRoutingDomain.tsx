import { useStore } from '@/store'
import { Server, Sparkles, SlidersHorizontal } from 'lucide-react'
import { t } from '@/utils/i18n'
import DefaultChatSettings from '@/components/settings/DefaultChatSettings'
import type { EffortLevel } from '@/store/types'

const EFFORT_OPTIONS: { value: EffortLevel; labelKey: string; desc: string }[] = [
  { value: 'minimal', labelKey: 'effort.minimal', desc: '1k tokens · 极速推理' },
  { value: 'low', labelKey: 'effort.low', desc: '2k tokens · 单函数浅度思考' },
  { value: 'medium', labelKey: 'effort.medium', desc: '8k tokens · 标准工程推演 (默认)' },
  { value: 'high', labelKey: 'effort.high', desc: '16k tokens · 深度架构设计' },
  { value: 'max', labelKey: 'effort.max', desc: '32k tokens · 跨文件全景诊断' },
]

export default function ProvidersRoutingDomain() {
  const setCurrentView = useStore((s) => s.setCurrentView)
  const defaultEffort = useStore((s) => s.defaultEffort)
  const defaultThinkingEnabled = useStore((s) => s.defaultThinkingEnabled)
  const setDefaultEffort = useStore((s) => s.setDefaultEffort)
  const setDefaultThinkingEnabled = useStore((s) => s.setDefaultThinkingEnabled)

  return (
    <div className="space-y-4">
      {/* Quick link to Model Manager */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Server size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {t('sidebar.nav.models', '模型与服务商管理')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                配置 OpenAI、Claude、Gemini、DeepSeek、Ollama 及本地中继密钥与端点
              </p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView('models')}
            className="px-3.5 py-1.5 text-xs rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {t('common.manage', '前往管理')}
          </button>
        </div>
      </div>

      {/* Default Chat & Auto-Routing */}
      <DefaultChatSettings />

      {/* Default Reasoning & Thinking Budget */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.default_effort', '默认思考深度 (Thinking Tier)')}
            </h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-medium" style={{ color: defaultThinkingEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {defaultThinkingEnabled ? t('effort.on', '思考模式开启') : t('effort.off', '思考模式关闭')}
            </span>
            <div className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors duration-200 ease-in-out ${defaultThinkingEnabled ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
              <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white dark:bg-zinc-900 shadow transition duration-200 ease-in-out mt-[2px] ml-[2px] ${defaultThinkingEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <input
              type="checkbox"
              checked={defaultThinkingEnabled}
              onChange={(e) => setDefaultThinkingEnabled(e.target.checked)}
              className="hidden"
            />
          </label>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.default_effort_desc', '设置新建会话时默认使用的推理 Token 预算等级，适配 Hermes、OpenAI o-series、Claude 3.7 与 Gemini。')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" style={{ opacity: defaultThinkingEnabled ? 1 : 0.5 }}>
          {EFFORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              disabled={!defaultThinkingEnabled}
              onClick={() => setDefaultEffort(opt.value)}
              className={`text-left p-2.5 rounded-lg border text-xs transition-all active:scale-[0.98] ${
                defaultEffort === opt.value
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs'
                  : 'hover:bg-[var(--bg-secondary)]'
              }`}
              style={{
                borderColor: defaultEffort === opt.value ? 'var(--accent)' : 'var(--border)',
                backgroundColor: defaultEffort === opt.value ? 'var(--content-bg)' : 'transparent',
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                  {t(opt.labelKey as any, opt.value)}
                </span>
                {defaultEffort === opt.value && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
                    当前
                  </span>
                )}
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {opt.desc}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
