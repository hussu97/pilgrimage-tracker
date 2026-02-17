import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch React rendering errors.
 * Displays a fallback UI instead of unmounting the entire app.
 *
 * Usage: Wrap at the router level or around critical sections.
 * Note: Error boundaries do NOT catch errors in:
 * - Event handlers (use try/catch)
 * - Async code (use try/catch)
 * - Server-side rendering
 * - Errors in the error boundary itself
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // TODO: In production, send error to logging service (Sentry, LogRocket, etc.)
    // Example:
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-dark-bg px-6">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-3xl">
                error
              </span>
            </div>
            <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-text-muted dark:text-dark-text-secondary mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-gray-200 dark:bg-dark-surface hover:bg-gray-300 dark:hover:bg-dark-surface/80 text-text-main dark:text-white rounded-xl font-semibold transition-colors"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
