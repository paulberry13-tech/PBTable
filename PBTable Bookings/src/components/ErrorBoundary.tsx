import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, spacing, type } from '@/theme';

/** Catches render errors in a screen so one broken screen doesn't crash (and
 *  remount) the whole app. Shows the message so failures are visible. */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <Text style={[type.h1, { color: colors.downText }]}>Something broke</Text>
          <Text selectable style={[type.body, { marginTop: spacing.md }]}>
            {this.state.error.message}
          </Text>
          <Text selectable style={styles.stack}>
            {this.state.error.stack}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  stack: { marginTop: spacing.lg, fontSize: 11, color: colors.textMuted },
});
