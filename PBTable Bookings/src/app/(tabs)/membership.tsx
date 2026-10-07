// Membership — the club's annual subscription, for you and the people you look after.
//
// Its own section rather than a card inside Wallet (Paul, 2026-09-23): the wallet is money you
// spend session by session, this is one payment a year that changes what every session costs.
//
// Since migration 94 (Paul, 2026-10-02): clubs sell several TYPES (Adult, Junior, Concession…)
// and a membership belongs to a PERSON, so a parent buys one for each child. Each person here
// gets their own card. Joining needs that person's details complete first -- the club must be
// able to reach someone in an emergency before it takes their money.
//
// A member can turn their own auto-renewal on or off (Paul, 2026-09-24) and update their card
// on Stripe's own page, but cannot END a membership early: that stays a conversation with the
// club, because a refund is the club's money and the club's decision.

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, LoadingView } from '@/components/ui';
import { HelpLink } from '@/components/HelpLink';
import { formatDateLong } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { EMBEDDED_FILL, openOutside, useEmbedded } from '@/services/embed';
import {
  confirmMembership,
  getMembershipQuote,
  graceDaysLeft,
  membershipStateLabel,
  openMembershipPortal,
  setMembershipRenewal,
  startMembershipCheckout,
  type MembershipQuote,
  type MembershipType,
  type MyMembership,
} from '@/services/membership';
import { getMyPeople, savePersonDetails, type Person } from '@/services/people';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';

const PENDING_KEY = 'pb.pendingMembership';

