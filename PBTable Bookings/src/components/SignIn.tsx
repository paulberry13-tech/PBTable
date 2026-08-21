import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';

/** Passwordless sign-in on the live backend: enter your club email, we email a
 *  6-digit code, you type it in. No password to set or remember. Invite-only —
 *  only members the club has added can sign in. */
/** onCancel is supplied only when the sign-in was raised on demand (someone tapped
 *  Book while signed out). Browsing is public, so they must be able to back out. */
export function SignIn({ onCancel }: { onCancel?: () => void } = {}) {
  const { sendOtp, verifyOtp } = useApp();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const requestCode = async () => {
    if (!email.trim()) {
      setError('Enter your club email first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendOtp(email);
      setCode('');
      setStage('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not accepted.');
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
          {stage === 'email' ? (
            <>
              <Text style={type.h1}>Sign in</Text>
              <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
                Enter your club email and we'll send you a one-time code — no password needed.
              </Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.co.uk"
                placeholderTextColor={colors.textFaint}
                onSubmitEditing={requestCode}
                returnKeyType="send"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button
                title={busy ? 'Sending…' : 'Email me a code'}
                onPress={requestCode}
                loading={busy}
                style={{ marginTop: spacing.lg }}
              />
            </>
          ) : (
            <>
              <Text style={type.h1}>Enter your code</Text>
              <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
                We emailed a sign-in code to{' '}
                <Text style={{ fontFamily: fonts.bold, color: colors.text }}>{email}</Text>. It
                expires shortly.
              </Text>

              <Text style={styles.label}>Sign-in code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 8))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                onSubmitEditing={verify}
                autoFocus
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button
                title={busy ? 'Verifying…' : 'Verify & sign in'}
                onPress={verify}
                loading={busy}
                style={{ marginTop: spacing.lg }}
              />

              <View style={styles.linkRow}>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setStage('email');
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.switchLink}>Use a different email</Text>
                </Pressable>
                <Pressable onPress={requestCode} hitSlop={8} disabled={busy}>
                  <Text style={styles.switchLink}>Resend code</Text>
                </Pressable>
              </View>
            </>
          )}
            {onCancel && (
              <Pressable onPress={onCancel} hitSlop={8} style={{ marginTop: spacing.md, alignSelf: 'center' }}
                accessibilityRole="button" accessibilityLabel="Back to browsing">
                <Text style={styles.switchLink}>← Keep looking without signing in</Text>
              </Pressable>
            )}
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
  codeInput: {
    fontSize: 24,
    fontFamily: fonts.extrabold,
    letterSpacing: 6,
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.md,
    color: colors.downText,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  linkRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  switchLink: {
    fontFamily: fonts.bold,
    color: colors.coralText,
    fontSize: 13,
  },
});
