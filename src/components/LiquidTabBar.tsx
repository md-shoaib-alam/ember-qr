import { BlurView } from 'expo-blur';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import type { Tabs } from 'expo-router';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewInstance,
} from 'react-native';

import { useTheme } from '@/theme';

/**
 * Port of the Nimbus "Waterline" liquid-glass navbar (guglielmogiannattasio.it)
 * from DOM/WebGL to React Native: the water pill is drawn by the same fragment
 * shader inside an expo-gl view, the spring physics run in JS, and the CSS icon
 * scenes become Animated sequences.
 */

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

type Fx = 'pop' | 'spin' | 'wave' | 'glow';
const FX: Fx[] = ['pop', 'spin', 'wave', 'glow'];

const PAD = 14; // canvas bleed around the pill, for shadows and ripples
const BAR_PAD = 8; // inner padding of the pill, matches styles.bar

const FG = '#0B132B';
const FG_SOFT = 'rgba(11,19,43,0.60)';

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;
const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uDpr;uniform float uTime;uniform vec4 uPill;
uniform vec4 uBlob[6];uniform float uSy[6];uniform vec4 uRip[6];uniform vec3 uMouse;uniform float uDark;uniform float uAmb;
float sdRB(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float sdCap(vec2 p,vec4 B,float sy){p-=B.xy;p.y/=sy;p.x=max(abs(p.x)-B.z,0.);return(length(p)-B.w)*min(1.,sy);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float dropD(vec2 p){float d=1e4;for(int i=0;i<6;i++){if(uBlob[i].w>.5){d=smin(d,sdCap(p,uBlob[i],uSy[i]),13.);}}return d;}
float pillD(vec2 p){vec2 h=uPill.zw*.5;return sdRB(p-uPill.xy-h,h,h.y);}
float lens(float d,float w){float t=clamp(-d/w,0.,1.);return sqrt(1.-(1.-t)*(1.-t));}
float waves(vec2 p){float w=0.;
 for(int i=0;i<6;i++){vec4 R=uRip[i];if(R.w>0.){float x=length(p-R.xy)-R.z*240.;w+=R.w*exp(-R.z*1.7)*sin(x*.3)*exp(-x*x/700.);}}
 vec2 m=p-uMouse.xy;w+=uMouse.z*3.6*exp(-dot(m,m)/1000.);
 w+=uAmb*(sin(p.x*.05+uTime*1.2)*.45+sin(p.x*.13-uTime*.85+p.y*.2)*.25);return w;}
float H(vec2 p){float dp=pillD(p);return lens(dp,uPill.w*.36)*2.4+lens(dropD(p),11.)*7.5+waves(p)*smoothstep(0.,7.,-dp);}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.1+t),cos(q.x*1.3-t*.7))*.6;c+=1./(1.+16.*abs(sin(q.x)*sin(q.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dp=pillD(p);float dd=dropD(p);
 float h0=H(p);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.)),h0-H(p+vec2(0.,1.)),1.));
 vec3 V=vec3(0.,0.,1.);
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),V),0.),70.);
 float spec2=pow(max(dot(reflect(-normalize(vec3(.6,.75,.7)),n),V),0.),22.)*.3;
 float fres=clamp((1.-n.z)*4.,0.,1.);
 vec3 irid=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*.85+p.x*.0028+uTime*.035));
 float pm=smoothstep(1.,-1.,dp);float dm=smoothstep(1.,-1.,dd)*smoothstep(1.,-2.,dp);
 float sh=smoothstep(9.,-9.,dropD(p-vec2(0.,5.)))*(1.-dm)*pm*(.11+.07*uDark);
 vec3 c=vec3(.36,.14,0.)*sh;float a=sh;
 float pa=clamp(pm*(fres*.5+spec*.9+spec2),0.,1.);
 c=mix(vec3(1.),irid,.5*fres)*pa+c*(1.-pa);a=pa+a*(1.-pa);
 float th=lens(dd,11.);
 float cs=caus((p+n.xy*th*18.)*.085,uTime*.9);
 // Ember orange water: the reference's blue palette with its red/blue channels swapped.
 vec3 tint=mix(vec3(1.,.78,.52),vec3(1.,.62,.30),uDark);
 float rim=dm*(1.-smoothstep(0.,8.,-dd));
 float cres=dm*smoothstep(.12,.55,dot(n.xy,normalize(vec2(.55,.85))))*smoothstep(0.,3.,-dd);
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 float da=dm*(.26+.14*body)*(1.-.35*uDark);vec3 dc=mix(tint,vec3(1.),body*.6);
 float la=rim*.22;vec3 lc=mix(vec3(.98,.48,.12),vec3(1.,.55,.15),uDark);dc=lc*la+dc*da*(1.-la);da=la+da*(1.-la);
 la=clamp(cres*.7+smoothstep(.6,1.,cs)*.28*th*dm,0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=dm*smoothstep(-2.,0.,dd)*.4;dc=mix(vec3(1.),irid,.18)*la+dc*(1.-la);da=la+da*(1.-la);
 c=dc+c*(1.-da);a=da+a*(1.-da);
 gl_FragColor=vec4(c,a);
}`;

type Body = { x: number; v: number };
type Sat = { x: number; y: number; vx: number; vy: number; r: number; k: number };
type Rip = { x: number; y: number; age: number; amp: number };
type Glc = { gl: ExpoWebGLRenderingContext; u: Record<string, WebGLUniformLocation | null> };

function makeState() {
  return {
    a: { x: 0, v: 0 } as Body,
    b: { x: 0, v: 0 } as Body,
    sy: { s: 1, v: 0 },
    lead: 0 as 0 | 1,
    lagFrom: 0,
    sats: [] as Sat[],
    rips: [] as Rip[],
    t: { x: 0, cy: 0, q: 0, r: 21 },
    q: 0,
    mouse: { x: 0, y: 0, s: 0, on: false },
    moving: false,
    split: false,
    ready: false,
    w: 0,
    h: 0,
    visible: true,
    reduce: false,
    raf: 0,
    last: 0,
    time: 0,
    glc: null as Glc | null,
  };
}

type State = ReturnType<typeof makeState>;

function initGL(gl: ExpoWebGLRenderingContext): Glc | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT);
  const fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of ['uRes', 'uDpr', 'uTime', 'uPill', 'uBlob', 'uSy', 'uRip', 'uMouse', 'uDark', 'uAmb'])
    u[n] = gl.getUniformLocation(p, n);
  return { gl, u };
}

function step(s: State, dt: number, now: number) {
  const T = s.t;
  s.time += dt;
  s.q += (T.q - s.q) * Math.min(1, dt * 12);
  const bodies = [s.a, s.b];
  let still = true;
  if (s.reduce) {
    s.a.x = s.b.x = T.x;
    s.a.v = s.b.v = 0;
    s.sy.s = 1;
    s.sats = [];
  } else {
    bodies.forEach((B, i) => {
      const lead = i === s.lead;
      const k = lead ? 210 : 72;
      const c = lead ? 25 : 13;
      const f = !lead && now < s.lagFrom ? 0.08 : 1;
      B.v += (k * (T.x - B.x) - c * B.v) * dt * f;
      B.x += B.v * dt;
      const lo = PAD + 6 + s.q + T.r - 3, hi = PAD + s.w - 6 - s.q - T.r + 3;
      if (B.x < lo || B.x > hi) {
        s.sy.v -= Math.min(Math.abs(B.v), 900) * 0.0016;
        B.x = Math.max(lo, Math.min(hi, B.x));
        B.v *= -0.25;
      }
      if (Math.abs(T.x - B.x) > 0.3 || Math.abs(B.v) > 3) still = false;
    });
    const L = bodies[s.lead];
    const syT = 1 - 0.2 * Math.min(Math.abs(L.v) / 1500, 1);
    s.sy.v += (280 * (syT - s.sy.s) - 9 * s.sy.v) * dt;
    s.sy.s += s.sy.v * dt;
    if (Math.abs(s.sy.s - 1) > 0.002 || Math.abs(s.sy.v) > 0.02) still = false;
    // break the neck: spawn droplets between head and tail
    const sep = Math.abs(s.a.x - s.b.x);
    const r = T.r * (1 - 0.3 * Math.min(sep / (2 * (T.q + T.r) || 1), 1));
    if (!s.split && s.moving && sep - 2 * T.q - 2 * r > -6) {
      s.split = true;
      const lo = bodies[1 - s.lead], hi = bodies[s.lead];
      [0.3, 0.5, 0.72].forEach((t, j) => {
        s.sats.push({
          x: lo.x + (hi.x - lo.x) * t + (Math.random() - 0.5) * 6,
          y: T.cy + (Math.random() - 0.5) * 10,
          vx: (lo.v + hi.v) * 0.45,
          vy: (Math.random() - 0.5) * 60,
          r: 5 + Math.random() * 3 - j * 0.5,
          k: 70 + Math.random() * 90,
        });
      });
    }
    s.sats = s.sats.filter((d) => {
      d.vx += (d.k * (T.x - d.x) - 9 * d.vx) * dt;
      d.vy += (90 * (T.cy - d.y) - 7 * d.vy) * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.x = Math.max(PAD + 8 + d.r, Math.min(PAD + s.w - 8 - d.r, d.x));
      d.y = Math.max(T.cy - T.r + d.r, Math.min(T.cy + T.r - d.r, d.y));
      if (Math.abs(T.x - d.x) < T.q + T.r * 0.5) d.r -= dt * 26;
      return d.r > 0.6;
    });
    if (s.sats.length) still = false;
  }
  if (s.moving && still) {
    s.moving = false;
    if (s.split || !s.reduce) s.rips.push({ x: T.x, y: T.cy, age: 0, amp: s.split ? 1.2 : 0.7 });
  }
  s.rips.forEach((p) => (p.age += dt));
  s.rips = s.rips.filter((p) => p.age < 2.4);
  const target = s.mouse.on ? 1 : 0;
  s.mouse.s += (target - s.mouse.s) * Math.min(1, dt * 7);
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Android has no "will" events; with softwareKeyboardLayoutMode "pan" the bar stays put anyway.
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export function LiquidTabBar({ state, descriptors, emitter, navigateToTab, insets }: TabBarProps) {
  const c = useTheme();
  const keyboardVisible = useKeyboardVisible();
  const stRef = useRef<State>(makeState());
  const [glOn, setGlOn] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fxI, setFxI] = useState(-1);
  const dropRef = useRef<ViewInstance>(null);

  const [av] = useState(() => ({
    scale: new Animated.Value(1),
    ty: new Animated.Value(0),
    rot: new Animated.Value(0),
    rotY: new Animated.Value(0),
  }));
  const deg = (v: Animated.Value) => v.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });

  function draw() {
    const st = stRef.current;
    const T = st.t;
    const sep = Math.abs(st.a.x - st.b.x);
    const thin = Math.min(sep / (2 * (st.q + T.r) || 1), 1);
    const r = T.r * (1 - 0.3 * thin);
    if (st.glc) {
      const { gl, u } = st.glc;
      const dpr = st.w > 0 ? gl.drawingBufferWidth / (st.w + PAD * 2) : 1;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(u.uRes, st.w + PAD * 2, st.h + PAD * 2);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uTime, st.time);
      gl.uniform4f(u.uPill, PAD, PAD, st.w, st.h);
      const blobs = new Float32Array(24);
      const sy = new Float32Array(6).fill(1);
      const head = st.lead === 0 ? st.a : st.b, tail = st.lead === 0 ? st.b : st.a;
      blobs.set(
        [head.x, T.cy, st.q * (1 - 0.25 * thin), T.r * (1 - 0.12 * thin), tail.x, T.cy, st.q * (1 - 0.8 * thin), T.r * (1 - 0.5 * thin)],
        0,
      );
      sy[0] = sy[1] = st.sy.s;
      st.sats.slice(0, 4).forEach((d, i) => blobs.set([d.x, d.y, 0, d.r], 8 + i * 4));
      gl.uniform4fv(u.uBlob, blobs);
      gl.uniform1fv(u.uSy, sy);
      const rips = new Float32Array(24);
      st.rips.slice(-6).forEach((p, i) => rips.set([p.x, p.y, p.age, p.amp], i * 4));
      gl.uniform4fv(u.uRip, rips);
      gl.uniform3f(u.uMouse, st.mouse.x, st.mouse.y, st.mouse.s);
      gl.uniform1f(u.uDark, 0);
      gl.uniform1f(u.uAmb, st.reduce ? 0 : 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
      gl.endFrameEXP();
    } else if (dropRef.current) {
      const left = Math.min(st.a.x, st.b.x) - st.q - r - PAD;
      const width = sep + 2 * (st.q + r);
      dropRef.current.setNativeProps({
        style: { width, transform: [{ translateX: left }, { scaleY: st.sy.s }] },
      });
    }
  }

  function loop() {
    const st = stRef.current;
    if (st.raf) return;
    st.last = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = (now: number) => {
      const dt = Math.min((now - st.last) / 1000, 1 / 30);
      st.last = now;
      step(st, dt, now);
      draw();
      const busy = st.moving || st.rips.length > 0 || st.sats.length > 0 || st.mouse.s > 0.01;
      // ambient water keeps moving while visible; reduced-motion only animates on change
      if (st.visible && (!st.reduce || busy)) st.raf = requestAnimationFrame(tick);
      else st.raf = 0;
    };
    st.raf = requestAnimationFrame(tick);
  }

  function setTarget(i: number) {
    const st = stRef.current;
    const T = st.t;
    if (!st.w) return;
    const itemW = (st.w - BAR_PAD * 2) / state.routes.length;
    const nx = PAD + BAR_PAD + itemW * (i + 0.5);
    if (!st.ready) {
      st.a.x = st.b.x = nx;
      st.q = T.q;
      st.ready = true;
    } else if (Math.abs(nx - T.x) > 0.5) {
      st.lead = Math.abs(nx - st.a.x) <= Math.abs(nx - st.b.x) ? 0 : 1;
      st.lagFrom = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 70;
      st.moving = true;
      st.split = false;
    }
    T.x = nx;
    loop();
  }

  function measure(w: number, h: number) {
    const st = stRef.current;
    const T = st.t;
    st.w = w;
    st.h = h;
    const itemW = (w - BAR_PAD * 2) / state.routes.length;
    T.r = (h - BAR_PAD * 2) / 2;
    T.q = Math.max(0, itemW / 2 - T.r);
    T.cy = PAD + BAR_PAD + (h - BAR_PAD * 2) / 2;
    st.ready = false;
    setTarget(state.index);
  }

  function ripple(x: number, y: number, amp: number) {
    const st = stRef.current;
    if (st.reduce) return;
    st.rips.push({ x, y, age: 0, amp });
    loop();
  }

  function playFx(kind: Fx) {
    const st = stRef.current;
    if (st.reduce) return;
    const springy = Easing.bezier(0.3, 1.6, 0.5, 1);
    av.scale.stopAnimation();
    av.ty.stopAnimation();
    av.rot.stopAnimation();
    av.rotY.stopAnimation();
    av.scale.setValue(1);
    av.ty.setValue(0);
    av.rot.setValue(0);
    av.rotY.setValue(0);
    const t = (v: Animated.Value, to: number, duration: number, easing = springy) =>
      Animated.timing(v, { toValue: to, duration, easing, useNativeDriver: true });
    if (kind === 'pop') {
      // 'pop' is the Text tab's effect only; spring upward so the active icon never dips below resting size.
      Animated.sequence([t(av.scale, 1.18, 260), t(av.scale, 1, 180)]).start();
    } else if (kind === 'glow') {
      Animated.parallel([
        Animated.sequence([t(av.ty, -5, 240), t(av.ty, 0, 200), t(av.ty, -2, 150), t(av.ty, -1, 150)]),
        Animated.sequence([Animated.delay(600), t(av.scale, 1.08, 200)]),
      ]).start();
    } else if (kind === 'spin') {
      Animated.parallel([
        Animated.timing(av.rotY, { toValue: 360, duration: 1000, easing: Easing.bezier(0.2, 0.75, 0.25, 1), useNativeDriver: true }),
        Animated.sequence([Animated.delay(800), t(av.scale, 1.08, 200)]),
      ]).start();
    } else {
      Animated.sequence([t(av.rot, -15, 180), t(av.rot, 12, 180), t(av.rot, -8, 180), t(av.rot, 4, 180), t(av.rot, 0, 180)]).start();
    }
  }

  useEffect(() => {
    setTarget(state.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index]);

  useEffect(() => {
    const st = stRef.current;
    let on = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      st.reduce = v;
      if (on) loop();
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      st.reduce = v;
      loop();
    });
    const app = AppState.addEventListener('change', (next) => {
      st.visible = next === 'active';
      if (st.visible) loop();
    });
    return () => {
      on = false;
      sub.remove();
      app.remove();
      cancelAnimationFrame(st.raf);
      st.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (keyboardVisible) return null;

  return (
    // Edge-to-edge Android can report the keyboard region in insets.bottom, which would strand the
    // bar mid-screen; real gesture/nav bars never exceed ~48dp.
    <View style={[styles.wrap, { paddingBottom: Math.min(Math.max(insets.bottom, 12), 48) + 1 }]}>
      <View
        role="tablist"
        style={[styles.bar, { borderColor: c.tabBarBorder }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width !== size.w || height !== size.h) {
            setSize({ w: width, h: height });
            measure(width, height);
          }
        }}>
        {/* expo-blur paints a rectangular bitmap on Android, so it lives in a clipped layer; the water
            canvas must stay outside that layer because its drop bulges past the pill. */}
        <View pointerEvents="none" style={styles.blurClip}>
          <BlurView tint="light" intensity={60} style={StyleSheet.absoluteFill} />
        </View>
        {/* expo-blur's web build replaces backgroundColor with its own tint, so the white veil lives here instead. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: c.tabBar }]} />
        {!glOn && (
          <View
            ref={dropRef}
            pointerEvents="none"
            style={[styles.drop, { width: size.w / state.routes.length }]}
          />
        )}
        {glOn && size.w > 0 && (
          <GLView
            pointerEvents="none"
            style={{ position: 'absolute', left: -PAD, top: -PAD, width: size.w + PAD * 2, height: size.h + PAD * 2 }}
            onContextCreate={(gl) => {
              const st = stRef.current;
              st.glc = initGL(gl);
              if (!st.glc) setGlOn(false);
              else loop();
            }}
          />
        )}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? FG : FG_SOFT;

          function onPress() {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            setFxI(index);
            playFx(FX[index % FX.length]);
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          }

          return (
            <Pressable
              key={route.key}
              role="tab"
              aria-selected={focused}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title}
              onPress={onPress}
              onPressIn={(e) => ripple(e.nativeEvent.locationX + PAD, e.nativeEvent.locationY + PAD, 0.8)}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.item}>
              <Animated.View
                key={fxI === index ? `fx-${index}` : `idle-${index}`}
                style={[
                  styles.ico,
                  fxI === index && {
                    transform: [
                      { perspective: 80 },
                      { rotateY: deg(av.rotY) },
                      { rotate: deg(av.rot) },
                      { translateY: av.ty },
                      { scale: av.scale },
                    ],
                  },
                ]}>
                {options.tabBarIcon?.({ focused, color, size: 26 })}
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 8, paddingHorizontal: 24 },
  bar: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
    height: 65,
    padding: BAR_PAD,
    borderRadius: 32.5,
    borderWidth: 1,
    boxShadow: '0 12px 28px rgba(31, 27, 22, 0.16)',
  },
  blurClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 31.5, overflow: 'hidden' },
  veil: { borderRadius: 31.5 },
  drop: {
    position: 'absolute',
    top: BAR_PAD,
    bottom: BAR_PAD,
    left: 0,
    borderRadius: 24.5,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ico: { alignItems: 'center', justifyContent: 'center' },
});
