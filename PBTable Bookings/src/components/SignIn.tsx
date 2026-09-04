import React, { useEffect, useState } from 'react';
import {
  Image,
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
import * as auth from '@/services/auth';
import { BACKEND } from '@/services/backend';
import * as data from '@/services/data';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';

const PBTABLE_LOGO = require('../../assets/images/pbtable-logo.png');

/** Passwordless sign-in on the live backend: enter your club email, we email a
 *  6-digit code, you type it in. No password to set or remember. Invite-only —
 *  only members the club has added can sign in. */
/** onCancel is supplied only when the sign-in was raised on demand (someone tapped
 *  Book while signed out). Browsing is public, so they must be able to back out. */
export function SignIn({ onCancel }: { onCancel?: () => void } = {}) {
  const { sendOtp, verifyOtp, refreshUser } = useApp();
  // 'join*' stages are self-signup: same OTP, but the code is allowed to CREATE
  // the account, and the club roster row is written only after it verifies.
  const [stage, setStage] = useState<'email' | 'code' | 'joinEmail' | 'joinCode' | 'joinName'>('email');
  const [fullName, setFullName] = useState('');
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);
  const [email, setEmail] = useState(process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // The club's own badge. Three states, and they are not the same thing:
  //   undefined -> still asking; render nothing, so nobody sees PBTable's mark flash
  //                past and get replaced by their own club's a moment later.
  //   null      -> asked and got nothing (no logo set, or the read failed); fall back
  //                to the PBTable mark, because an empty hero looks broken.
  //   object    -> the club's name, and its logo if it has uploaded one.
  // getClubBranding caches success at module level and deliberately does NOT cache
  // failure, so this shares the header's single fetch and retries after a blip.
  const [club, setClub] = useState<{ name: string | null; logoUrl: string | null } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    data.getClubBranding()
      .then((b) => { if (live) setClub(b); })
      .catch(() => { if (live) setClub(null); });
    return () => { live = false; };
  }, []);

  // Ask the club whether it takes sign-ups, once, as the screen appears -- the answer
  // decides whether the "Join the club" link is offered at all.
  //
  // Fails CLOSED on purpose: a null answer (RPC error, offline, or mock mode) leaves the
  // link hidden. Getting it wrong that way shows a member one fewer link; the other way
  // round invites a newcomer through a door the club has locked, which is the bug this
  // fixes. Cancelled on unmount so a slow reply cannot set state on a dead component.
  useEffect(() => {
    let live = true;
    auth.clubSignupInfo(BACKEND.slug)
      .then((info) => { if (live) setSignupOpen(!!info?.self_signup); })
      .catch(() => { if (live) setSignupOpen(false); });
    return () => { live = false; };
  }, []);

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
      // The code can be perfectly valid and still leave us with nobody: the address
      // has a login, but no member record at THIS club. AppContext's refreshUser
      // swallows that and sets currentUser to null, so the gate simply re-rendered
      // the sign-in form -- indistinguishable from the code being rejected, and a
      // dead end with nothing to click. Say what actually happened instead.
      if ((await auth.hasMemberRecord()) === false) {
        await auth.signOut();
        setError(
          `That email has a login, but isn't a member of this club yet. ` +
            `If you're new, use "Join the club" below. Otherwise ask the club to add you.`,
        );
        return;
      }
    } catch (e) {
      // Supabase throws PostgrestError, which is NOT an Error instance -- an
      // `instanceof` check alone silently turned real causes into a generic
      // "not accepted" and cost an afternoon of chasing the wrong bug.
      const msg =
        e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'That code was not accepted.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // --- self-signup -----------------------------------------------------------
  // No fetch here any more: the link that calls this is only rendered once signupOpen is
  // true, so the club has already said yes by the time anyone can press it.
  const openJoin = () => {
    setError(null);
    setStage('joinEmail');
  };

  const requestJoinCode = async () => {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setBusy(true); setError(null);
    try {
      await auth.sendJoinOtp(email);
      setCode('');
      setStage('joinCode');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a code.');
    } finally { setBusy(false); }
  };

  // Verify the code FIRST, then ask for a name — nothing reaches the club roster
  // until the address is proven, so an abandoned signup leaves nothing behind.
  const verifyJoinCode = async () => {
    setBusy(true); setError(null);
    try {
      // auth.verifyOtp is the RAW verify — AppContext's wrapper also loads the member
      // record, which does not exist yet for someone joining.
      await auth.verifyOtp(email, code);
      setStage('joinName');
    } catch (e) {
      // Supabase throws PostgrestError, which is NOT an Error instance -- an
      // `instanceof` check alone silently turned real causes into a generic
      // "not accepted" and cost an afternoon of chasing the wrong bug.
      const msg =
        e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : 'That code was not accepted.';
      setError(msg);
    } finally { setBusy(false); }
  };

  const finishJoin = async () => {
    if (fullName.trim().length < 2) { setError('Please give your full name.'); return; }
    setBusy(true); setError(null);
    try {
      await auth.joinClub(BACKEND.slug, fullName);
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete your sign-up.');
    } finally { setBusy(false); }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        {/* Whose app is this? A member arriving at glos.pbtable.com was met by
            PBTable's own wordmark, which is the platform's name and not their club's
            -- the header two lines up already said "Pickleball Gloucestershire Club".
            The sign-in screen is the first thing a newcomer sees, so it is the worst
            place to look like somebody else's product. (Paul, 2026-09-02.)

            Fixed height: the two states are different shapes, and letting the hero
            resize as the answer lands would shunt the card down the screen under the
            member's thumb. */}
        <View style={styles.brandWrap}>
          {club === undefined ? null : club?.name ? (
            <>
              <Image
                source={club.logoUrl ? { uri: club.logoUrl } : PBTABLE_LOGO}
                style={styles.clubLogo}
                resizeMode="contain"
                accessibilityLabel={club.name}
              />
              <Text style={styles.clubName} numberOfLines={2}>{club.name}</Text>
            </>
          ) : (
            <>
              <Text style={styles.logo}>
                <Text style={styles.logoLight}>PB</Text>
                <Text style={styles.logoBold}>Table</Text>
              </Text>
              <Text style={styles.tagline}>Book. Play. Climb.</Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          {stage === 'joinEmail' ? (
            <>
              <Text style={type.h1}>Join the club</Text>
              {signupOpen === false ? (
                <>
                  <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
                    This club isn't taking online sign-ups at the moment. Have a word with the club
                    and they'll add you. Then you can sign in with your email.
                  </Text>
                  <Pressable onPress={() => setStage('email')} hitSlop={8} style={{ alignSelf: 'center' }}>
                    <Text style={styles.switchLink}>Back to sign in</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
                    Enter your email and we'll send a one-time code to check it's yours. Nothing
                    reaches the club until you've confirmed it.
                  </Text>
                  <Text style={styles.label}>Email</Text>
                  <TextInput style={styles.input} value={email} onChangeText={setEmail}
                    autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
                    placeholder="you@example.co.uk" placeholderTextColor={colors.textFaint}
                    onSubmitEditing={requestJoinCode} returnKeyType="send" />
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <Button title={busy ? 'Sending' : 'Send me a code'} onPress={requestJoinCode}
                    loading={busy} style={{ marginTop: spacing.lg }} />
                  <Pressable onPress={() => { setError(null); setStage('email'); }} hitSlop={8}
                    style={{ marginTop: spacing.md, alignSelf: 'center' }}>
                    <Text style={styles.switchLink}>I'm already a member</Text>
                  </Pressable>
                </>
              )}
            </>
          ) : stage === 'joinCode' ? (
            <>
              <Text style={type.h1}>Check your email</Text>
              <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
                We've sent a code to {email}. Enter it to confirm your address.
              </Text>
              <Text style={styles.label}>Code</Text>
              <TextInput style={styles.input} value={code} onChangeText={setCode}
                keyboardType="number-pad" placeholder="12345678" placeholderTextColor={colors.textFaint}
                onSubmitEditing={verifyJoinCode} returnKeyType="go" />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button title={busy ? 'Checking' : 'Confirm'} onPress={verifyJoinCode}
                loading={busy} style={{ marginTop: spacing.lg }} />
            </>
          ) : stage === 'joinName' ? (
            <>
              <Text style={type.h1}>What's your name?</Text>
              <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
                This is the name the club and other players will see on a session line-up.
              </Text>
              <Text style={styles.label}>Full name</Text>
              <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
                autoCapitalize="words" placeholder="Alex Morgan" placeholderTextColor={colors.textFaint}
                onSubmitEditing={finishJoin} returnKeyType="go" />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button title={busy ? 'Joining' : 'Join the club'} onPress={finishJoin}
                loading={busy} style={{ marginTop: spacing.lg }} />
            </>
          ) : stage === 'email' ? (
            <>
              <Text style={type.h1}>Sign in</Text>
              <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
                Enter your club email and we'll send you a one-time code. No password needed.
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
                {/* What a newcomer is offered depends on whether the club takes sign-ups.
                    It used to be the link, always, with the refusal arriving AFTER the tap
                    -- a newcomer at a club that adds members by hand was invited through a
                    locked door. Paul, 2026-09-02: "players can only sign up by contacting
                    the admin."

                    Closed clubs get plain text rather than nothing at all: a newcomer who
                    has just been told their email is not recognised needs to know what to
                    do next, and silence does not tell them. Deliberately not a mailto --
                    there is no club contact address in the schema yet (club_signup_info
                    returns name, self_signup, taster count and price, and that is all), so
                    a mailto would have nowhere to go. Add clubs.settings.contact_email and
                    a General-tab field, return it from the RPC, and this becomes a link.

                    signupOpen is null until the club answers, so neither branch shows while
                    the question is still open -- no flicker, and no wrong promise. */}
                {signupOpen === true ? (
                  <Pressable onPress={openJoin} hitSlop={8} style={{ marginTop: spacing.md, alignSelf: 'center' }}
                    accessibilityRole="button" accessibilityLabel="New here? Join the club">
                    <Text style={styles.switchLink}>New here? Join the club</Text>
                  </Pressable>
                ) : signupOpen === false ? (
                  <Text style={[type.caption, { marginTop: spacing.md, textAlign: 'center' }]}>
                    New here? Have a word with the club and they'll add you, then
                    sign in with your email.
                  </Text>
                ) : null}
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
  brandWrap: { alignItems: 'center', justifyContent: 'flex-end', height: 96, marginBottom: spacing.xl },
  clubLogo: { width: 56, height: 56, borderRadius: 13, marginBottom: 10 },
  clubName: {
    color: colors.textOnDark,
    fontFamily: fonts.extrabold,
    fontSize: 20,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
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
