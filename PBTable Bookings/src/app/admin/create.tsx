import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button, Card, Chip, Row } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import * as data from '@/services/data';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { SessionFormat } from '@/types';

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CreateSessionScreen() {
  const router = useRouter();
  const { sportProfile, refresh, showBanner } = useApp();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(isoInDays(2));
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('21:00');
  const [courts, setCourts] = useState('3');
  const [capacity, setCapacity] = useState(String(3 * sportProfile.playersPerCourt));
  const [capacityTouched, setCapacityTouched] = useState(false);
  const [format, setFormat] = useState<SessionFormat>('round_robin');
  const [graded, setGraded] = useState(true);
  const [banded, setBanded] = useState(false);
  const [skillMin, setSkillMin] = useState('3.0');
  const [skillMax, setSkillMax] = useState('4.0');
  const [pricePounds, setPricePounds] = useState('6');
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const onCourtsChange = (v: string) => {
    setCourts(v);
    if (!capacityTouched) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) setCapacity(String(n * sportProfile.playersPerCourt));
    }
  };

  const save = async () => {
    const courtsN = parseInt(courts, 10);
    const capacityN = parseInt(capacity, 10);
    const priceN = Math.round(parseFloat(pricePounds || '0') * 100);
    if (!title.trim() || Number.isNaN(courtsN) || Number.isNaN(capacityN)) {
      showBanner('Please fill in a title, courts and capacity.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await data.createSession({
        title: title.trim(),
        date,
        startTime,
        endTime,
        courts: courtsN,
        capacity: capacityN,
        format,
        affectsRating: graded,
        skillMin: banded ? parseFloat(skillMin) : undefined,
        skillMax: banded ? parseFloat(skillMax) : undefined,
        pricePence: Number.isNaN(priceN) ? 0 : priceN,
        isRecurring: recurring,
      });
      refresh();
      showBanner(`${title.trim()} created${recurring ? ' (recurring: POC creates one instance)' : ''}.`);
      router.back();
    } catch (e) {
      showBanner(e instanceof Error ? e.message : 'Could not create session', 'warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Field label="Title">
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Thursday Club League"
            placeholderTextColor={colors.textFaint}
          />
        </Field>

        <Row gap={spacing.md}>
          <Field label="Date (YYYY-MM-DD)" style={{ flex: 1.4 }}>
            <TextInput style={styles.input} value={date} onChangeText={setDate} />
          </Field>
          <Field label="Start" style={{ flex: 1 }}>
            <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} />
          </Field>
          <Field label="End" style={{ flex: 1 }}>
            <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} />
          </Field>
        </Row>

        <Row gap={spacing.md}>
          <Field label={`${sportProfile.terms.court}s`} style={{ flex: 1 }}>
            <TextInput
              style={styles.input}
              value={courts}
              onChangeText={onCourtsChange}
              keyboardType="number-pad"
            />
          </Field>
          <Field label={`Capacity (auto ${sportProfile.playersPerCourt}/${sportProfile.terms.court.toLowerCase()})`} style={{ flex: 1.6 }}>
            <TextInput
              style={styles.input}
              value={capacity}
              onChangeText={(v) => {
                setCapacityTouched(true);
                setCapacity(v);
              }}
              keyboardType="number-pad"
            />
          </Field>
        </Row>

        <Field label="Format">
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {sportProfile.formats.map((f) => (
              <Chip key={f} label={FORMAT_LABELS[f] ?? f} selected={format === f} onPress={() => setFormat(f)} />
            ))}
          </Row>
        </Field>

        <ToggleRow
          label={`Graded — affects ${sportProfile.terms.rating}`}
          hint="Only graded sessions produce matches and move ratings"
          value={graded}
          onChange={setGraded}
        />

        <ToggleRow
          label={`${sportProfile.terms.rating} band`}
          hint="Restrict to a rating range"
          value={banded}
          onChange={setBanded}
        />
        {banded ? (
          <Row gap={spacing.md}>
            <Field label="Min" style={{ flex: 1 }}>
              <TextInput style={styles.input} value={skillMin} onChangeText={setSkillMin} keyboardType="decimal-pad" />
            </Field>
            <Field label="Max" style={{ flex: 1 }}>
              <TextInput style={styles.input} value={skillMax} onChangeText={setSkillMax} keyboardType="decimal-pad" />
            </Field>
          </Row>
        ) : null}

        <Field label="Price (£, 0 = free)">
          <TextInput
            style={styles.input}
            value={pricePounds}
            onChangeText={setPricePounds}
            keyboardType="decimal-pad"
          />
        </Field>

        <ToggleRow
          label="Recurring weekly"
          hint="POC: creates a single instance with a weekly note"
          value={recurring}
          onChange={setRecurring}
        />

        <Button title="Create session" onPress={() => void save()} loading={saving} style={{ marginTop: spacing.lg }} />
      </Card>
    </ScrollView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={type.bodyBold}>{label}</Text>
        <Text style={[type.caption, { fontSize: 12 }]}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.coral, false: colors.border }}
        thumbColor={colors.card}
      />
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  label: {
    ...type.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.card,
  },
});
