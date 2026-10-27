import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { tap } from '@/haptics';
import { disableHourlyAlerts, enableHourlyAlerts, readAlertsEnabled } from '@/notifications';
import { useTheme } from '@/theme';

export function HourlyAlertsToggle() {
  const c = useTheme();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    readAlertsEnabled().then((saved) => {
      if (alive) setOn(saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function change(next: boolean) {
    tap('soft');
    setOn(next);
    setBusy(true);
    try {
      if (!next) {
        await disableHourlyAlerts();
        return;
      }
      const result = await enableHourlyAlerts();
      if (result === 'denied') throw new Error('Notifications are blocked for Ember QR.');
      if (result === 'inexact') {
        Alert.alert(
          'Alerts are on',
          'Android may deliver them a few minutes late until "Alarms & reminders" is allowed for Ember QR in system settings.',
        );
      }
    } catch (e) {
      setOn(false);
      await disableHourlyAlerts();
      Alert.alert('Could not turn on alerts', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.row, { borderTopColor: c.border }]}>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: c.text }]}>Hourly time alerts</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          A notification with the time, every hour, even when the app is closed.
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={change}
        disabled={busy}
        trackColor={{ false: c.border, true: c.accentSoft }}
        thumbColor={on ? c.accent : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingTop: 14 },
  texts: { flex: 1, gap: 3 },
  title: { fontFamily: 'Bricolage-700-16', fontSize: 15 },
  subtitle: { fontSize: 13, lineHeight: 18 },
});
