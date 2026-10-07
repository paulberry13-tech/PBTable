import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmergencyContactCard } from '@/components/EmergencyContactCard';
import { HelpLink } from '@/components/HelpLink';
import { TopUpSheet } from '@/components/TopUpSheet';
import { Avatar, Badge, Button, Card, CapacityBar, DateBlock, ErrorState, LoadingView, Row } from '@/components/ui';
import { hoursUntilLondonStart } from '@/domain/cancelNotice';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import { dateBlockParts, formatTimeRange, initialsOf, skillBandLabel, spotsLeft } from '@/lib/format';
import { STRIPE_TOPUP } from '@/services/config';
import * as data from '@/services/data';
import { emergencyContactStatus } from '@/services/people';
import { EMBEDDED_FILL, useEmbedded } from '@/services/embed';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

export default function SessionDetailScreen() {
  const embedded = useEmbedded();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, sportProfile, refresh, showBanner, promptSignIn } = useApp();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [shortfallPence, setShortfallPence] = useState(0);
  const [booking, setBooking] = useState(false);
  // Section 21: a club that asks everyone who books for an emergency contact. Asked here, before
  // the Book button, rather than after a refusal. The database refuses the booking regardless.
  const [needContact, setNeedContact] = useState(false);
  useEffect(() => {
    let live = true;
    if (!currentUser) { setNeedContact(false); return; }
    emergencyContactStatus().then((s) => { if (live) setNeedContact(!!s && s.required && !s.on_file); });
    return () => { live = false; };
  }, [currentUser?.id]);

  const { data: session, error } = useAsyncData(() => data.getSession(id), [id]);
  const { data: members } = useAsyncData(() => data.getMembers());
  const { data: balance, error: balanceError } = useAsyncData(
    () => (currentUser ? data.getBalance(currentUser.id) : Promise.resolve(0)),
    [currentUser?.id]
  );
  // Can THIS club take a card payment? The top-up sheet cannot work it out for
  // itself, and without an answer it assumed no: a Gloucester member who tapped
  // Book, was short, and reached the top-up sheet was told "this club isn't taking
  // card payments yet" -- while the very same sheet, opened from the Wallet tab,
  // offered Stripe and worked. The Wallet passed this prop and this screen did not.
  // (Reported by Gloucester, 2026-09-02.)
  //
  // Asked on mount rather than when the sheet opens, so the answer is already in
  // hand by the time anyone taps Book. clubTakesPayments caches per session and
  // fails closed, so a blip cannot invent a payment path that is not there.
  const { data: canPay } = useAsyncData(() => data.clubTakesPayments(), []);

  const membersById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  if (error) return <ErrorState message={error} />;
  // Signed-out visitors may READ this screen — only the session itself is required.
  if (!session) return <LoadingView />;

  const left = spotsLeft(session);
  const full = left === 0;
  // Booking can be closed on a session that hasn't happened yet (line-up built, or the
  // club hasn't opened it). The list only shows open ones, but you can still reach this
  // screen from My Bookings or a stale link — without this the Book button would look
  // live and `book_spot` would reject it with a raw error.
  // The session lock (booking_cutoff_hours): members can't book this close to the start. Shown
  // here rather than discovered at the tap -- or worse, after paying Stripe for a top-up the
  // member then couldn't spend. The server enforces it either way.
  const lockHours = session.bookingCutoffHours ?? 0;
  const locked = lockHours > 0 && session.status === 'upcoming'
    && hoursUntilLondonStart(session.date, session.startTime) < lockHours;
  const closed = session.bookingOpen === false || session.status !== 'upcoming' || locked;
  const band = skillBandLabel(session);
  const parts = dateBlockParts(session.date);
  const kind = session.affectsRating ? 'graded' : 'social';
  const roster = session.bookings.filter((b) => b.status === 'booked' || b.status === 'attended');
  // Prefer the real attendee names (live backend); fall back to the local roster.
  const everyone =
    session.attendees ??
    roster.map((b) => {
      const m = membersById.get(b.memberId);
      return { memberId: b.memberId, name: m?.name ?? '…', status: b.status, waitlistPos: null };
    });
  // session_attendees now carries the queue as well (migration 39) so a newcomer
  // can see real demand. They are NOT playing, so they get their own section.
  const playing = everyone.filter((p) => p.status !== 'waitlisted');
  const waiting = everyone.filter((p) => p.status === 'waitlisted');
  const myBooking = session.bookings.find(
    (b) => b.memberId === currentUser?.id && (b.status === 'booked' || b.status === 'waitlisted')
  );
  // Where I am in the queue. The database keeps it numbered 1, 2, 3 with no gaps (migration 97).
  const myQueuePlace = myBooking?.status === 'waitlisted'
    ? (() => {
        const i = waiting.findIndex((p) => p.memberId === currentUser?.id);
        return i < 0 ? null : (waiting[i].waitlistPos ?? i + 1);
      })()
    : null;
  const outsideBand =
    session.skillMin !== undefined &&
    currentUser?.rating !== undefined &&
    (currentUser.rating < (session.skillMin ?? 0) || currentUser.rating > (session.skillMax ?? 99));

  const balancePence = balance ?? 0;
  // What THIS member pays: member vs non-member rate, and £0 when a free taster
  // applies. Falls back to the session's member price in mock mode, which has no
  // server-side pricing. Quoting session.pricePence here showed a non-member the
  // member rate and then charged them the higher one at the tap.
  const cost = session.yourPricePence ?? session.pricePence;
  const taster = !!session.tasterApplies;
  // Members-first window: a non-member sees WHEN, not just a refusal.
  const waitUntil = session.youCanBookAt ? new Date(session.youCanBookAt) : null;
  const mustWait = !!waitUntil && waitUntil.getTime() > Date.now();
  const waitLabel = waitUntil
    ? waitUntil.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  const needsGuardian = !!session.guardianRequired;
  // Invite-only (migration 86): someone signed in who isn't on the list gets no Book button at all.
  // book_spot refuses them regardless; this just says so before the tap rather than after it.
  const inviteOnly = !!session.inviteOnly;
  const notInvited = inviteOnly && !!currentUser && session.youAreInvited === false;
  const canAfford = balancePence >= cost;
  // A balance that failed to load is not £0: don't push a top-up on a guess.
  const balanceUnknown = !!currentUser && !!balanceError && cost > 0;

  const completeBooking = async () => {
    setBooking(true);
    try {
      if (!currentUser) return;   // unreachable: onBookPress prompts sign-in first
      const result = await data.bookSession(session.id, currentUser.id);
      refresh();
      if (result.waitlisted) {
        showBanner(
          cost > 0 && !canAfford
            ? `You're #${result.position} on the waitlist for ${session.title}. Top up to ${formatMoneyShort(cost)} or you'll be passed over when a place comes up.`
            : `You're #${result.position} on the waitlist for ${session.title}.`,
          'info',
        );
      } else if (cost > 0) {
        showBanner(`Booked! ${formatMoneyShort(cost)} drawn from your balance.`, 'success');
      } else {
        showBanner(`Booked! See you at ${session.title}.`, 'success');
      }
      if (router.canGoBack()) router.back();
      else router.replace('/bookings');
    } catch (e) {
      if (e instanceof data.EmergencyContactNeededError) {
        setNeedContact(true);
        showBanner('The club asks everyone who books for an emergency contact. Add one just above the Book button.', 'info');
      } else if (e instanceof data.InsufficientBalanceError) {
        // Balance moved under us (e.g. concurrent booking) — send to top-up.
        setShortfallPence(e.shortfallPence);
        setTopUpOpen(true);
      } else {
        showBanner(e instanceof Error ? e.message : 'Booking failed', 'warning');
      }
    } finally {
      setBooking(false);
    }
  };

  const onBookPress = () => {
    // Browsing is public, so this is the first point identity is needed.
    if (!currentUser) { promptSignIn(); return; }
    if (needContact) {
      showBanner('Add an emergency contact first, just above the Book button.', 'info');
      return;
    }
    if (balanceUnknown) {
      showBanner('We couldn’t check your balance just now. Please try again in a moment.', 'warning');
      return;
    }
    if (full || cost === 0 || canAfford) {
      void completeBooking();
    } else {
      setShortfallPence(cost - balancePence);
      setTopUpOpen(true);
    }
  };

  const onTopUp = async (amountPence: number) => {
    if (!currentUser) return;
    // Both Stripe paths hand off to a hosted payment page, so topUp() returns with
    // the browser already on its way out and the balance untouched. Completing the
    // booking here would spend money that has not arrived -- book_spot would refuse
    // it, and the member would watch an error flash by as the page left. The member
    // returns to the Wallet with the credit applied and books from there.
    //
    // This mattered the moment canPay started being passed above: until then the
    // club path was unreachable from this screen, so the line below was only ever
    // hit after a demo top-up that credits instantly.
    const leavingForStripe = canPay === true || STRIPE_TOPUP;
    // Deliberately unguarded: TopUpSheet catches, keeps itself open and shows the
    // reason in place. Catching here as well would hide it behind a closing sheet.
    await data.topUp(currentUser.id, amountPence);
    if (leavingForStripe) return;
    refresh();
    setTopUpOpen(false);
    await completeBooking();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, embedded && EMBEDDED_FILL]}>
      {/* Fixture hero — the match poster. Navy chrome, kind-coloured rule, big Oswald title. */}
      <View style={styles.hero}>
        <View style={[styles.heroRule, { backgroundColor: kind === 'graded' ? colors.coral : colors.up }]} />
        <Row gap={spacing.lg} style={{ alignItems: 'flex-start' }}>
          <DateBlock {...parts} kind={kind} size="lg" tone="onDark" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{session.title}</Text>
            <Row style={{ marginTop: 6, flexWrap: 'wrap' }} gap={spacing.md}>
              <Row gap={5}>
                <Ionicons name="time-outline" size={14} color={colors.coralBright} />
                <Text style={styles.heroMeta}>{formatTimeRange(session)}</Text>
              </Row>
              {session.courts > 0 ? (
                <Row gap={5}>
                  <Ionicons name="grid-outline" size={14} color={colors.coralBright} />
                  <Text style={styles.heroMeta}>
                    {session.courts} {sportProfile.terms.court.toLowerCase()}
                    {session.courts === 1 ? '' : 's'}
                  </Text>
                </Row>
              ) : null}
            </Row>
            {session.location ? (
              <Row gap={5} style={{ marginTop: 4 }}>
                <Ionicons name="location-outline" size={14} color={colors.coralBright} />
                <Text style={[styles.heroMeta, { flexShrink: 1 }]} numberOfLines={2}>
                  {session.location}
                </Text>
              </Row>
            ) : null}
            {session.host ? (
              <Row gap={5} style={{ marginTop: 4 }}>
                <Ionicons name="person-outline" size={14} color={colors.coralBright} />
                <Text style={[styles.heroMeta, { flexShrink: 1 }]} numberOfLines={1}>
                  Hosted by {session.host}
                </Text>
              </Row>
            ) : null}
            <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }} gap={5}>
              {session.affectsRating ? <Badge label="Graded" tone="coral" /> : <Badge label="Social" tone="green" />}
              {session.format !== 'social' && FORMAT_LABELS[session.format] ? (
                <Badge label={FORMAT_LABELS[session.format]} tone="grey" />
              ) : null}
              {band ? <Badge label={`${sportProfile.terms.rating} ${band}`} tone="grey" /> : null}
            </Row>
          </View>
        </Row>
        <Row style={{ marginTop: spacing.lg, alignItems: 'center' }} gap={spacing.md}>
          <CapacityBar booked={playing.length} capacity={session.capacity} />
          <Text style={styles.heroSpots}>
            {full ? 'FULL' : `${left} LEFT`}
          </Text>
        </Row>
        <Text style={[styles.heroMeta, { marginTop: 6 }]}>
          {session.affectsRating
            ? `Counts towards your ${sportProfile.terms.rating}`
            : `Just for fun. No ${sportProfile.terms.rating} impact`}
        </Text>
      </View>

      {/* Who's playing — faces first, numbers second. */}
      <Card style={{ marginTop: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>Who's playing</Text>
          <Text style={[type.captionBold, type.mono, full && { color: colors.amberText }]}>
            {playing.length}/{session.capacity}
            {full ? ' · Full' : ''}
          </Text>
        </Row>
        {playing.length === 0 ? (
          <Text style={[type.caption, { marginTop: spacing.sm }]}>No one's booked in yet. Be the first.</Text>
        ) : (
          <View style={{ marginTop: spacing.sm }}>
            {playing.map((p, i) => (
              <Row key={`${p.memberId}-${i}`} style={styles.playerRow} gap={spacing.md}>
                <Avatar initials={initialsOf(p.name)} index={i} />
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Row>
            ))}
          </View>
        )}
          {waiting.length > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={[type.captionBold, { color: colors.amberText }]}>
                Waiting list · {waiting.length}
              </Text>
              {waiting.map((p, i) => (
                <Row key={`w-${p.memberId}-${i}`} style={styles.playerRow} gap={spacing.md}>
                  <Text style={[type.captionBold, type.mono, { width: 18, color: colors.textMuted }]}>
                    {p.waitlistPos ?? i + 1}
                  </Text>
                  <Text style={[type.body, { flex: 1, color: colors.textMuted }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Row>
              ))}
            </View>
          ) : null}
      </Card>

      {outsideBand ? (
        <Text style={[type.caption, { marginTop: spacing.md, color: colors.amberText }]}>
          Heads-up: your {sportProfile.terms.rating} ({currentUser.rating?.toFixed(2)}) is outside this
          session's band, but you can still book for the demo.
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
        {myBooking ? (
          <Card style={{ backgroundColor: colors.upSoft, borderColor: 'transparent' }}>
            <Text style={[type.h2, { color: colors.upText }]}>
              {myBooking.status === 'waitlisted'
                ? (myQueuePlace ? `You're #${myQueuePlace} on the waitlist` : "You're on the waitlist")
                : "You're booked in"}
            </Text>
            {myBooking.status === 'waitlisted' && cost > 0 ? (
              <Text style={[type.caption, { marginTop: 4 }]}>
                When a place comes up, it goes to the first person on the list with {formatMoneyShort(cost)} in their
                wallet. {balanceUnknown || canAfford
                  ? 'Keep it topped up so the place is yours.'
                  : `You have ${formatMoneyShort(balancePence)}, so top up now or the place passes to the next person.`}
              </Text>
            ) : null}
            <Text style={[type.caption, { marginTop: 4 }]}>
              Manage or cancel from the My Bookings tab.
            </Text>
          </Card>
        ) : closed ? (
          <Card>
            {/* "Hasn't opened yet" and "was open, now closed" are different answers to a
                member deciding whether to check back, and booking_opened_at (stamped on
                the first open, migration 37) is what tells them apart. Preview clubs
                (migration 62) surface exactly the first kind. */}
            <Text style={type.h2}>
              {session.status === 'completed'
                ? 'This session has finished'
                : session.status === 'in_progress'
                  ? 'This session is under way'
                  : locked
                    ? 'Booking has closed'
                    : !session.bookingOpenedAt
                    ? 'Booking hasn’t opened yet'
                    : 'Booking is closed'}
            </Text>
            <Text style={[type.caption, { marginTop: 4 }]}>
              {session.status !== 'upcoming'
                ? 'You can’t book a spot any more.'
                : locked
                  ? `The club closes booking ${lockHours === 1 ? '1 hour' : `${lockHours} hours`} before the start. If you still want to play, contact the club.`
                  : !session.bookingOpenedAt
                  ? session.bookingOpensAt
                    ? `Booking opens ${new Date(session.bookingOpensAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Check back then.`
                    : 'The club hasn’t opened booking for this session yet. Check back soon.'
                  : 'The club isn’t taking bookings for this one. Check with them if you think that’s wrong.'}
            </Text>
          </Card>
        ) : notInvited ? (
          <Card>
            <Text style={type.h2}>By invitation</Text>
            <Text style={[type.caption, { marginTop: 4 }]}>
              Only the players the club has invited can book this session. If you think you should be on the list, contact the club.
            </Text>
          </Card>
        ) : (
          <>
            {inviteOnly && (
              <Card style={{ paddingVertical: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.up }}>
                <Text style={type.bodyBold}>{currentUser ? 'You’re invited' : 'By invitation'}</Text>
                <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
                  {currentUser
                    ? 'This session is by invitation, and you’re on the list. Book it as normal.'
                    : 'Only the players the club has invited can book this session. If that’s you, sign in to book.'}
                </Text>
              </Card>
            )}
            {/* The money, laid out BEFORE the button — no surprises at the tap. */}
            {mustWait && (
              <Card style={{ paddingVertical: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.amber }}>
                <Text style={type.bodyBold}>Members book first</Text>
                <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
                  You can book this session from {waitLabel}.
                </Text>
              </Card>
            )}
            {needsGuardian && (
              <Card style={{ paddingVertical: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.amber }}>
                <Text style={type.bodyBold}>A parent or guardian must come with you</Text>
                <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
                  Junior members can play as long as a parent or guardian is present for the whole session.
                </Text>
              </Card>
            )}
            {!currentUser ? null : !full && taster ? (
              <Card style={{ paddingVertical: spacing.md }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={type.bodyBold}>Free taster</Text>
                  <Text style={[type.bodyBold, { color: colors.upText }]}>
                    {formatMoneyShort(0)}
                  </Text>
                </Row>
                <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
                  Your first session is on the club. Nothing comes off your balance.
                </Text>
              </Card>
            ) : !full && cost > 0 ? (
              <Card style={{ paddingVertical: spacing.md }}>
                <MathsRow label="Price" value={formatMoneyShort(cost)} />
                <MathsRow label="Your balance" value={formatMoney(balancePence)} />
                <View style={styles.mathsRule} />
                {canAfford ? (
                  <MathsRow label="Balance after booking" value={formatMoney(balancePence - cost)} strong />
                ) : (
                  <MathsRow
                    label="You need to top up"
                    value={formatMoney(cost - balancePence)}
                    strong
                    tint={colors.coralText}
                  />
                )}
              </Card>
            ) : null}
            {needContact ? (
              <EmergencyContactCard onSaved={() => {
                setNeedContact(false);
                showBanner('Emergency contact saved. Now tap Book.', 'success');
              }} />
            ) : null}
            <Button
              title={
                !currentUser
                  ? 'Sign in to book'
                : mustWait
                  ? `Opens for you ${waitLabel}`
                    : full
                  ? 'Join waitlist'
                  : cost === 0
                    ? 'Book for free'
                    : canAfford
                      ? `Book · ${formatMoneyShort(cost)}`
                      : `Top up & book · ${formatMoneyShort(cost)}`
              }
              onPress={onBookPress}
              loading={booking}
              // Disabled, not hidden: the member sees the session and when it becomes
                // theirs to book. book_spot refuses it server-side as well.
                disabled={mustWait}
              variant={full || mustWait ? 'secondary' : 'primary'}
            />
            {full ? (
              <Text style={[type.caption, { textAlign: 'center' }]}>
                Nothing is charged while you wait. You only pay if a spot frees up.
                {cost > 0
                  ? ` A place goes to the first person on the list with ${formatMoneyShort(cost)} in their wallet, so keep yours topped up.`
                  : ''}
              </Text>
            ) : null}
            <HelpLink guide={full ? 'waiting-list' : 'book'} label={full ? 'How the waiting list works' : 'How booking works'} center />
          </>
        )}
      </View>

      <TopUpSheet
        canPay={canPay}
        visible={topUpOpen}
        minPence={shortfallPence}
        reason={`This session costs ${formatMoneyShort(cost)}. Top up to book ${session.title}.`}
        onConfirm={onTopUp}
        onClose={() => setTopUpOpen(false)}
      />
    </ScrollView>
  );
}

function MathsRow({
  label, value, strong, tint,
}: { label: string; value: string; strong?: boolean; tint?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={strong ? type.bodyBold : type.body}>{label}</Text>
      <Text
        style={[
          strong ? type.bodyBold : type.body,
          { fontFamily: fonts.monoBold, fontVariant: ['tabular-nums'] },
          tint ? { color: tint } : null,
        ]}
      >
        {value}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadow.raised,
  },
  heroRule: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 4,
  },
  heroTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    lineHeight: 28,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.textOnDark,
  },
  heroMeta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textOnDarkMuted,
  },
  heroSpots: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textOnDark,
  },
  playerRow: {
    paddingVertical: 6,
  },
  mathsRule: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
});
