import { useMemo } from 'react'
import { useStore } from '@/store'
import { Terminal, MessageSquare, Code, FlaskConical, FileText, Lightbulb, Compass, Brain, Keyboard, Server } from 'lucide-react'
import { t } from '@/utils/i18n'

const POOL = [
  { icon: Terminal, titleKey: 'empty.example.debug', prompt: '排查当前工作区代码中的逻辑错误与潜在异常' },
  { icon: Code, titleKey: 'empty.example.code', prompt: '分析当前项目架构并梳理核心模块的职责边界' },
  { icon: Lightbulb, titleKey: 'empty.example.explain', prompt: '解释向量数据库与传统关系型数据库的核心差异与选型依据' },
  { icon: FileText, titleKey: 'empty.example.write', prompt: '根据当前改动编写一份清晰的技术设计说明与变更摘要' },
  { icon: Compass, titleKey: 'empty.example.translate', prompt: '将这段技术文档翻译为地道、准确的双语说明' },
  { icon: Brain, titleKey: 'empty.example.brainstorm', prompt: '针对当前工程的性能瓶颈给出 3 个可落地的优化方案' },
  { icon: MessageSquare, titleKey: 'empty.example.summarize', prompt: '将长文或代码模块压缩提炼为 3 个关键架构要点' },
]

function pickFour(seed: number): typeof POOL {
  const start = seed % POOL.length
  const out = []
  for (let i = 0; i < 4; i++) out.push(POOL[(start + i) % POOL.length])
  return out
}

/** Render unified workbench quick-starts and recipe shortcuts in an empty chat. */
export default function EmptyState({ noSession: _noSession = false }: { noSession?: boolean }) {
  const createSession = useStore((s) => s.createSession)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const providers = useStore((s) => s.providers)

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

  const openModelSettings = () => {
    setCurrentView('settings')
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('aether:settings-tab', { detail: 'providers-routing' }))
    }, 30)
  }

  const examples = useMemo(() => {
    const now = new Date()
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    const sid = currentSessionId || 0
    return pickFour(sid + dayOfYear)
  }, [currentSessionId])

  return (
    <div className="w-full flex flex-col items-center justify-center px-4 py-4 select-none pb-10">
      <div className="w-full max-w-lg text-center">
        {/* Brand symbol */}
        <div className="w-9 h-9 rounded-md border border-[var(--border)] flex items-center justify-center mx-auto mb-3 shrink-0 bg-[var(--bg-secondary)]">
          <Terminal size={17} className="text-[var(--text-primary)]" />
        </div>

        <h2 className="text-base font-semibold mb-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {t('empty.welcome')}
        </h2>
        <p className="text-xs mb-4 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
          {t('empty.subtitle')}
        </p>

        {/* Zero-provider notice */}
        {providers.length === 0 && (
          <div className="mb-4 p-3 rounded-md border flex items-center justify-between gap-3 text-left" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="min-w-0">
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>尚未配置模型服务商</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>支持接入 OpenAI / Anthropic / DeepSeek 或一键连接本地 Ollama</div>
            </div>
            <button
              type="button"
              onClick={openModelSettings}
              className="px-3 py-1.5 text-xs rounded-md font-medium text-white shrink-0 transition-opacity hover:opacity-90 active:scale-[0.98] cursor-pointer"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              配置模型
            </button>
          </div>
        )}

        {/* Unified Prompt Cards */}
        <div className="grid grid-cols-2 gap-2.5 mb-4 text-left">
          {examples.map((ex) => {
            const Icon = ex.icon
            return (
              <button
                key={ex.titleKey}
                type="button"
                onClick={() => startWith(ex.prompt)}
                className="group flex items-start gap-2.5 p-3 rounded-md border transition-colors text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              >
                <Icon size={15} className="text-[var(--text-muted)] mt-0.5 shrink-0 group-hover:text-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{t(ex.titleKey)}</div>
                  <div className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>{ex.prompt}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Quick recipe shortcuts & Workbench direct navigation */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
          <span className="text-[11px] font-medium mr-0.5" style={{ color: 'var(--text-muted)' }}>快捷工作流:</span>
          {[
            { id: 'fix-failing-tests', label: '修测试', fallback: '请执行项目测试命令（如 npm test / pytest），定位所有失败或异常的用例。阅读相关代码与堆栈信息，做出最小化修复，并重新运行测试直到全部通过。最后总结修复原因。' },
            { id: 'git-commit-craft', label: '写提交', fallback: '请运行 git diff 检查当前所有未暂存和暂存的代码变更。分析改动的核心意图、影响范围，按照 Conventional Commits 规范生成清晰规范的提交信息。' },
            { id: 'pr-review-audit', label: '审改动', fallback: '请检查当前分支与基准分支之间的差异文件列表与 diff。逐一审查架构坏味道、内存泄漏、安全注入风险与编码规范，输出详细评审报告。' },
            { id: 'security-vulnerability-scan', label: '安全排查', fallback: '全面扫描代码库：检查是否存在硬编码的 API Key、私钥文件、未做边界检查的路径操作。输出详细的安全评估报告并给出加固建议。' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => startWithRecipe(item.id, item.fallback)}
              className="px-2 py-0.5 text-[11px] rounded-md border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-secondary))', color: 'var(--text-secondary)' }}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCurrentView('arena')}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-secondary))', color: 'var(--text-secondary)' }}
          >
            <FlaskConical size={11} />
            <span>双模型竞技场</span>
          </button>
          <button
            type="button"
            onClick={openModelSettings}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-secondary))', color: 'var(--text-secondary)' }}
          >
            <Server size={11} />
            <span>模型与 Ollama</span>
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><Keyboard size={12} /> {t('empty.hint.new')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>{t('empty.hint.newline')}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>{t('empty.hint.slash')}</span>
        </div>
      </div>
    </div>
  )
}
