import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, LoadingView, Row } from '@/components/ui';
import { formatSessionWhen, spotsLeft } from '@/lib/format';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, spacing, type } from '@/theme';

export default function AdminScreen() {
  const router = useRouter();
  const { sportProfile } = useApp();
  const { data: sessions, loading } = useAsyncData(() => data.getSessions());

  if (loading && !sessions) return <LoadingView />;

  const upcoming = (sessions ?? []).filter((s) => s.status === 'upcoming');
  const completed = (sessions ?? []).filter((s) => s.status === 'completed').reverse();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Admin</Text>
      <Text style={type.caption}>
        Run the club: create {sportProfile.terms.session.toLowerCase()}s, generate{' '}
        {sportProfile.terms.slip.toLowerCase()}s, enter scores.
      </Text>

      <Button
        title={`＋ Create ${sportProfile.terms.session.toLowerCase()}`}
        onPress={() => router.push('/admin/create')}
        style={{ marginTop: spacing.lg }}
      />

      <Text style={[type.h1, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
        Upcoming {sportProfile.terms.session.toLowerCase()}s
      </Text>
      {upcoming.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => router.push({ pathname: '/admin/manage/[id]', params: { id: s.id } })}
        >
          <Card style={{ marginBottom: spacing.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={type.h2}>{s.title}</Text>
                <Text style={[type.caption, { marginTop: 2 }]}>{formatSessionWhen(s)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Row>
            <Row gap={6} style={{ marginTop: spacing.sm }}>
              {s.affectsRating ? <Badge label="Graded" tone="coral" /> : <Badge label="Social" tone="green" />}
              <Badge
                label={`${s.capacity - spotsLeft(s)}/${s.capacity} booked`}
                tone={spotsLeft(s) === 0 ? 'amber' : 'grey'}
              />
              {s.waitlist.length > 0 ? <Badge label={`${s.waitlist.length} waitlisted`} tone="amber" /> : null}
            </Row>
          </Card>
        </Pressable>
      ))}

      <Text style={[type.h1, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Completed</Text>
      {completed.map((s) => (
        <Card key={s.id} style={{ marginBottom: spacing.md, opacity: 0.85 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text style={type.h2}>{s.title}</Text>
              <Text style={[type.caption, { marginTop: 2 }]}>{formatSessionWhen(s)}</Text>
            </View>
            <Badge label="Scores in" tone="navy" />
          </Row>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
});
