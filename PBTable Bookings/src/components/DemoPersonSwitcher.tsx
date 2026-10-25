// Demo-only "become this person" switcher.
//
// A live demo of a booking system is unconvincing if it can only ever be run as
// one person: the moment that sells it is watching names appear on a session as
// different members book. This puts a floating control on the demo app that
// signs you straight in as any of the dummy members, with no OTP round-trip.
//
// SAFETY: rendered only when PROJECT.isDemo — a club subdomain resolves to the
// production backend, where isDemo is false and this never mounts. The people
// list comes from the demo_people() RPC, which is itself gated to the club whose
// slug is 'demo' (migration 33), so even on a demo-configured build pointed at
// production it would return nothing.
//
// The two demo passwords are NOT in this file. They come from EXPO_PUBLIC_DEMO_*
// env vars, which the production stager blanks — a string literal here would be
// inlined into the club-site bundle regardless of the isDemo guard, because the
// component still ships even though it renders nothing there. The prod stage
// script greps the output for exactly this and refuses to stage if it finds it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/lib/money';
import { initialsOf } from '@/lib/format';
import { PROJECT } from '@/services/backend';
import { supabase } from '@/services/supabaseClient';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

type Person = {
  display_name: string;
  email: string;
  membership: string;
  balance_pennies: number;
  active_bookings: number;
};

/** The demo sandbox uses two shared passwords, split by address family. Both are
 *  build-time env (blank in the production bundle), never literals — see header. */
const DEMO_PW_MAIN = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '';
const DEMO_PW_SHOW = process.env.EXPO_PUBLIC_DEMO_SHOWCASE_PASSWORD ?? '';
function passwordFor(email: string): string {
  return email.includes('+show-') ? DEMO_PW_SHOW : DEMO_PW_MAIN;
}

export function DemoPersonSwitcher() {
  const { currentUser, refreshUser } = useApp();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('demo_people');
    if (e) { setError(e.message); return; }
    setPeople((data ?? []) as Person[]);
  }, []);

  useEffect(() => { if (open && people === null) void load(); }, [open, people, load]);

  const become = useCallback(async (p: Person) => {
    setBusy(p.email); setError(null);
    try {
      // Sign out first so the previous member's session can't linger if the new
      // sign-in fails — better to land on the sign-in screen than to look like
      // the switch worked while still acting as the last person.
      await supabase.auth.signOut();
      const { error: e } = await supabase.auth.signInWithPassword({
        email: p.email,
        password: passwordFor(p.email),
      });
      if (e) throw new Error(e.message);
      await refreshUser();
      setOpen(false);
      setPeople(null); // balances/bookings move as you demo; refetch next open
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [refreshUser]);

  const label = useMemo(
    () => (currentUser?.name ? currentUser.name.split(/\s+/)[0] : 'Sign in'),
    [currentUser?.name]
  );

  if (!PROJECT.isDemo || !DEMO_PW_MAIN) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Switch demo person"
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.fabDot}>
          <Text style={styles.fabDotText}>{initialsOf(currentUser?.name ?? '?')}</Text>
        </View>
        <View>
          <Text style={styles.fabEyebrow}>DEMO · PLAYING AS</Text>
          <Text style={styles.fabName}>{label}</Text>
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Become someone else</Text>
            <Text style={styles.sub}>
              Signs you in as that member instantly. Book from two accounts to show a session
              filling up, or a waitlist forming.
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            {people === null ? (
              <View style={styles.loading}><ActivityIndicator color={colors.coral} /></View>
            ) : (
              <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
                {people.map((p) => {
                  const isMe = currentUser?.email === p.email;
                  return (
                    <Pressable
                      key={p.email}
                      disabled={!!busy || isMe}
                      onPress={() => void become(p)}
                      // Without these the rows render as plain divs: not focusable,
                      // invisible to a screen reader, and unreachable by keyboard.
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !!busy || isMe, selected: isMe }}
                      accessibilityLabel={isMe ? `${p.display_name} (currently signed in)` : `Become ${p.display_name}`}
                      style={({ pressed }) => [
                        styles.row,
                        isMe && styles.rowActive,
                        pressed && !isMe && { backgroundColor: colors.background },
                      ]}
                    >
                      <View style={[styles.avatar, isMe && { backgroundColor: colors.coral }]}>
                        <Text style={styles.avatarText}>{initialsOf(p.display_name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{p.display_name}</Text>
                        <Text style={styles.meta}>
                          {formatMoney(p.balance_pennies)}
                          {p.membership === 'non_member' ? ' · non-member' : ''}
                          {p.active_bookings > 0 ? ` · ${p.active_bookings} booked` : ''}
                        </Text>
                      </View>
                      {busy === p.email
                        ? <ActivityIndicator size="small" color={colors.coral} />
                        : isMe
                        ? <Text style={styles.you}>YOU</Text>
                        : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', left: spacing.md, bottom: spacing.md, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.navy, borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  fabDot: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.coral,
    alignItems: 'center', justifyContent: 'center',
  },
  fabDotText: { color: '#fff', fontFamily: fonts.bold, fontSize: 12 },
  fabEyebrow: { color: 'rgba(255,255,255,0.65)', fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 1.2 },
  fabName: { color: '#fff', fontFamily: fonts.display, fontSize: 15, textTransform: 'uppercase' },

  backdrop: { flex: 1, backgroundColor: 'rgba(11,23,39,0.55)', justifyContent: 'center', padding: spacing.md },
  sheet: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg,
    maxHeight: '80%', width: '100%', maxWidth: 460, alignSelf: 'center', ...shadow.card,
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.navy, textTransform: 'uppercase' },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.down, marginTop: spacing.sm },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  list: { marginTop: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.background },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontFamily: fonts.bold, fontSize: 12 },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  you: { fontFamily: fonts.bold, fontSize: 10, color: colors.coral, letterSpacing: 1 },
  close: {
    marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.background,
  },
  closeText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.navy },
});
