import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { bgFor, useTheme, useThemeMode, type Scheme } from '@/theme';

/**
 * Sun/moon theme toggle. Tapping launches a full-screen overlay: the sky circle
 * expands from the button to the screen centre, plays the sun/moon arc swap at
 * large size (committing the theme mid-swap), then collapses back into the button.
 */

const SWAP_MS = 480;
const TRAVEL_MS = 260;
const STEPS = 30;
const ARC_RADIUS = 115;
const QUARTER_TURN = Math.PI / 2;

const MOON = { side: -1, spin: 25 };
const SUN = { side: 1, spin: 120 };

const NIGHT_STOPS = ['#090f2a', '#16204b', '#2a2f66'];
const DAY_STOPS = ['#4ea8ff', '#9fd3ff', '#e3f3ff'];
const STARS = [
  { x: 24, y: 22, r: 1.6, t: 2100 },
  { x: 66, y: 16, r: 1.2, t: 2600 },
  { x: 80, y: 42, r: 1.8, t: 1900 },
  { x: 38, y: 58, r: 1.1, t: 2900 },
  { x: 58, y: 74, r: 1.4, t: 2300 },
  { x: 14, y: 72, r: 1.2, t: 2500 },
];

// Both bodies ride one circle centered below the button, like a sky dome.
function arcPoint(side: number, angle: number) {
  return { x: side * ARC_RADIUS * Math.sin(angle), y: ARC_RADIUS * (1 - Math.cos(angle)) };
}

function easeInCubic(t: number) {
  return t * t * t;
}

function easeOutBack(t: number) {
  const overshoot = 1.4;
  return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

type Sample = { x: number; y: number; rot: number; op: number; sc: number };

function settingSamples(side: number, spin: number): Sample[] {
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const travelled = easeInCubic(t);
    const { x, y } = arcPoint(side, travelled * QUARTER_TURN);
    return { x, y, rot: side * spin * travelled, op: t < 0.55 ? 1 : (1 - t) / 0.45, sc: 1 };
  });
}

function risingSamples(side: number, spin: number): Sample[] {
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const remaining = 1 - easeOutBack(t);
    const { x, y } = arcPoint(side, remaining * QUARTER_TURN);
    return { x, y, rot: side * spin * remaining, op: Math.min(1, t / 0.3), sc: 1 - 0.28 * remaining };
  });
}

const SET = { moon: settingSamples(MOON.side, MOON.spin), sun: settingSamples(SUN.side, SUN.spin) };
const RISE = { moon: risingSamples(MOON.side, MOON.spin), sun: risingSamples(SUN.side, SUN.spin) };
// The setting body owns the first 65% of the clock, the rising one 36%..100%, as in the reference timeline.
const SET_IN = Array.from({ length: STEPS + 1 }, (_, i) => (i / STEPS) * 0.65);
const RISE_IN = Array.from({ length: STEPS + 1 }, (_, i) => 0.36 + (i / STEPS) * 0.64);
const SKY_EASE = Array.from({ length: STEPS + 1 }, (_, i) => Easing.bezier(0.65, 0, 0.35, 1)(i / STEPS));
const CLOCK = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);

type BodyKey = 'moon' | 'sun';

// Percentages cannot ride the native driver, so translations are resolved against the body's box.
function flightStyle(key: BodyKey, role: 'set' | 'rise', master: Animated.Value, size: number): ViewStyle {
  const inputRange = role === 'set' ? SET_IN : RISE_IN;
  const s = (role === 'set' ? SET : RISE)[key];
  const k = size / 100;
  const nums = (pick: (v: Sample) => number) =>
    master.interpolate({ inputRange, outputRange: s.map(pick), extrapolate: 'clamp' });
  const strs = (pick: (v: Sample) => string) =>
    master.interpolate({ inputRange, outputRange: s.map(pick), extrapolate: 'clamp' });
  return {
    opacity: nums((v) => v.op),
    transform: [
      { translateX: nums((v) => v.x * k) },
      { translateY: nums((v) => v.y * k) },
      { rotate: strs((v) => `${v.rot}deg`) },
      { scale: nums((v) => v.sc) },
    ],
  } as unknown as ViewStyle;
}

function restStyle(key: BodyKey, visible: boolean, size: number): ViewStyle {
  const side = key === 'moon' ? MOON.side : SUN.side;
  const offset = (side * ARC_RADIUS * size) / 100;
  return visible
    ? { opacity: 1, transform: [] }
    : { opacity: 0, transform: [{ translateX: offset }, { translateY: offset }] };
}

const SKY_BANDS = 36;

// The reference sky is a 3-stop vertical gradient at offsets 0 / 0.6 / 1.
function skyColor(stops: string[], t: number): string {
  const chan = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const mix = (h1: string, h2: string, k: number) =>
    `#${[1, 3, 5].map((i) => Math.round(chan(h1, i) + (chan(h2, i) - chan(h1, i)) * k).toString(16).padStart(2, '0')).join('')}`;
  return t <= 0.6 ? mix(stops[0], stops[1], t / 0.6) : mix(stops[1], stops[2], (t - 0.6) / 0.4);
}