export default function MembershipScreen() {
  const embedded = useEmbedded();
  const { currentUser, refresh, showBanner } = useApp();
  const router = useRouter();
  const [reload, setReload] = useState(0);
  // Fresh every time the page is shown, not only the first: coming back from My details (or the
  // other way) must show what was just saved (Paul, 2026-10-07).
  const shownBefore = useRef(false);
  useFocusEffect(React.useCallback(() => {
    if (shownBefore.current) setReload((n) => n + 1);
    shownBefore.current = true;
  }, []));
  const { data, loading } = useAsyncData<{ quote: MembershipQuote | null; people: Person[] | null }>(
    async () => {
      const [quote, people] = await Promise.all([getMembershipQuote(), getMyPeople()]);
      return { quote, people };
    },
    [currentUser?.id, reload],
  );
  const again = () => { setReload((n) => n + 1); refresh(); };

  // COMING BACK FROM STRIPE. Same shape as the wallet: the reference is stashed and the URL
  // cleaned first (a refresh cannot replay it), then confirmed once somebody is signed in.
  const [claim, setClaim] = useState<{ id: string | null } | null>(null);
  const renewalBack = useRef(false);   // came back from setting up card renewal, not joining
  const [settled, setSettled] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const tries = useRef(0);   // checks so far while Stripe finishes the payment
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') { setClaim({ id: null }); return; }
    const params = new URLSearchParams(window.location.search);
    const back = params.get('membership');
    const fromUrl = back === 'success' ? params.get('session_id') : null;
    if (back) window.history.replaceState({}, '', window.location.pathname);
    if (fromUrl) { try { window.localStorage.setItem(PENDING_KEY, fromUrl); } catch {} }
    const renewal = params.get('renew') === '1';
    if (back === 'cancelled') {
      showBanner(renewal ? 'Card renewal was not set up. Nothing was taken.' : 'No payment was taken. You can join whenever you like.', 'info');
    }
    if (back === 'success' && renewal) renewalBack.current = true;
    // Back from Stripe's card page: a new card or a paid invoice reaches us by webhook, so look again shortly.
    if (back === 'portal') setTimeout(again, 3000);
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(PENDING_KEY); } catch {}
    setClaim({ id: fromUrl ?? stored });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!claim || !currentUser || settled || loading) return;
    // Without a reference, only look for a sign-up somebody might have lost: when a person
    // here is not shown as a member yet.
    const anyoneMissing = (data?.people ?? []).some((p) => !isLive(p.membership));
    if (!claim.id && (!anyoneMissing || !data?.quote?.enabled)) return;
    setSettled(true);
    if (claim.id && tries.current === 0) setConfirming(true);   // the full-page wait only the first time
    const forget = () => { try { window.localStorage.removeItem(PENDING_KEY); } catch {} };
    confirmMembership(claim.id)
      .then((r) => {
        if (r.ok) {
          if (!r.pending) forget();
          if (r.recorded > 0) {
            showBanner(renewalBack.current
              ? 'Card saved. Nothing is taken until your membership ends; then it renews by itself.'
              : 'Membership confirmed. Member prices apply when you book.', 'success');
            again();
          }
          else if (r.pending && claim.id) {
            // Ask again every few seconds for about half a minute, so "this page will update" is true.
            if (tries.current < 8) {
              tries.current += 1;
              if (tries.current === 1) showBanner('Stripe is still finishing the payment. This page will update when it does.', 'info');
              setTimeout(() => setSettled(false), 4000);
            } else {
              showBanner('Stripe is taking longer than usual. Your membership will appear here once it has gone through.', 'info');
            }
          }
        } else {
          if (r.terminal) forget();
          if (claim.id) showBanner(r.error, 'warning');
        }
      })
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, currentUser, settled, loading]);

  if (loading) return <LoadingView label="Loading your membership…" />;
  if (confirming) return <LoadingView label="Confirming your membership…" />;

  const quote = data?.quote ?? null;
  const people = data?.people ?? [];

  if (quote?.loadError) {
    return (
      <ScrollView contentContainerStyle={[styles.page, embedded && EMBEDDED_FILL]}>
        <Card>
          <Text style={styles.h1}>Membership</Text>
          <Text style={styles.body}>Memberships could not be loaded just now. Check your connection and try again.</Text>
          <Button title="Try again" variant="secondary" onPress={again} style={{ marginTop: spacing.md }} />
        </Card>
      </ScrollView>
    );
  }
  if (!quote || !quote.enabled) {
    return (
      <ScrollView contentContainerStyle={[styles.page, embedded && EMBEDDED_FILL]}>
        <Card>
          <Text style={styles.h1}>Membership</Text>
          <Text style={styles.body}>This club does not offer memberships.</Text>
        </Card>
      </ScrollView>
    );
  }

  const types: MembershipType[] = quote.types ?? (quote.plan ? [{ ...quote.plan, description: null }] : []);
  const contact = quote.contact_email ?? null;

  return (
    <ScrollView contentContainerStyle={[styles.page, embedded && EMBEDDED_FILL]}>
      <Card>
        <Text style={styles.h1}>Membership</Text>
        <Text style={styles.body}>
          Members pay <Text style={styles.strong}>member prices</Text> on every session. It does not
          book anything for you or include any sessions.
        </Text>
        <Text style={styles.meta}>{termsLine(quote)}</Text>
        <HelpLink guide="membership" label="How buying a membership works" />
      </Card>

      {people.map((p) => (
        <PersonCard key={p.player_id} person={p} types={types} quote={quote}
          onChanged={again} onDetails={() => router.push(`/details?open=${p.player_id}&back=membership`)} />
      ))}

      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h2}>Your details</Text>
            <Text style={styles.meta}>Keep your emergency contact up to date, and add anyone you look after. Anyone you add appears here.</Text>
          </View>
          <Button title="My details" variant="secondary" onPress={() => router.push('/details')} />
        </View>
      </Card>

      <Card>
        <Text style={styles.h2}>Leaving, or a question</Text>
        <Text style={styles.body}>
          To stop a card membership renewing, turn renewal off above: it then ends when the year you've paid
          for runs out. To end one straight away, or to ask about a refund, contact the club
          {contact ? ':' : '.'}
        </Text>
        {contact ? (
          <Pressable onPress={() => Linking.openURL(`mailto:${contact}`)} accessibilityRole="link" style={styles.linkRow}>
            <Ionicons name="mail-outline" size={16} color={colors.coralText} />
            <Text style={styles.link}>{contact}</Text>
          </Pressable>
        ) : null}
        <HelpLink guide="renewal" label="Renewing, leaving and card problems" />
      </Card>
    </ScrollView>
  );
}

