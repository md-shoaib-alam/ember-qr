import { useEffect, useState } from 'react';
import { Alert, AppState, StyleSheet, Switch, Text, View } from 'react-native';

import { clockSupported, disableClock, enableClock, readClockEnabled } from '@/clock';
import { tap } from '@/haptics';
import { useTheme } from '@/theme';

export function ClockNotificationToggle() {
  const c = useTheme();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clockSupported) return;
    let alive = true;
    const sync = () => {
      readClockEnabled()
        .then((saved) => {
          if (alive) setOn(saved);
        })
        .catch(() => {});
    };
    // Coming back from system settings is the only way the switch changes behind our back.
    sync();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (!clockSupported) return null;

  async function change(next: boolean) {
    tap('soft');
    setBusy(true);
    try {
      if (next) {
        await enableClock();
        setOn(true);
      } else {
        await disableClock();
        setOn(false);
      }
    } catch (e) {
      setOn(false);
      Alert.alert(
        'Could not turn the clock on',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.row, { borderTopColor: c.border }]}>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: c.text }]}>Clock in notification</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          A live clock pinned to the shade — swipe won’t clear it. Add the Ember clock widget from
          your home screen.
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
