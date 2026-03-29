import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '@/lib/constants';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error?.message ?? 'Unknown error'}</Text>
          <Pressable
            style={styles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  message: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
