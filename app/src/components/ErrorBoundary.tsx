import { Component, type ReactNode, type ErrorInfo } from 'react'
import { t } from '@/utils/i18n'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null; copied: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => this.setState({ error: null, copied: false })

  handleCopy = async () => {
    const err = this.state.error
    if (!err) return
    try {
      await navigator.clipboard.writeText(`${err.message}\n\n${err.stack || ''}`)
    } catch {}
    this.setState({ copied: true })
    setTimeout(() => this.setState({ copied: false }), 2000)
  }

  render() {
    if (this.state.error) {
      const err = this.state.error
      return this.props.fallback ?? (
        <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-md text-center">
            <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{t('error.boundary.title')}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              {t('error.boundary.message')}
            </p>
            <details className="mt-3 text-left">
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>{t('error.boundary.details')}</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-left max-h-60 overflow-y-auto"
                style={{ color: 'var(--text-muted)' }}>
                {err.message}
                {err.stack ? `\n\n${err.stack}` : ''}
              </pre>
            </details>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button onClick={this.handleCopy}
                className="px-4 py-2 rounded-lg text-sm border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                {this.state.copied ? t('error.boundary.copied') : t('error.boundary.copy')}
              </button>
              <button onClick={this.handleReset}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ backgroundColor: 'var(--accent)' }}>
                {t('chat.retry')}
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
