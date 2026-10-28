import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

const NUMBER_FONT = 'Bricolage-800-40';
const LABEL_FONT = 'Bricolage-700-16';
const ROLL_MS = 260;

const pad = (n: number) => String(n).padStart(2, '0');

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (alive) setReduce(r);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

// Aligned to the second boundary, so a tile never shows a stale second for most of its turn.
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = new Date();
      setNow(next);
      timer = setTimeout(tick, 1000 - (next.getTime() % 1000));
    };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(timer);
  }, []);
  return now;
}

type TileProps = {
  value: string;
  label: string;
  color: string;
  reduce: boolean;
  /** Only the hours tile carries it, so the badge sits on the 1-12 reading it belongs to. */
  meridiem?: string;
};

// Mounting a digit replays the roll because each instance owns its own progress value; nothing
// here sets state from an effect.
function RollingText({
  value,
  direction,
  color,
  reduce,
}: {
  value: string;
  direction: 'in' | 'out';
  color: string;
  reduce: boolean;
}) {
  const progress = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: reduce ? 0 : ROLL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, reduce]);

  const from = direction === 'in' ? 10 : 0;
  const to = direction === 'in' ? 0 : -10;

  return (
    <Animated.Text
      style={[
        styles.number,
        { color, fontFamily: NUMBER_FONT },
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: direction === 'in' ? [0, 1] : [1, 0],
          }),
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] }),
            },
          ],
        },
      ]}>
      {value}
    </Animated.Text>
  );
}

function Tile({ value, label, color, reduce, meridiem }: TileProps) {
  const c = useTheme();
  // The digit that just left stays mounted for one roll so it can animate out. Deriving it while
  // rendering is what React recommends for state that follows a prop.
  const [display, setDisplay] = useState<{ shown: string; leaving: string | null }>(() => ({
    shown: value,
    leaving: null,
  }));
  if (display.shown !== value) {
    setDisplay({ shown: value, leaving: reduce ? null : display.shown });
  }

  useEffect(() => {
    if (display.leaving === null) return;
    const timer = setTimeout(() => setDisplay((d) => ({ ...d, leaving: null })), ROLL_MS);
    return () => clearTimeout(timer);
  }, [display.leaving]);

  return (
    <View style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.numberArea}>
        {display.leaving !== null && (
          <RollingText
            key={`out-${display.leaving}`}
            value={display.leaving}
            direction="out"
            color={color}
            reduce={reduce}
          />
        )}
        <RollingText
          key={`in-${display.shown}`}
          value={display.shown}
          direction="in"
          color={color}
          reduce={reduce}
        />
      </View>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.muted, fontFamily: LABEL_FONT }]}>{label}</Text>
        {meridiem !== undefined && (
          <Text
            style={[
              styles.meridiem,
              { color: c.accent, backgroundColor: c.accentSoft, fontFamily: LABEL_FONT },
            ]}>
            {meridiem}
          </Text>
        )}
      </View>
    </View>
  );
}

export function ClockCard() {
  const c = useTheme();
  const now = useNow();
  const reduce = useReduceMotion();

  const hours24 = now.getHours();
  const hours12 = pad(hours24 % 12 || 12);
  const meridiem = hours24 < 12 ? 'AM' : 'PM';

  return (
    <View
      accessible
      accessibilityLabel={`Clock. ${hours12} ${meridiem}, ${now.getMinutes()} minutes ${now.getSeconds()} seconds.`}
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border, shadowColor: c.text },
      ]}>
      <View style={styles.row}>
        <Tile
          value={hours12}
          label="HOURS"
          color={c.text}
          reduce={reduce}
          meridiem={meridiem}
        />
        <Tile value={pad(now.getMinutes())} label="MINUTES" color={c.text} reduce={reduce} />
        <Tile value={pad(now.getSeconds())} label="SECONDS" color={c.accent} reduce={reduce} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 10,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  row: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 10,
    paddingBottom: 7,
    gap: 3,
  },
  numberArea: { height: 34, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  number: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
  // The pill's line height matches the label's, so the hours tile stays the same height as its
  // neighbours and the three labels sit on one line.
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  meridiem: {
    fontSize: 8,
    lineHeight: 11,
    letterSpacing: 0.6,
    paddingHorizontal: 3,
    borderRadius: 5,
    overflow: 'hidden',
  },
  label: { fontSize: 9, letterSpacing: 1.2 },
});
