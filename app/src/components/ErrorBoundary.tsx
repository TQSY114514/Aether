import { Component, ReactNode } from 'react'
import { t } from '@/utils/i18n'

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error, info)
  }

  handleReset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      const isDev = import.meta.env?.DEV
      return (
        <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="text-center max-w-md">
            <div className="text-4xl mb-3">😵</div>
            <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('error.title')}</h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              {this.state.error?.message || t('error.unknown')}
            </p>
            {isDev && this.state.error?.stack && (
              <pre className="text-left text-[10px] mb-3 p-3 rounded-lg overflow-auto max-h-48" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                {this.state.error.stack}
              </pre>
            )}
            <button onClick={this.handleReset} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {t('error.retry')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
