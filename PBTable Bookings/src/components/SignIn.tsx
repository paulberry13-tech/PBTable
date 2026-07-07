import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';

/** Email/password sign-in shown when running on the live backend and no session
 *  exists. Prefilled with the demo member for convenience during the POC. */
export function SignIn() {
  const { signIn } = useApp();
  const [email, setEmail] = useState(process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '');
  const [password, setPassword] = useState(process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        <View style={styles.brandWrap}>
          <Text style={styles.logo}>
            <Text style={styles.logoLight}>PB</Text>
            <Text style={styles.logoBold}>Table</Text>
          </Text>
          <Text style={styles.tagline}>Book. Play. Climb.</Text>
        </View>

        <View style={styles.card}>
          <Text style={type.h1}>Sign in</Text>
          <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
            Use your club email to book sessions and manage your wallet.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.co.uk"
            placeholderTextColor={colors.textFaint}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
            onSubmitEditing={submit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={busy ? 'Signing in…' : 'Sign in'}
            onPress={submit}
            loading={busy}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  center: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  brandWrap: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: 34, color: colors.textOnDark },
  logoLight: { fontFamily: fonts.regular },
  logoBold: { fontFamily: fonts.extrabold },
  tagline: {
    color: colors.coralBright,
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.6,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  label: {
    ...type.tiny,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 46,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.card,
  },
  error: {
    marginTop: spacing.md,
    color: colors.downText,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
});
