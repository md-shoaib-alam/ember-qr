import { type ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, AppState, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

// "Mesh drift" from the 21st.dev Shader Builder, trimmed to the options it actually uses.
const VERT = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[4];
uniform vec4 u_scene; // resolution.xy, time, seed

const float SCALE = 1.16;
const float INTENSITY = 0.34;
const float CONTRAST = 1.158;
const float GRAIN = 0.091;

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 res = u_scene.xy;
  float t = u_scene.z;
  float seed = u_scene.w;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y) * SCALE;

  vec3 acc = u_colors[0] * 0.15;
  float total = 0.15;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(
      sin(t * (0.21 + fi * 0.071) + fi * 2.4 + seed),
      cos(t * (0.17 + fi * 0.093) + fi * 1.7)) * (0.45 + INTENSITY * 0.35);
    float w = exp(-dot(p - c, p - c) * 6.0);
    acc += u_colors[i] * w;
    total += w;
  }
  vec3 col = (acc / total - 0.5) * CONTRAST + 0.5;
  col += (grainHash(gl_FragCoord.xy + seed * vec2(17.0, 31.0)) - 0.5) * GRAIN;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const TIME_SCALE = 0.727;
// 1453 in the original; only fed to sin(), so reduced mod 2π to stay precise on mediump GPUs.
const SEED = 1453 % (2 * Math.PI);
// The blobs drift slowly, so 30 fps looks identical and halves the GPU and JS-thread work.
const FRAME_MS = 1000 / 30;

function toRgb(hexes: string[]) {
  return new Float32Array(
    hexes.flatMap((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)),
  );
}

export function EmberBackground() {
  const c = useTheme();
  const colors = useRef(toRgb(c.glow));
  const redraw = useRef(() => {});
  const dispose = useRef(() => {});

  useEffect(() => {
    colors.current = toRgb(c.glow);
    redraw.current();
  }, [c.glow]);

  useEffect(() => () => dispose.current(), []);

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uColors = gl.getUniformLocation(program, 'u_colors');
    const uScene = gl.getUniformLocation(program, 'u_scene');

    const start = Date.now();
    let raf = 0;
    let lastDraw = -Infinity;
    let active = AppState.currentState !== 'background';
    let still = false;
    let disposed = false;

    function draw() {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      gl.viewport(0, 0, w, h);
      gl.uniform3fv(uColors, colors.current);
      gl.uniform4f(uScene, w, h, ((Date.now() - start) / 1000) * TIME_SCALE, SEED);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
      gl.endFrameEXP();
    }

    function loop(now: number) {
      raf = 0;
      if (disposed || !active) return;
      if (now - lastDraw >= FRAME_MS) {
        lastDraw = now;
        draw();
      }
      if (!still) raf = requestAnimationFrame(loop);
    }

    function run() {
      lastDraw = -Infinity;
      if (!raf && !disposed) raf = requestAnimationFrame(loop);
    }

    const appSub = AppState.addEventListener('change', (s) => {
      active = s !== 'background';
      run();
    });
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', (r) => {
      still = r;
      run();
    });
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      still = r;
      run();
    });

    redraw.current = run;
    dispose.current = () => {
      disposed = true;
      cancelAnimationFrame(raf);
      appSub.remove();
      motionSub.remove();
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
    run();
  }

  return <GLView style={StyleSheet.absoluteFill} pointerEvents="none" onContextCreate={onContextCreate} />;
}