// Plain Views, not react-native-svg: SVG children paint nothing in Expo Go on device.
function Sky({ stops }: { stops: string[] }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {Array.from({ length: SKY_BANDS }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: skyColor(stops, (i + 0.5) / SKY_BANDS) }} />
      ))}
    </View>
  );
}

type Flight = { from: Scheme; to: Scheme };

type FaceProps = {
  size: number;
  flight: Flight | null;
  master: Animated.Value;
  scheme: Scheme;
  twinkle: Animated.Value[];
};

/** The sky + sun/moon bodies, shared by the header button and the travelling overlay circle. */
function Face({ size, flight, master, scheme, twinkle }: FaceProps) {
  const nightOp = flight
    ? master.interpolate({
        inputRange: CLOCK,
        outputRange: SKY_EASE.map((e) => (flight.from === 'dark' ? 1 - e : e)),
        extrapolate: 'clamp',
      })
    : scheme === 'dark'
      ? 1
      : 0;
  const dayOp = flight
    ? master.interpolate({
        inputRange: CLOCK,
        outputRange: SKY_EASE.map((e) => (flight.from === 'dark' ? e : 1 - e)),
        extrapolate: 'clamp',
      })
    : scheme === 'light'
      ? 1
      : 0;
  const moonStyle = flight
    ? flightStyle('moon', flight.from === 'dark' ? 'set' : 'rise', master, size)
    : restStyle('moon', scheme === 'dark', size);
  const sunStyle = flight
    ? flightStyle('sun', flight.from === 'light' ? 'set' : 'rise', master, size)
    : restStyle('sun', scheme === 'light', size);
  const starScale = size / 40;

  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: dayOp }]}>
        <Sky stops={DAY_STOPS} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: nightOp }]}>
        <Sky stops={NIGHT_STOPS} />
        {STARS.map((star, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.star,
              {
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: star.r * 2 * starScale,
                height: star.r * 2 * starScale,
                opacity: twinkle[i],
              },
            ]}
          />
        ))}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.body, moonStyle]}>
        <View style={[styles.halo, { width: size * 0.68, height: size * 0.68, borderRadius: size * 0.34, backgroundColor: 'rgba(252,211,77,0.45)' }]} />
        <Icon name="dark_mode" size={size * 0.5} color="#FDE68A" filled />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.body, sunStyle]}>
        <View style={[styles.halo, { width: size * 0.68, height: size * 0.68, borderRadius: size * 0.34, backgroundColor: 'rgba(251,146,60,0.45)' }]} />
        <Icon name="light_mode" size={size * 0.5} color="#FB923C" />
      </Animated.View>
    </>
  );
}

type BtnRect = { x: number; y: number; w: number; h: number };

/** Overlay geometry, frozen at press time so a keyboard or tab re-layout cannot move the circle. */
type Geo = { rect: BtnRect; cx: number; cy: number; big: number; offsetY: number };
type Overlay = Geo & { flight: Flight };

// expo-router detaches inactive tab scenes, so measureInWindow can answer with a 0x0 rect,
// or not answer at all. Both cases get a deadline instead of relying on the callback.
const MEASURE_MS = 250;
const SEQUENCE_MS = TRAVEL_MS * 2 + SWAP_MS + 500;