/** Whole days from a to b (YYYY-MM-DD), counted on the calendar, not by the clock. */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}
function todayUk(): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function addDay(d: string): string {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1));
  return t.toISOString().slice(0, 10);
}

/** "Runs from ... to ...", a bar of how far through the period they are, and a countdown to
 *  what happens next: it renews (card, renewal on), or it ends (renewal off, or paid to the club). */
function MembershipPeriod({ from, to, renews, offline }: { from: string; to: string; renews: boolean; offline: boolean }) {
  const today = todayUk();
  const total = Math.max(1, dayDiff(from, to) + 1);
  const done = Math.min(total, Math.max(0, dayDiff(from, today) + 1));
  const pct = Math.round((done / total) * 100);
  const nextDay = addDay(to);                         // the renewal date, or the first day not covered
  const left = Math.max(0, dayDiff(today, nextDay));  // days until then
  const soon = !renews && left <= 30;
  const tone = soon ? colors.amberText : colors.upText;
  const count = left <= 0 ? (renews ? 'Renewing today' : 'Ended')
    : left === 1 ? (renews ? 'Renews tomorrow' : 'Last day today') : `${left} days to go`;
  const next = renews
    ? `Renews on ${formatDateLong(nextDay)}`
    : `${offline ? 'Paid to the club directly. ' : ''}Ends after ${formatDateLong(to)}`;
  return (
    <View style={styles.period}>
      <Text style={styles.periodRange}>
        {formatDateLong(from)} <Text style={styles.periodTo}>to</Text> {formatDateLong(to)}
      </Text>
      <View style={styles.periodTrack} accessibilityRole="progressbar"
        accessibilityLabel={`${pct}% of the membership year used`}
        accessibilityValue={{ min: 0, max: 100, now: pct }}>
        <View style={[styles.periodFill, { width: `${pct}%`, backgroundColor: soon ? colors.amberText : colors.coral }]} />
      </View>
      <View style={styles.periodFoot}>
        <Text style={[styles.periodCount, { color: tone }]}>{count}</Text>
        <Text style={styles.periodNext}>{next}</Text>
      </View>
    </View>
  );
}

/** Why someone with a membership on file is not a member now, in their words. */
function lapsedText(m: Person['membership'], whose: string): string {
  if (!m) return 'Not a member.';
  // A membership paid to the club ends on its own end date (94): that is not the club ending it.
  const ranOut = m.source === 'offline' && !!m.ended_at && !!m.current_period_end
    && Math.abs(Date.parse(m.ended_at) - Date.parse(m.current_period_end)) < 1000;
  if (ranOut || (m.source === 'offline' && !m.ended_at)) {
    return `${whose} membership ran to ${m.period_to ? formatDateLong(m.period_to) : 'its end date'} and has ended.`;
  }
  if (m.ended_at) return 'The membership was ended by the club.';
  if (m.status === 'past_due' || m.status === 'unpaid') return "The last payment didn't go through, so the membership has lapsed and member prices have stopped.";
  return 'The membership has lapsed.';
}

/** What joining costs today, as a member reads it: "£30.00", or "about £18.30" when it is the
 *  by-the-day part year (Stripe works it out to the second, so it can be a penny either way). */
function todayText(t: MembershipType): string {
  const today = t.today_pennies ?? t.join_pennies ?? t.price_pennies;
  const byDay = t.today_pennies != null && t.join_pennies == null && t.today_pennies !== t.price_pennies && t.today_pennies > 0;
  return `${byDay ? 'about ' : ''}${formatMoney(today)}`;
}

/** The price on a type: today's figure, and what it is after that. */
function TypePrice({ t, quote }: { t: MembershipType; quote: MembershipQuote }) {
  const on = quote.renews_on ? formatDateLong(quote.renews_on) : '1 January';
  const today = t.today_pennies ?? t.join_pennies ?? null;
  if (quote.december_free || today === 0) {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.typePrice}>£0 today</Text>
        <Text style={styles.typeThen}>then {formatMoney(t.price_pennies)} on {on}</Text>
      </View>
    );
  }
  if (today != null && today !== t.price_pennies) {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.typePrice}>{todayText(t)} today</Text>
        <Text style={styles.typeThen}>then {formatMoney(t.price_pennies)} on {on}</Text>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.typePrice}>{formatMoney(t.price_pennies)}</Text>
      <Text style={styles.typeThen}>a year</Text>
    </View>
  );
}

