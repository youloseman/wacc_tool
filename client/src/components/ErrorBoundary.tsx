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
    const isDev = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE !== 'production';

    return (
      <div className="flex min-h-screen items-start justify-center bg-surface p-8">
        <div className="w-full max-w-lg rounded border border-red-300 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-navy">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-700">
            The page hit an unexpected error. Reload to try again — your inputs are not saved.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-3 rounded border border-navy bg-navy px-3 py-1.5 text-sm text-white hover:bg-[#002770]"
          >
            Reload the page
          </button>
          {isDev && error && (
            <details className="mt-4 text-[11px] text-slate-600">
              <summary className="cursor-pointer font-mono">Error details (dev only)</summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-surface p-2">
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
