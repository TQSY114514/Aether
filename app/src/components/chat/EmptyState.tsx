import { useMemo } from 'react'
import { useStore } from '@/store'
import { Terminal, MessageSquare, Code, FlaskConical, ShieldCheck, FileText, Lightbulb, Compass, Brain } from 'lucide-react'
import { t } from '@/utils/i18n'

const POOL = [
  { icon: Lightbulb, titleKey: 'empty.example.explain', prompt: '解释向量数据库与传统数据库的区别' },
  { icon: FileText, titleKey: 'empty.example.write', prompt: '帮我写一封正式的请假邮件说明情况' },
  { icon: Code, titleKey: 'empty.example.code', prompt: '用 Python 实现一个带 LRU 淘汰的缓存类' },
  { icon: Compass, titleKey: 'empty.example.translate', prompt: '把这段文字翻译成地道的英文' },
  { icon: Brain, titleKey: 'empty.example.brainstorm', prompt: '头脑风暴 5 个轻量级开源工具的点子' },
  { icon: MessageSquare, titleKey: 'empty.example.summarize', prompt: '将长文内容压缩提炼为 3 个关键要点' },
  { icon: Terminal, titleKey: 'empty.example.debug', prompt: '排查这段代码中的逻辑错误与潜在异常' },
]

function pickFour(seed: number): typeof POOL {
  const start = seed % POOL.length
  const out = []
  for (let i = 0; i < 4; i++) out.push(POOL[(start + i) % POOL.length])
  return out
}

/** Render a compact, workbench-style empty state that stays clear of input popovers. */
export default function EmptyState({ noSession = false }: { noSession?: boolean }) {
  const createSession = useStore((s) => s.createSession)
  const currentSessionId = useStore((s) => s.currentSessionId)

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

  return (
    <div className="w-full flex flex-col items-center justify-center px-4 py-3 select-none mb-8">
      <div className="w-full max-w-lg text-center">
        {/* Brand symbol */}
        <div className="w-8 h-8 rounded-md border border-[var(--border)] flex items-center justify-center mx-auto mb-2.5 shrink-0 bg-[var(--bg-secondary)] shadow-sm">
          <Terminal size={15} className="text-[var(--text-primary)]" />
        </div>

        <h2 className="text-sm font-semibold mb-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {noSession ? t('chat.no_session') : t('empty.welcome')}
        </h2>
        <p className="text-[11px] mb-3 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
          {t('empty.subtitle')}
        </p>

        {noSession ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3 text-left">
              <button
                onClick={() => startWith('我想随意聊聊')}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-primary))' }}
              >
                <MessageSquare size={13} className="text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-primary)]" />
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>常规问答与对话</span>
              </button>

              <button
                onClick={() => startWith('帮我写一段代码')}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-primary))' }}
              >
                <Code size={13} className="text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-primary)]" />
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>编写与调试代码</span>
              </button>

              <button
                onClick={() => { useStore.getState().setChatMode('arena'); createSession(); }}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-primary))' }}
              >
                <FlaskConical size={13} className="text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-primary)]" />
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>多模型竞技对比</span>
              </button>

              <button
                onClick={() => startWith('我想要连接本地模型（Ollama/LM Studio），请告诉我怎么设置')}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-primary))' }}
              >
                <ShieldCheck size={13} className="text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-primary)]" />
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>本地离线模型配置</span>
              </button>
            </div>
            <div>
              <button
                onClick={() => createSession()}
                className="px-3.5 py-1.5 text-white text-xs font-medium rounded-md hover:opacity-90 transition-all shadow-sm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {t('chat.create')}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Compact suggestion chips */}
            <div className="grid grid-cols-2 gap-2 mb-3 text-left">
              {examples.map((ex) => {
                const Icon = ex.icon
                return (
                  <button
                    key={ex.titleKey}
                    onClick={() => startWith(ex.prompt)}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all text-left hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)] min-w-0"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-primary))' }}
                    title={ex.prompt}
                  >
                    <Icon size={13} className="text-[var(--text-muted)] shrink-0 group-hover:text-[var(--accent)] transition-colors" />
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                      {ex.prompt}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Quick recipe shortcuts */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[11px] font-medium mr-0.5" style={{ color: 'var(--text-muted)' }}>配方:</span>
              {[
                { id: 'fix-failing-tests', label: '修测试', fallback: '请执行项目测试命令（如 npm test / pytest），定位所有失败或异常的用例。阅读相关代码与堆栈信息，做出最小化修复，并重新运行测试直到全部通过。最后总结修复原因。' },
                { id: 'git-commit-craft', label: '写提交', fallback: '请运行 git diff 检查当前所有未暂存和暂存的代码变更。分析改动的核心意图、影响范围，按照 Conventional Commits 规范生成清晰规范的提交信息。' },
                { id: 'pr-review-audit', label: '审 PR', fallback: '请检查当前分支与基准分支之间的差异文件列表与 diff。逐一审查架构坏味道、内存泄漏、安全注入风险与编码规范，输出详细评审报告。' },
                { id: 'security-vulnerability-scan', label: '安全排查', fallback: '全面扫描代码库：检查是否存在硬编码的 API Key、私钥文件、未做边界检查的路径操作。输出详细的安全评估报告并给出加固建议。' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => startWithRecipe(item.id, item.fallback)}
                  className="px-2 py-0.5 text-[11px] rounded-md border transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-95"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg, var(--bg-secondary))', color: 'var(--text-secondary)' }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
