import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('UI error boundary caught:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  private handleReset = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, componentStack } = this.state;
    const isDev =
      (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE !== 'production';

    return (
      <div className="flex min-h-screen items-start justify-center bg-cream p-8">
        <div className="w-full max-w-lg rounded-card border border-forest/10 bg-white p-6 shadow-sm">
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-sage">
            Unexpected Error
          </div>
          <h1 className="font-display text-[22px] italic text-forest">Something went wrong</h1>
          <p className="mt-2 text-sm text-stone">
            The page hit an unexpected error. Reload to try again — your inputs are not saved.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 rounded bg-gold px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-forest shadow-gold transition-colors hover:bg-goldLight"
          >
            Reload the page
          </button>
          {isDev && error && (
            <details className="mt-4 text-[11px] text-stone">
              <summary className="cursor-pointer font-mono text-gold">
                Error details (dev only)
              </summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-cream p-2 font-mono text-ink">
                {error.message}
                {componentStack ? '\n\n' + componentStack : ''}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
