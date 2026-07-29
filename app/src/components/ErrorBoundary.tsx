import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-md text-center">
            <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Something went wrong</p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              {this.state.error.message}
            </p>
            <button onClick={this.handleReset}
              className="mt-4 px-4 py-2 rounded-lg text-sm text-white"
              style={{ backgroundColor: 'var(--accent)' }}>
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
