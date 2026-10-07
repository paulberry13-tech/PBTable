// My details — what the club holds about you and the people you look after (migration 94).
//
// Emergency contacts and optional health notes, the consents given, and the children a parent
// looks after. Every club gets this page, whether or not it sells memberships: an emergency
// contact is a duty of care, not a membership feature.
//
// The club sees these details only through the dashboard's Emergency info on a session night
// (logged) and a printable member record. Nothing here is visible to other members.

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HelpLink } from '@/components/HelpLink';
import { EMBEDDED_FILL, useEmbedded } from '@/services/embed';
import { MemberDetailsForm } from '@/components/MemberDetailsForm';
import { Button, Card, LoadingView } from '@/components/ui';
import {
  addDependant, clubJoinInfo, getMyPeople, savePersonDetails, type ClubJoinInfo, type Person,
} from '@/services/people';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';

export default function DetailsScreen() {
  const embedded = useEmbedded();
  const { currentUser, showBanner } = useApp();
  const router = useRouter();
  // ?open=<player id or new>&back=membership: sent here from the membership page to finish someone's
  // details, then straight back to choosing their membership (council 2026-10-07).
  const params = useLocalSearchParams<{ open?: string; back?: string }>();
  const backToMembership = params.back === 'membership';
  const [reload, setReload] = useState(0);
  // Fresh every time the page is shown, not only the first: coming back from My details (or the
  // other way) must show what was just saved (Paul, 2026-10-07).
  const shownBefore = useRef(false);
  useFocusEffect(React.useCallback(() => {
    if (shownBefore.current) setReload((n) => n + 1);
    shownBefore.current = true;
  }, []));
  const { data: people, loading } = useAsyncData<Person[] | null>(() => getMyPeople(), [currentUser?.id, reload]);
  const [info, setInfo] = useState<ClubJoinInfo | null>(null);
  useEffect(() => { clubJoinInfo().then(setInfo).catch(() => {}); }, []);

  const [open, setOpen] = useState<string | null>(null);   // player_id being edited, or 'new'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (opened || !people || !params.open) return;
    setOpened(true);
    if (params.open === 'new' || people.some((x) => x.player_id === params.open)) setOpen(params.open);
  }, [people, params.open, opened]);

  if (loading) return <LoadingView label="Loading your details…" />;
  if (!people) {
    return (
      <ScrollView contentContainerStyle={[styles.page, embedded && EMBEDDED_FILL]}>
        <Card><Text style={styles.h1}>My details</Text>
          {currentUser ? (
            <>
              <Text style={styles.body}>Your details could not be loaded just now. Check your connection and try again.</Text>
              <Button title="Try again" variant="secondary" onPress={() => setReload((n) => n + 1)} style={{ marginTop: spacing.md }} />
            </>
          ) : (
            <Text style={styles.body}>Sign in to see the details the club holds about you.</Text>
          )}
        </Card>
      </ScrollView>
    );
  }

  const conductUrl = info?.code_of_conduct_url ?? null;
  const privacyUrl = info?.privacy_notice_url ?? null;
  const me = people.find((p) => p.self);
  const close = () => { setOpen(null); setError(null); };

  return (
    <ScrollView contentContainerStyle={[styles.page, embedded && EMBEDDED_FILL]} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={styles.h1}>My details</Text>
        <Text style={styles.body}>
          Your emergency contact and anything a first aider should know. The people running a
          session can see these if something happens, and so can the club's senior admins. Nobody else can.
        </Text>
        <HelpLink guide="details" label="Help with your details" />
      </Card>

      {people.map((p) => (
        <Card key={p.player_id}>
          <Pressable onPress={() => { setError(null); setOpen(open === p.player_id ? null : p.player_id); }}
            style={styles.headRow} accessibilityRole="button" accessibilityLabel={`${p.name}: ${open === p.player_id ? 'close' : 'edit'} details`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>{p.self ? `${p.name} (you)` : p.name}</Text>
              <Text style={styles.meta}>
                {p.details_complete ? 'Details up to date' : 'Some details missing'}
                {p.details?.updated_at ? ` · updated ${p.details.updated_at.slice(0, 10).split('-').reverse().join('/')}` : ''}
              </Text>
            </View>
            {!p.details_complete && (
              <View style={styles.flag}><Ionicons name="alert-circle" size={14} color={colors.amberText} />
                <Text style={styles.flagText}>Add</Text></View>
            )}
            <Ionicons name={open === p.player_id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable>

          {open !== p.player_id && p.details?.emergency1_name && (
            <Text style={styles.meta}>
              Emergency: {p.details.emergency1_name} ({p.details.emergency1_relationship}) {p.details.emergency1_phone}
            </Text>
          )}

          {open === p.player_id && (
            <MemberDetailsForm key={p.player_id} mode={p.self ? 'self' : 'dependant'} initialName={p.name}
              initial={p.details} conductUrl={conductUrl} privacyUrl={privacyUrl} clubName={info?.club_name}
              shareWording={info?.share_wording ?? null}
              submitLabel="Save" busy={busy} error={error} onCancel={close}
              onSubmit={async (v) => {
                setBusy(true); setError(null);
                const r = await savePersonDetails(p.player_id, v.details);
                setBusy(false);
                if (!r.ok) { setError(r.error); return; }
                close(); setReload((n) => n + 1);
                if (backToMembership) {
                  showBanner(`Details saved. Now choose ${p.self ? 'your' : `${p.name.split(' ')[0]}'s`} membership.`, 'success');
                  router.replace('/membership');
                } else showBanner('Details saved.', 'success');
              }} />
          )}
        </Card>
      ))}

      <Card>
        {open === 'new' ? (
          <>
            <Text style={styles.h2}>Add someone you look after</Text>
            <Text style={styles.body}>
              A child, for example. You keep their details up to date and can buy them a membership.
              {me && !me.details_complete ? ' Please finish your own details first: the club contacts you about them.' : ''}
            </Text>
            <MemberDetailsForm mode="newDependant" conductUrl={conductUrl} privacyUrl={privacyUrl}
              me={me ? { name: me.name, phone: me.details?.phone ?? null } : null}
              clubName={info?.club_name} shareWording={info?.share_wording ?? null} submitLabel="Add them" busy={busy} error={error} onCancel={close}
              onSubmit={async (v) => {
                setBusy(true); setError(null);
                const r = await addDependant(v.name, v.gender, v.details);
                setBusy(false);
                if (!r.ok) { setError(r.error); return; }
                close(); setReload((n) => n + 1);
                if (backToMembership) {
                  showBanner(`${v.name} added. Now choose ${v.name.split(' ')[0]}'s membership.`, 'success');
                  router.replace('/membership');
                } else showBanner(`${v.name} added.`, 'success');
              }} />
          </>
        ) : (
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>Someone you look after?</Text>
              <Text style={styles.meta}>Add a child so you can keep their details and buy their membership.</Text>
            </View>
            <Button title="Add" variant="secondary" onPress={() => { setError(null); setOpen('new'); }} />
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // The same column as the other screens: 720 wide on its own, the site's 1152 inside the club site.
  page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  h1: { ...type.h1, color: colors.navy },
  h2: { ...type.h2, color: colors.navy },
  body: { ...type.body, color: colors.text, marginTop: spacing.xs },
  meta: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.amberSoft,
          borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  flagText: { ...type.caption, color: colors.amberText, fontFamily: fonts.bold },
});
