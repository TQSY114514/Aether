import { Component, ReactNode } from 'react'

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
      return (
        <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="text-center max-w-md">
            <div className="text-4xl mb-3">😵</div>
            <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Something went wrong</h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button onClick={this.handleReset} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
