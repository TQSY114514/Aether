import { useStore } from '@/store'
import { Terminal, FlaskConical, Keyboard, Server } from 'lucide-react'
import { t } from '@/utils/i18n'

/** Render a calm, minimal workbench empty state with focused quick actions. */
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

  return (
    <div className="w-full flex flex-col items-center justify-center px-4 py-6 select-none pb-10">
      <div className="w-full max-w-md text-center">
        {/* Minimal brand mark */}
        <div className="w-8 h-8 rounded-md border border-[var(--border)] flex items-center justify-center mx-auto mb-3 shrink-0 bg-[var(--bg-secondary)]">
          <Terminal size={15} className="text-[var(--text-primary)]" />
        </div>

        <h2 className="text-base font-semibold mb-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {t('empty.welcome')}
        </h2>
        <p className="text-xs mb-5 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
          {t('empty.subtitle')}
        </p>

        {/* Zero-provider notice */}
        {providers.length === 0 && (
          <div className="mb-5 p-3 rounded-md border flex items-center justify-between gap-3 text-left" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="min-w-0">
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('empty.no_provider.title')}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('empty.no_provider.desc')}</div>
            </div>
            <button
              type="button"
              onClick={openModelSettings}
              className="px-3 py-1.5 text-xs rounded-md font-medium text-white shrink-0 transition-opacity hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {t('empty.no_provider.action')}
            </button>
          </div>
        )}

        {/* Single compact row of high-signal actions */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {[
            { id: 'fix-failing-tests', label: t('empty.recipe.fix_tests'), fallback: '请执行项目测试命令（如 npm test / pytest），定位所有失败或异常的用例，做出最小化修复并重新运行测试直到全部通过。' },
            { id: 'pr-review-audit', label: t('empty.recipe.review_diff'), fallback: '请检查当前分支与基准分支之间的差异文件列表与 diff，逐一审查架构问题、边界异常与安全风险，输出简要评审报告。' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => startWithRecipe(item.id, item.fallback)}
              className="px-2.5 py-1 rounded-[6px] border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCurrentView('arena')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
          >
            <FlaskConical size={11} />
            <span>{t('empty.shortcut.arena')}</span>
          </button>
          <button
            type="button"
            onClick={openModelSettings}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
          >
            <Server size={11} />
            <span>{t('empty.shortcut.models')}</span>
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-2.5 text-[10.5px] opacity-75" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><Keyboard size={11} /> {t('empty.hint.new')}</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>{t('empty.hint.newline')}</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>{t('empty.hint.slash')}</span>
        </div>
      </div>
    </div>
  )
}
