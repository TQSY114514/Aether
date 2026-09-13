import { useMemo } from 'react'
import { useStore } from '@/store'
import { Sparkles, Keyboard, Cpu, Brain, MessageSquare, Code, FlaskConical, ShieldCheck, Terminal, FileText, Lightbulb, Compass } from 'lucide-react'
import { t } from '@/utils/i18n'

const POOL = [
  { icon: Lightbulb, titleKey: 'empty.example.explain', prompt: '用通俗的语言解释一下什么是向量数据库，以及它和传统数据库的区别' },
  { icon: FileText, titleKey: 'empty.example.write', prompt: '帮我写一封正式的请假邮件，说明下周三到周五因病请假' },
  { icon: Code, titleKey: 'empty.example.code', prompt: '用 Python 实现一个简单的 LRU 缓存类，带注释' },
  { icon: Compass, titleKey: 'empty.example.translate', prompt: '把这段话翻译成英文并润色得更地道：今天天气很好，适合出去散步' },
  { icon: Brain, titleKey: 'empty.example.brainstorm', prompt: '帮我头脑风暴 10 个适合大学生周末做的副业点子，附简要可行性' },
  { icon: MessageSquare, titleKey: 'empty.example.summarize', prompt: '把下面这段长文压缩成 3 个要点，用中文：[粘贴文本]' },
  { icon: Terminal, titleKey: 'empty.example.debug', prompt: '这段代码报错了，帮我找出原因并修复：[粘贴代码]' },
  { icon: Sparkles, titleKey: 'empty.example.teach', prompt: '用费曼学习法教我一个你假设我完全不懂的概念：区块链' },
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
  const thinkingEnabled = useStore((s) => s.thinkingEnabled)
  const defaultModelId = useStore((s) => s.defaultModelId)

  const startWith = async (prompt: string) => {
    if (!currentSessionId) await createSession()
    setTimeout(() => useStore.getState().sendMessage(prompt), 0)
  }

  const startWithRecipe = async (id: string, fallbackPrompt: string) => {
    try {
      const r = await window.electronAPI.recipe?.get?.(id)
      startWith(r?.prompt || fallbackPrompt)
    } catch {
      startWith(fallbackPrompt)
    }
  }

  const examples = useMemo(() => {
    const now = new Date()
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    const sid = currentSessionId || 0
    return pickFour(sid + dayOfYear)
  }, [currentSessionId])

  // 优先读当前会话已配置的模型(覆盖"有会话但无消息"的空窗口场景),
  // 无会话时回退到全局默认模型,最后回退到 primary/第一个。
  const activeModel = useMemo(() => {
    const sid = currentSessionId
    const cfgModelId = sid ? sessionConfigs[sid]?.modelId : null
    if (cfgModelId) {
      const found = allModels.find(m => m.id === cfgModelId)
      if (found) return found
    }
    if (defaultModelId) {
      const found = allModels.find(m => m.id === defaultModelId)
      if (found) return found
    }
    return allModels.find(m => m.is_primary) || allModels[0]
  }, [currentSessionId, sessionConfigs, defaultModelId, allModels])
  const effortLabel = { low: t('effort.low'), medium: t('effort.medium'), high: t('effort.high') }[effortLevel]
  const showEffort = thinkingEnabled

  return (
    <div className="w-full flex flex-col items-center justify-center px-4 pt-6 pb-4">
      <div className="w-full max-w-xl text-center">
        {/* Brand symbol */}
        <div className="w-10 h-10 rounded-lg border border-[var(--border)] flex items-center justify-center mx-auto mb-3.5 shrink-0 bg-[var(--bg-secondary)] shadow-sm">
          <Terminal size={18} className="text-[var(--text-primary)]" />
        </div>

        <h2 className="text-xl font-semibold mb-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {noSession ? t('chat.no_session') : t('empty.welcome')}
        </h2>
        <p className="text-xs mb-3.5 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
          {t('empty.subtitle')}
        </p>

        {/* Active model + thinking-effort hint */}
        {activeModel && (
          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Cpu size={11} className="text-[var(--text-muted)]" />{activeModel.display_name || activeModel.model_name}
            </span>
            {showEffort && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <Brain size={11} style={{ color: 'var(--accent)' }} />{t('empty.effort')}: {effortLabel}
              </span>
            )}
          </div>
        )}

        {noSession ? (
          <>
            {/* Onboarding Choices Grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-4 text-left">
              <button onClick={() => startWith('我想随意聊聊')}
                className="group flex items-start gap-2.5 p-3 rounded-md border transition-colors text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
                <MessageSquare size={16} className="text-[var(--text-muted)] mt-0.5 shrink-0 group-hover:text-[var(--text-primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>General Chat</div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>Ask questions, brainstorm, or write text</div>
                </div>
              </button>
              
              <button onClick={() => startWith('帮我写一段代码')}
                className="group flex items-start gap-2.5 p-3 rounded-md border transition-colors text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
                <Code size={16} className="text-[var(--text-muted)] mt-0.5 shrink-0 group-hover:text-[var(--text-primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Code & Agent</div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>Generate code, fix bugs, or run commands</div>
                </div>
              </button>

              <button onClick={() => { useStore.getState().setChatMode('arena'); createSession(); }}
                className="group flex items-start gap-2.5 p-3 rounded-md border transition-colors text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
                <FlaskConical size={16} className="text-[var(--text-muted)] mt-0.5 shrink-0 group-hover:text-[var(--text-primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Compare Models</div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>Run Arena mode to benchmark side-by-side</div>
                </div>
              </button>

              <button onClick={() => startWith('我想要连接本地模型（Ollama/LM Studio），请告诉我怎么设置')}
                className="group flex items-start gap-2.5 p-3 rounded-md border transition-colors text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
                <ShieldCheck size={16} className="text-[var(--text-muted)] mt-0.5 shrink-0 group-hover:text-[var(--text-primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Use Local Model</div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>Keep data offline with Ollama or LM Studio</div>
                </div>
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 mb-4 text-left">
            {examples.map((ex) => {
              const Icon = ex.icon
              return (
                <button key={ex.titleKey} onClick={() => startWith(ex.prompt)}
                  className="group flex items-start gap-2.5 p-3 rounded-md border transition-colors text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
                  <Icon size={16} className="text-[var(--text-muted)] mt-0.5 shrink-0 group-hover:text-[var(--text-primary)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{t(ex.titleKey)}</div>
                    <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>{ex.prompt}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Quick recipe shortcuts (P1-07 Curated Recipes) */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>配方直达:</span>
          {[
            { id: 'fix-failing-tests', label: '修测试', fallback: '请执行项目测试命令（如 npm test / pytest），定位所有失败或异常的用例。阅读相关代码与堆栈信息，做出最小化修复，并重新运行测试直到全部通过。最后总结修复原因。' },
            { id: 'git-commit-craft', label: '写提交', fallback: '请运行 git diff 检查当前所有未暂存和暂存的代码变更。分析改动的核心意图、影响范围，按照 Conventional Commits 规范生成清晰规范的提交信息。' },
            { id: 'pr-review-audit', label: '审 PR', fallback: '请检查当前分支与基准分支之间的差异文件列表与 diff。逐一审查架构坏味道、内存泄漏、安全注入风险与编码规范，输出详细评审报告。' },
            { id: 'security-vulnerability-scan', label: '安全排查', fallback: '全面扫描代码库：检查是否存在硬编码的 API Key、私钥文件、未做边界检查的路径操作。输出详细的安全评估报告并给出加固建议。' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => startWithRecipe(item.id, item.fallback)}
              className="px-2.5 py-1 text-xs rounded-lg border transition-colors motion-reduce:transition-none hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-secondary))', color: 'var(--text-secondary)' }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Quick actions / keyboard hints */}
        <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><Keyboard size={12} /> {t('empty.hint.new')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>{t('empty.hint.newline')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>{t('empty.hint.slash')}</span>
        </div>

        {noSession && (
          <div className="mt-4">
            <button onClick={() => createSession()} className="px-5 py-2.5 text-white text-sm rounded-lg hover:opacity-90 transition-all shadow-lg"
              style={{ backgroundColor: 'var(--accent)', boxShadow: '0 4px 12px -2px var(--accent)' }}>{t('chat.create')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