function isLive(m: Person['membership']): boolean {
  if (!m || m.ended_at) return false;
  if (m.source === 'offline') return m.status === 'active' && !!m.current_period_end && Date.parse(m.current_period_end) > Date.now();
  // A failed card counts only while the bank is still retrying (the 30-day grace); after that the
  // membership has lapsed and they can simply join again.
  if (m.status === 'past_due') return !!m.grace_ends_at && Date.parse(m.grace_ends_at) > Date.now();
  return m.status === 'active' || m.status === 'trialing';
}

function termsLine(q: MembershipQuote): string {
  const on = q.renews_on ? formatDateLong(q.renews_on) : null;
  if (q.billing_mode === 'calendar') {
    if (q.december_free) return `Join now and pay nothing until ${on ?? '1 January'}, when the year's price is taken.`;
    // A club with joining price steps shows a clear price on each type rather than a by-the-day figure.
    if ((q.types ?? []).some((t) => t.join_pennies != null))
      return `Memberships run to 31 December. Joining now, you pay the price shown for the rest of this year, then the full price on ${on ?? '1 January'}.`;
    if (q.pro_rata) return `Memberships run to 31 December. You pay for the rest of this year now, then the full price on ${on ?? '1 January'}.`;
    return `Memberships run to 31 December and renew on ${on ?? '1 January'}.`;
  }
  return 'Your year starts the day you join and renews on the same date next year.';
}

