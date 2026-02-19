import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Appearance } from 'react-native';
import { tokens } from '@/lib/theme';

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
 * Usage: Wrap at the navigation container level or around critical sections.
 * Note: Error boundaries do NOT catch errors in:
 * - Event handlers (use try/catch)
 * - Async code (use try/catch)
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

    // TODO: In production, send error to logging service (Sentry, Bugsnag, etc.)
    // Example:
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isDark = Appearance.getColorScheme() === 'dark';
      const bg = isDark ? tokens.colors.darkBg : tokens.colors.surface;
      const titleColor = isDark ? '#ffffff' : tokens.colors.textDark;
      const messageColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
      const iconWrapBg = isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2';

      return (
        <View style={[styles.container, { backgroundColor: bg }]}>
          <View style={styles.content}>
            <View style={[styles.iconWrap, { backgroundColor: iconWrapBg }]}>
              <Text style={styles.icon}>⚠</Text>
            </View>
            <Text style={[styles.title, { color: titleColor }]}>Something went wrong</Text>
            <Text style={[styles.message, { color: messageColor }]}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
            <TouchableOpacity onPress={this.handleReset} style={styles.button} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: {
    maxWidth: 340,
    width: '100%',
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 32,
    color: '#ef4444',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    ...tokens.shadow.elevated,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
