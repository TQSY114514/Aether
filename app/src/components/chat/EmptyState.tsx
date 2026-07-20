import { useMemo } from 'react'
import { useStore } from '@/store'
import { Sparkles, Keyboard, Cpu, Brain } from 'lucide-react'
import { t } from '@/utils/i18n'

const POOL = [
  { icon: '💡', titleKey: 'empty.example.explain', prompt: '用通俗的语言解释一下什么是向量数据库，以及它和传统数据库的区别' },
  { icon: '✍️', titleKey: 'empty.example.write', prompt: '帮我写一封正式的请假邮件，说明下周三到周五因病请假' },
  { icon: '💻', titleKey: 'empty.example.code', prompt: '用 Python 实现一个简单的 LRU 缓存类，带注释' },
  { icon: '🌍', titleKey: 'empty.example.translate', prompt: '把这段话翻译成英文并润色得更地道：今天天气很好，适合出去散步' },
  { icon: '🧠', titleKey: 'empty.example.brainstorm', prompt: '帮我头脑风暴 10 个适合大学生周末做的副业点子，附简要可行性' },
  { icon: '📚', titleKey: 'empty.example.summarize', prompt: '把下面这段长文压缩成 3 个要点，用中文：[粘贴文本]' },
  { icon: '🐛', titleKey: 'empty.example.debug', prompt: '这段代码报错了，帮我找出原因并修复：[粘贴代码]' },
  { icon: '🎓', titleKey: 'empty.example.teach', prompt: '用费曼学习法教我一个你假设我完全不懂的概念：区块链' },
]

function pickFour(seed: number): typeof POOL {
  const start = seed % POOL.length
  const out = []
  for (let i = 0; i < 4; i++) out.push(POOL[(start + i) % POOL.length])
  return out
}

export default function EmptyState({ noSession = false }: { noSession?: boolean }) {
  const createSession = useStore((s) => s.createSession)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const allModels = useStore((s) => s.allModels)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const effortLevel = useStore((s) => s.effortLevel)

  const startWith = async (prompt: string) => {
    if (!currentSessionId) await createSession()
    setTimeout(() => useStore.getState().sendMessage(prompt), 0)
  }

  const examples = useMemo(() => {
    const now = new Date()
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    const sid = currentSessionId || 0
    return pickFour(sid + dayOfYear)
  }, [currentSessionId])

  const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
  const activeModel = allModels.find(m => m.id === cfg?.modelId) || allModels.find(m => m.is_primary) || allModels[0]
  const effortLabel = { off: t('effort.off'), low: t('effort.low'), medium: t('effort.medium'), high: t('effort.high') }[effortLevel]

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl text-center animate-blur-fade">
        {/* Hero icon with pulse animation */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 relative animate-pulse-glow"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 10px 30px -10px var(--accent)' }}>
          <Sparkles size={28} className="text-white" />
        </div>

        <h2 className="text-2xl font-semibold mb-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {noSession ? t('chat.no_session') : t('empty.welcome')}
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          {t('empty.subtitle')}
        </p>

        {/* Active model + thinking-effort hint */}
        {activeModel && (
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Cpu size={11} className="text-gray-400" />{activeModel.display_name || activeModel.model_name}
            </span>
            {effortLevel !== 'off' && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <Brain size={11} style={{ color: 'var(--accent)' }} />{t('empty.effort')}: {effortLabel}
              </span>
            )}
          </div>
        )}

        {/* Example prompt grid with hover animations */}
        {!noSession && (
          <div className="grid grid-cols-2 gap-3 mb-8 text-left">
            {examples.map((ex, i) => (
              <button key={ex.titleKey} onClick={() => startWith(ex.prompt)}
                className="group flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left hover:shadow-md hover:-translate-y-0.5"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-secondary))', animationDelay: `${i * 50}ms` }}>
                <span className="text-lg leading-none mt-0.5 group-hover:scale-110 transition-transform">{ex.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{t(ex.titleKey)}</div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>{ex.prompt}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Quick actions / keyboard hints */}
        <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><Keyboard size={12} /> {t('empty.hint.new')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>{t('empty.hint.newline')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>{t('empty.hint.slash')}</span>
        </div>

        {noSession && (
          <div className="mt-6">
            <button onClick={() => createSession()} className="px-5 py-2.5 text-white text-sm rounded-xl hover:opacity-90 transition-all shadow-lg"
              style={{ backgroundColor: 'var(--accent)', boxShadow: '0 4px 12px -2px var(--accent)' }}>{t('chat.create')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