export function SunMoonToggle({ size = 44 }: { size?: number }) {
  const c = useTheme();
  const { scheme, toggle } = useThemeMode();
  const insets = useSafeAreaInsets();
  const [reduce, setReduce] = useState(false);
  const [traveling, setTraveling] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [twinkle] = useState(() => STARS.map(() => new Animated.Value(0.35)));
  const [travel] = useState(() => new Animated.Value(0));
  const [swap] = useState(() => new Animated.Value(0));
  const btnRef = useRef<ViewInstance>(null);
  // `traveling` is state, so two taps landing inside the async measure window would both pass it.
  const busy = useRef(false);
  const committed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic run id: a watchdog exit retires a run, and any callback it leaves in flight must
  // not be mistaken for a callback of the run the next tap starts.
  const run = useRef(0);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (alive) setReduce(r);
    });
    // Each tab keeps its own toggle, so a live setting change has to reach the mounted ones.
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Stars are only painted while the night sky is, so the loops must not burn frames in light mode.
  useEffect(() => {
    if (reduce || scheme !== 'dark') return;
    const loops = twinkle.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: STARS[i].t / 2, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.35, duration: STARS[i].t / 2, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduce, scheme, twinkle]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      travel.stopAnimation();
      swap.stopAnimation();
    },
    [travel, swap],
  );

  const live = (id: number) => busy.current && run.current === id;

  /** The one place a tap is honoured: whichever leg notices first, and never twice. */
  function commit(id: number) {
    if (run.current !== id || committed.current) return;
    committed.current = true;
    toggle();
  }

  /** The single exit from a run: always leaves the button idle, never loses the tap. */
  function finish(id: number) {
    if (!live(id)) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    busy.current = false;
    commit(id);
    // A watchdog exit lands mid-timing; the legs must not keep driving the value the next run resets.
    travel.stopAnimation();
    swap.stopAnimation();
    setOverlay(null);
    setTraveling(false);
    swap.setValue(0);
    travel.setValue(0);
  }

  function arm(id: number, ms: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => finish(id), ms);
  }

  function play(id: number, geo: Geo) {
    setOverlay({ ...geo, flight: { from: scheme, to: scheme === 'dark' ? 'light' : 'dark' } });
    setTraveling(true);
    travel.setValue(0);
    swap.setValue(0);
    arm(id, SEQUENCE_MS);

    // `travel` stays on the JS driver: it drives the overlay that mounts in this same commit, and a
    // native animation started before its view attaches is not worth the risk. Only its two short
    // legs are JS; the long arc, sky cross-fade and starfield ride the native driver.
    Animated.timing(travel, { toValue: 1, duration: TRAVEL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(
      ({ finished }) => {
        if (!live(id)) return;
        // Commit on the first leg, not the last: an interrupted trip home must not undo the tap.
        commit(id);
        if (!finished) return finish(id);
        Animated.timing(swap, { toValue: 1, duration: SWAP_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished: swapped }) => {
          if (!live(id)) return;
          if (!swapped) return finish(id);
          const backHome = () =>
            Animated.timing(travel, { toValue: 0, duration: TRAVEL_MS, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(() => finish(id));
          if (!btnRef.current) return backHome();
          // Re-measure so the circle lands on the button even if layout shifted, but the
          // return leg must not depend on the answer arriving.
          btnRef.current.measureInWindow((bx, by, bw, bh) => {
            if (!live(id)) return;
            if (bw > 0 && bh > 0) setOverlay((prev) => (prev ? { ...prev, rect: { x: bx, y: by + geo.offsetY, w: bw, h: bh } } : prev));
            backHome();
          });
        });
      },
    );
  }

  function press() {
    if (busy.current) return;
    if (reduce) {
      toggle();
      return;
    }
    const id = ++run.current;
    busy.current = true;
    committed.current = false;

    const win = Dimensions.get('window');
    // On Android the Modal covers the status bar while the app root starts below it, so
    // window-measured coordinates need the top inset to land in the Modal's space.
    const offsetY = Platform.OS === 'android' && Dimensions.get('screen').height > win.height ? insets.top : 0;
    const geo: Geo = {
      rect: { x: 0, y: 0, w: 0, h: 0 },
      cx: win.width / 2,
      cy: (win.height + offsetY) / 2,
      big: Math.min(win.width, win.height) * 0.7,
      offsetY,
    };

    arm(id, MEASURE_MS);
    btnRef.current?.measureInWindow((x, y, w, h) => {
      if (!live(id)) return;
      if (w <= 0 || h <= 0) return finish(id);
      play(id, { ...geo, rect: { x, y: y + offsetY, w, h } });
    });
  }

  let circleStyle: ViewStyle | null = null;
  if (overlay) {
    const { rect, cx, cy, big } = overlay;
    const tx = rect.x + rect.w / 2 - cx;
    const ty = rect.y + rect.h / 2 - cy;
    const sc = rect.w / big;
    circleStyle = {
      left: cx - big / 2,
      top: cy - big / 2,
      width: big,
      height: big,
      borderRadius: big / 2,
      transform: [
        { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [tx, 0] }) },
        { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [ty, 0] }) },
        { scale: travel.interpolate({ inputRange: [0, 1], outputRange: [sc, 1] }) },
      ],
    } as ViewStyle;
  }

  return (
    <>
      <Pressable
        ref={btnRef}
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: c.border,
            backgroundColor: c.surface,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: traveling ? 0 : 1 }]}>
          <Face size={size} flight={null} master={swap} scheme={scheme} twinkle={twinkle} />
        </Animated.View>
      </Pressable>

      {overlay && circleStyle && (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => finish(run.current)}>
          <View style={StyleSheet.absoluteFill}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: travel }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: bgFor(overlay.flight.from) }]}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: bgFor(overlay.flight.to), opacity: swap.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }) },
                  ]}
                />
              </View>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.circle, circleStyle]}>
              <Face size={overlay.big} flight={overlay.flight} master={swap} scheme={overlay.flight.from} twinkle={twinkle} />
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: { position: 'absolute', overflow: 'hidden' },
  body: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 30, height: 30, borderRadius: 15 },
  star: { position: 'absolute', borderRadius: 999, backgroundColor: '#FFFFFF' },
});