function PersonCard({ person, types, quote, onChanged, onDetails }: {
  person: Person;
  types: MembershipType[];
  quote: MembershipQuote;
  onChanged: () => void;
  onDetails: () => void;
}) {
  const m = person.membership;
  // membershipStateLabel speaks the MyMembership shape; a person's membership carries the same fields.
  const state = m?.source === 'offline'
    ? (isLive(m) ? { key: 'active' as const, label: 'Member' } : { key: 'lapsed' as const, label: 'Lapsed' })
    : membershipStateLabel(m as unknown as MyMembership | null);
  const live = isLive(m);
  const days = graceDaysLeft(m as unknown as MyMembership | null);
  // Renewal on and nothing paid yet (a December joiner): turning it off waits for the first payment.
  const awaitingFirst = !!m && m.first_payment_made === false && !m.cancel_at_period_end;
  // A new member's details are passed on to register the membership (migration 94, section 12),
  // so the tick is asked for here, at the point of buying, if it is not already on file.
  const shareWording = quote.share_wording ?? null;
  // Also when an admin ticked it from a paper form: the member confirms it themselves (section 17).
  const needShare = !!shareWording && !(person.details?.share_consent && person.details?.share_confirmed !== false);
  const [agree, setAgree] = useState(false);
  const [pick, setPick] = useState<string | null>(types.length === 1 ? types[0].id : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const who = person.self ? 'You' : person.name.split(' ')[0];

  const run = async (what: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(what); setErr(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setErr(r.error ?? 'Something went wrong.');
    return r.ok;
  };

  return (
    <Card>
      <View style={styles.row}>
        <Text style={[styles.h2, { flex: 1 }]}>{person.self ? `${person.name} (you)` : person.name}</Text>
        <View style={[styles.pill, { backgroundColor: pillBg(state.key) }]}>
          <Text style={[styles.pillText, { color: pillFg(state.key) }]}>{state.label}</Text>
        </View>
      </View>

      {live && m ? (
        <>
          {m.plan_name && (
            <Text style={styles.meta}>{m.plan_name}{m.price_pennies != null ? ` · ${formatMoney(m.price_pennies)} a year` : ''}</Text>
          )}
          {m.period_from && m.period_to ? (
            <MembershipPeriod from={m.period_from} to={m.period_to} offline={m.source === 'offline'}
              renews={m.source === 'stripe' && m.has_card !== false && state.key !== 'cancelling'} />
          ) : null}
          {m.source === 'offline' ? (
            m.period_to ? null : (
              <Text style={styles.meta}>Paid to the club directly. Runs to {formatDateLong(m.current_period_end!.slice(0, 10))}.</Text>
            )
          ) : state.key === 'failing' ? (
            <View style={styles.warn}>
              <Ionicons name="alert-circle" size={16} color={colors.down} />
              <Text style={styles.warnText}>
                The last payment did not go through. Member prices continue for{' '}
                {days === null ? 'a short while' : `${days} more day${days === 1 ? '' : 's'}`} while the bank retries.
                {m.i_pay ? ' Update the card below to fix it.' : ''}
              </Text>
            </View>
          ) : m.current_period_end && !m.period_to ? (
            <Text style={styles.meta}>
              {state.key === 'cancelling' ? 'Member until ' : 'Renews on '}{formatDateLong(m.current_period_end.slice(0, 10))}
            </Text>
          ) : null}

          {m.renewable_by_card && (() => {
            // Next year by card: their membership has no card behind it (paid to the club, imported).
            // They save a card now; nothing is taken until it ends, then the full price yearly.
            const own = types.find((t) => t.id === m.plan_id);
            const planId = own?.id ?? pick;
            const price = own?.price_pennies ?? types.find((t) => t.id === pick)?.price_pennies ?? null;
            const first = m.period_to ? formatDateLong(addDay(m.period_to)) : 'the day it ends';
            return (
              <View style={styles.renewBox}>
                <Text style={styles.renewTitle}>Next year by card</Text>
                <Text style={styles.body}>
                  Set it up now and nothing is taken until {first}. Then {price != null ? formatMoney(price) : 'the full price'} a year,
                  automatically, so {person.self ? 'your' : `${person.name.split(' ')[0]}'s`} membership carries straight on.
                </Text>
                {!own && types.length > 0 && (
                  <>
                    <Text style={styles.meta}>The type it was is no longer sold. Choose one:</Text>
                    {types.map((t) => (
                      <Pressable key={t.id} onPress={() => setPick(t.id)} style={[styles.type, pick === t.id && styles.typeOn]}
                        accessibilityRole="radio" accessibilityState={{ selected: pick === t.id }}>
                        <Ionicons name={pick === t.id ? 'radio-button-on' : 'radio-button-off'} size={20}
                          color={pick === t.id ? colors.coral : colors.textMuted} />
                        <Text style={[styles.typeName, { flex: 1 }]}>{t.name}</Text>
                        <Text style={styles.typePrice}>{formatMoney(t.price_pennies)}</Text>
                      </Pressable>
                    ))}
                  </>
                )}
                {!person.details_complete ? (
                  // Rehearsal 2026-10-07: members brought in from a spreadsheet often have no details on
                  // file, and setting up card renewal needs them. Ask first, rather than refuse after.
                  <>
                    <Text style={styles.meta}>
                      First, the club needs {person.self ? 'your' : `${person.name.split(' ')[0]}'s`} date of birth, phone,
                      emergency contact and agreements.
                    </Text>
                    <Button title={person.self ? 'Finish my details' : `Finish ${person.name.split(' ')[0]}'s details`}
                      variant="secondary" onPress={onDetails} style={{ marginTop: spacing.sm }} />
                  </>
                ) : (<>
                <Button title="Set up card renewal" variant="secondary"
                  onPress={() => run('renew', async () => {
                    if (!planId) return { ok: false, error: 'Choose a membership type first.' };
                    const r = await startMembershipCheckout(planId, person.player_id, true);
                    if (!r.ok) return r;
                    try { await openOutside(r.url); return { ok: true }; }
                    catch (e) { return { ok: false, error: (e as Error)?.message ?? 'Could not open the card page.' }; }
                  })}
                  loading={busy === 'renew'} disabled={!!busy || !planId} style={{ marginTop: spacing.sm }} />
                <Text style={styles.small}>You save your card on Stripe's secure page. Nothing is charged today.</Text>
                </>)}
              </View>
            );
          })()}

          {m.source === 'stripe' && m.i_pay && m.has_card !== false && (
            <View style={styles.actions}>
              {state.key !== 'failing' && (
                <View style={styles.renewRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.renewLabel}>Renew automatically</Text>
                    <Text style={styles.meta}>
                      {state.key === 'cancelling' ? 'Off. Member prices continue until it ends, then it stops.'
                        : awaitingFirst ? `On. Your first payment${m.price_pennies != null ? ' of ' + formatMoney(m.price_pennies) : ''} is taken${m.period_to ? ' on ' + formatDateLong(addDay(m.period_to)) : m.current_period_end ? ' on ' + formatDateLong(m.current_period_end.slice(0, 10)) : ' soon'}. You can turn this off once it has been paid; to stop it before then, contact the club.`
                        : `On. ${m.price_pennies != null ? formatMoney(m.price_pennies) + ' is' : "It's"} taken again${m.period_to ? ' on ' + formatDateLong(addDay(m.period_to)) : ' when the year ends'}.`}
                    </Text>
                  </View>
                  {/* Not before the first real payment: a December joiner pays on 1 January, and
                      turning renewal off first would be a membership never paid for. The server
                      refuses it too (membership-renewal); this just doesn't offer it. */}
                  {!awaitingFirst && <Button title={state.key === 'cancelling' ? 'Turn on' : 'Turn off'} variant="secondary"
                    loading={busy === 'renew'} disabled={!!busy}
                    onPress={() => run('renew', () => setMembershipRenewal(m.id, !!m.cancel_at_period_end)).then((ok) => ok && onChanged())} />}
                </View>
              )}
              <Pressable onPress={() => run('card', () => openMembershipPortal(m.id))} disabled={!!busy}
                style={styles.linkRow} accessibilityRole="button">
                <Ionicons name="card-outline" size={16} color={colors.coralText} />
                <Text style={styles.link}>{busy === 'card' ? 'Opening…' : 'Update card or see receipts'}</Text>
              </Pressable>
            </View>
          )}
          {m.source === 'stripe' && !m.i_pay && (
            <Text style={styles.meta}>Paid for by someone else at the club.</Text>
          )}
        </>
      ) : !person.details_complete ? (
        <>
          {types.length > 0 && (
            <>
              <Text style={styles.body}>{lapsedText(m, person.self ? 'Your' : `${who}'s`)} Memberships on sale:</Text>
              {types.map((t) => (
                <View key={t.id} style={[styles.type, { opacity: 0.85 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeName}>{t.name}</Text>
                    {t.description ? <Text style={styles.meta}>{t.description}</Text> : null}
                  </View>
                  <TypePrice t={t} quote={quote} />
                </View>
              ))}
            </>
          )}
          <Text style={[styles.body, { marginTop: spacing.md }]}>
            Before joining, the club needs {person.self ? 'your' : `${who}'s`} date of birth, phone, emergency
            contact and agreements.
          </Text>
          <Button title={person.self ? 'Finish my details' : `Finish ${who}'s details`} onPress={onDetails}
            variant="secondary" style={{ marginTop: spacing.md }} />
        </>
      ) : types.length === 0 ? (
        <Text style={styles.body}>The club has not put any memberships on sale yet.</Text>
      ) : (
        <>
          <Text style={styles.body}>
            {lapsedText(m, person.self ? 'Your' : `${who}'s`)}
            {' '}Choose a type:
          </Text>
          {types.map((t) => (
            <Pressable key={t.id} onPress={() => setPick(t.id)} style={[styles.type, pick === t.id && styles.typeOn]}
              accessibilityRole="radio" accessibilityState={{ selected: pick === t.id }}>
              <Ionicons name={pick === t.id ? 'radio-button-on' : 'radio-button-off'} size={20}
                color={pick === t.id ? colors.coral : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.typeName}>{t.name}</Text>
                {t.description ? <Text style={styles.meta}>{t.description}</Text> : null}
              </View>
              <TypePrice t={t} quote={quote} />
            </Pressable>
          ))}
          {needShare && (
            <Pressable onPress={() => setAgree(!agree)} style={styles.shareRow} accessibilityRole="checkbox"
              accessibilityState={{ checked: agree }} accessibilityLabel={shareWording ?? ''}>
              <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? colors.coral : colors.textMuted} />
              <Text style={[styles.body, { flex: 1, marginTop: 0 }]}>{shareWording}</Text>
            </Pressable>
          )}
          <Button
            title={quote.december_free ? 'Join (nothing to pay today)'
              : `${person.self ? 'Join now' : `Join for ${who}`}${(() => { const t = types.find((x) => x.id === pick); return t ? ` · ${todayText(t)} today` : ''; })()}`}
            onPress={() => run('join', async () => {
              if (!pick) return { ok: false, error: 'Choose a membership type first.' };
              if (needShare) {
                if (!agree) return { ok: false, error: 'Please tick to agree to the details being passed on to register the membership.' };
                if (!person.details) return { ok: false, error: 'Please finish the details first.' };
                const saved = await savePersonDetails(person.player_id, { ...person.details, share_consent: true });
                if (!saved.ok) return saved;
              }
              const r = await startMembershipCheckout(pick, person.player_id);
              if (!r.ok) return r;
              try { await openOutside(r.url); return { ok: true }; }
              catch (e) { return { ok: false, error: (e as Error)?.message ?? 'Could not open the payment page.' }; }
            })}
            loading={busy === 'join'} disabled={!!busy || !pick || (needShare && !agree)} style={{ marginTop: spacing.md }} />
          <Text style={styles.small}>
            You pay through Stripe, on their own secure page. Card details never reach this app.
          </Text>
        </>
      )}

      {err && (
        <View style={styles.warn}>
          <Ionicons name="alert-circle" size={16} color={colors.down} />
          <Text style={styles.warnText}>{err}</Text>
        </View>
      )}
    </Card>
  );
}

function pillBg(k: string) {
  if (k === 'active') return colors.upSoft;
  if (k === 'failing') return colors.downSoft;
  if (k === 'cancelling') return colors.amberSoft;
  return colors.border;
}
function pillFg(k: string) {
  if (k === 'active') return colors.upText;
  if (k === 'failing') return colors.downText;
  if (k === 'cancelling') return colors.amberText;
  return colors.textMuted;
}

const styles = StyleSheet.create({
  // The same column as the other screens: 720 wide on its own, the site's 1152 inside the club site.
  page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shareRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  h1: { ...type.h1, color: colors.navy },
  h2: { ...type.h2, color: colors.navy },
  body: { ...type.body, color: colors.text, marginTop: spacing.xs },
  strong: { fontFamily: fonts.bold },
  meta: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  period: { marginTop: spacing.sm, gap: 6 },
  periodRange: { fontFamily: fonts.semibold, fontSize: 14, color: colors.navy },
  periodTo: { fontFamily: fonts.medium, color: colors.textMuted },
  periodTrack: { height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  periodFill: { height: '100%', borderRadius: 999 },
  periodFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  periodCount: { fontFamily: fonts.bold, fontSize: 14 },
  periodNext: { ...type.caption, color: colors.textMuted },
  small: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  actions: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  renewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  renewLabel: { ...type.body, fontFamily: fonts.bold, color: colors.text },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { fontFamily: fonts.bold, color: colors.coralText, fontSize: 13 },
  type: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: colors.border,
          borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  typeOn: { borderColor: colors.coral },
  typeName: { ...type.body, fontFamily: fonts.bold, color: colors.text },
  typePrice: { fontFamily: fonts.mono, fontSize: 16, color: colors.navy },
  typeThen: { ...type.caption, color: colors.textMuted },
  renewBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  renewTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.navy },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { ...type.caption, fontFamily: fonts.bold },
  warn: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.downSoft, borderRadius: radius.md,
          padding: spacing.sm, marginTop: spacing.sm },
  warnText: { ...type.caption, color: colors.downText, flex: 1 },
});
