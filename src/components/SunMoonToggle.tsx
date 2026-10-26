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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { bgFor, useTheme, useThemeMode, type Scheme } from '@/theme';

/**
 * Sun/moon theme toggle. Tapping launches a full-screen overlay: the sky circle
 * expands from the button to the screen centre, plays the sun/moon arc swap at
 * large size (committing the theme mid-swap), then collapses back into the button.
 */

const SWAP_MS = 1000;
const TRAVEL_MS = 340;
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

function flightStyle(key: BodyKey, role: 'set' | 'rise', master: Animated.Value): ViewStyle {
  const inputRange = role === 'set' ? SET_IN : RISE_IN;
  const s = (role === 'set' ? SET : RISE)[key];
  const nums = (pick: (v: Sample) => number) =>
    master.interpolate({ inputRange, outputRange: s.map(pick), extrapolate: 'clamp' });
  const strs = (pick: (v: Sample) => string) =>
    master.interpolate({ inputRange, outputRange: s.map(pick), extrapolate: 'clamp' });
  return {
    opacity: nums((v) => v.op),
    transform: [
      { translateX: strs((v) => `${v.x}%`) },
      { translateY: strs((v) => `${v.y}%`) },
      { rotate: strs((v) => `${v.rot}deg`) },
      { scale: nums((v) => v.sc) },
    ],
  } as unknown as ViewStyle;
}

function restStyle(key: BodyKey, visible: boolean): ViewStyle {
  const side = key === 'moon' ? MOON.side : SUN.side;
  return visible
    ? { opacity: 1, transform: [] }
    : {
        opacity: 0,
        transform: [{ translateX: `${side * ARC_RADIUS}%` }, { translateY: `${ARC_RADIUS}%` }],
      };
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
  const moonStyle = flight ? flightStyle('moon', flight.from === 'dark' ? 'set' : 'rise', master) : restStyle('moon', scheme === 'dark');
  const sunStyle = flight ? flightStyle('sun', flight.from === 'light' ? 'set' : 'rise', master) : restStyle('sun', scheme === 'light');
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

export function SunMoonToggle({ size = 44 }: { size?: number }) {
  const c = useTheme();
  const { scheme, toggle } = useThemeMode();
  const { width: cw, height: ch } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // On Android the Modal covers the status bar while the app root starts below it, so
  // window-measured coordinates need the top inset to land in the Modal's space.
  const offsetY = Platform.OS === 'android' && Dimensions.get('screen').height > ch ? insets.top : 0;
  const [reduce, setReduce] = useState(false);
  const [traveling, setTraveling] = useState(false);
  const [overlay, setOverlay] = useState<{ rect: BtnRect; flight: Flight } | null>(null);
  const [twinkle] = useState(() => STARS.map(() => new Animated.Value(0.35)));
  const [travel] = useState(() => new Animated.Value(0));
  const [swap] = useState(() => new Animated.Value(0));
  const btnRef = useRef<ViewInstance>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const loops = twinkle.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: STARS[i].t / 2, useNativeDriver: false }),
          Animated.timing(v, { toValue: 0.35, duration: STARS[i].t / 2, useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduce, twinkle]);

  useEffect(
    () => () => {
      travel.stopAnimation();
      swap.stopAnimation();
    },
    [travel, swap],
  );

  function press() {
    if (reduce) {
      toggle();
      return;
    }
    if (traveling) return;
    btnRef.current?.measureInWindow((x, y, w, h) => {
      const flight: Flight = { from: scheme, to: scheme === 'dark' ? 'light' : 'dark' };
      setOverlay({ rect: { x, y: y + offsetY, w, h }, flight });
      setTraveling(true);
      travel.setValue(0);
      swap.setValue(0);
      Animated.timing(travel, { toValue: 1, duration: TRAVEL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(
        ({ finished }) => {
          if (!finished) return;
          toggle();
          Animated.timing(swap, { toValue: 1, duration: SWAP_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished: done }) => {
            if (!done) return;
            // Re-measure: layout may have shifted while the overlay was up, and the circle must land back on the button.
            btnRef.current?.measureInWindow((bx, by, bw, bh) => {
              setOverlay((prev) => (prev ? { ...prev, rect: { x: bx, y: by + offsetY, w: bw, h: bh } } : prev));
              Animated.timing(travel, { toValue: 0, duration: TRAVEL_MS, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(
                ({ finished: back }) => {
                  if (!back) return;
                  setOverlay(null);
                  setTraveling(false);
                  swap.setValue(0);
                  travel.setValue(0);
                },
              );
            });
          });
        },
      );
    });
  }

  const big = Math.min(cw, ch) * 0.7;
  let circleStyle: ViewStyle | null = null;
  if (overlay) {
    const cx = cw / 2;
    const cy = (ch + offsetY) / 2;
    const tx = overlay.rect.x + overlay.rect.w / 2 - cx;
    const ty = overlay.rect.y + overlay.rect.h / 2 - cy;
    const sc = overlay.rect.w / big;
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
        <Modal visible transparent animationType="none" statusBarTranslucent>
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
              <Face size={big} flight={overlay.flight} master={swap} scheme={overlay.flight.from} twinkle={twinkle} />
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
