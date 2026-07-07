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

/** Sign in or create a member account when running on the live backend with no
 *  session. Sign-in is prefilled with the demo member for convenience. */
export function SignIn() {
  const { signIn, signUp } = useApp();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '');
  const [password, setPassword] = useState(process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const isSignup = mode === 'signup';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isSignup) await signUp(name, email, password);
      else await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${isSignup ? 'Sign-up' : 'Sign-in'} failed`);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setError(null);
    setMode(isSignup ? 'signin' : 'signup');
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
          <Text style={type.h1}>{isSignup ? 'Create your account' : 'Sign in'}</Text>
          <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
            {isSignup
              ? 'Join the club to book sessions and manage your wallet.'
              : 'Use your club email to book sessions and manage your wallet.'}
          </Text>

          {isSignup ? (
            <>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholder="A N Other"
                placeholderTextColor={colors.textFaint}
              />
            </>
          ) : null}

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
            title={busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            onPress={submit}
            loading={busy}
            style={{ marginTop: spacing.lg }}
          />

          <Pressable onPress={switchMode} style={styles.switch} hitSlop={8}>
            <Text style={styles.switchText}>
              {isSignup ? 'Already have an account? ' : 'New here? '}
              <Text style={styles.switchLink}>{isSignup ? 'Sign in' : 'Create an account'}</Text>
            </Text>
          </Pressable>
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
  switch: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  switchText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  switchLink: {
    fontFamily: fonts.bold,
    color: colors.coralText,
  },
});
