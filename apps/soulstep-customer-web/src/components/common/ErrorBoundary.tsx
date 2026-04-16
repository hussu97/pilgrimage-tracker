'use client';

import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import * as Sentry from '@sentry/nextjs';
import { I18nContext } from '@/app/providers';

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
    // Detect stale-deployment chunk errors and hard-reload once as a safety net.
    // lazyWithReload() in routes.tsx handles the primary case; this catches anything
    // that slips through (e.g. dynamic imports outside of route lazy loaders).
    const isChunkError =
      error.message.includes('Failed to fetch dynamically imported') ||
      error.message.includes('Importing a module script failed') ||
      /Loading chunk \d+ failed/.test(error.message);

    if (isChunkError && !sessionStorage.getItem('chunkLoadError')) {
      sessionStorage.setItem('chunkLoadError', '1');
      window.location.reload();
      return;
    }

    console.error('ErrorBoundary caught an error:', error, errorInfo);
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <I18nContext.Consumer>
          {(i18n) => {
            const t =
              i18n?.t ??
              ((key: string) => {
                const fallback: Record<string, string> = {
                  'common.somethingWentWrong': 'Something went wrong',
                  'common.tryAgain': 'Try again',
                  'common.goHome': 'Go home',
                };
                return fallback[key] ?? key;
              });
            return (
              <div
                role="alert"
                aria-live="assertive"
                className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-dark-bg px-6"
              >
                <div className="max-w-md w-full text-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-3xl">
                      error
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">
                    {t('common.somethingWentWrong')}
                  </h1>
                  <p className="text-text-muted dark:text-dark-text-secondary mb-6">
                    {this.state.error?.message || 'An unexpected error occurred'}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={this.handleReset}
                      className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors"
                    >
                      {t('common.tryAgain')}
                    </button>
                    <button
                      onClick={() => (window.location.href = '/')}
                      className="px-6 py-3 bg-soft-blue hover:bg-input-border dark:bg-dark-surface dark:hover:bg-dark-surface/80 text-text-main dark:text-white rounded-xl font-semibold transition-colors"
                    >
                      {t('common.goHome')}
                    </button>
                  </div>
                </div>
              </div>
            );
          }}
        </I18nContext.Consumer>
      );
    }

    return this.props.children;
  }
}
