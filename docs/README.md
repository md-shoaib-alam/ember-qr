# Debugging & verification guide

A working manual for this repo (`ember-qr`, Expo SDK 58, React Native 0.88, package
`com.sb_ranjha.emberqr`): how to watch the app in a browser, on a real phone, and
inside a release build — and how to *prove* a build is good instead of hoping.

Every command here was run on this project unless marked otherwise.

---

## Contents

- [0. The mental model](#0-the-mental-model)
- [1. Command cheat sheet](#1-command-cheat-sheet)
- [2. Browser: Chrome DevTools Protocol](#2-browser-chrome-devtools-protocol)
- [3. Metro and the web bundle](#3-metro-and-the-web-bundle)
- [4. Real device: adb](#4-real-device-adb)
- [5. Release-only failures: R8 and keep rules](#5-release-only-failures-r8-and-keep-rules)
- [6. Reading JS errors in a release build](#6-reading-js-errors-in-a-release-build)
- [7. EAS Build pipeline](#7-eas-build-pipeline)
- [8. Is the build OK? The gate ladder](#8-is-the-build-ok-the-gate-ladder)
- [9. The debugging method](#9-the-debugging-method)
- [10. Case files](#10-case-files)
- [11. Learning path and references](#11-learning-path-and-references)
- [A. Glossary](#a-glossary)
- [B. Windows notes](#b-windows-notes)
- [C. This repo's facts](#c-this-repos-facts)

---

## 0. The mental model

Three different "apps" exist, and each one is observed differently.

| Runtime | What runs | What serves it | How you observe it |
|---|---|---|---|
| **Browser page** | React Native Web bundle | Metro dev server **or** a static export over HTTP | Chrome DevTools Protocol: console, network, DOM |
| **Phone app, debug** | JS streamed from Metro | Metro over LAN / tunnel / `adb reverse` | Metro terminal + `adb logcat` |
| **Phone app, release** | Hermes bytecode (`.hbc`) inside the APK | **nothing** — no server at all | `adb logcat` only |

```
  ┌──────────────┐   http://localhost:8081   ┌───────────────┐
  │   Chrome     │ ◄───────────────────────► │    Metro      │
  │ (CDP client) │                           │  (dev server) │
  └──────────────┘                           └───────────────┘

  ┌──────────────┐   .hbc baked in the APK   ┌───────────────┐
  │   Android    │ ◄───────────────────────► │  adb logcat   │
  │   (app)      │        no server          │   (syslog)    │
  └──────────────┘                           └───────────────┘
```

Three consequences worth memorising:

1. A browser **cannot** open a React Native app without an HTTP origin. Double-clicking
   `dist/index.html` fails: module scripts and `fetch` are blocked on `file://`.
2. A release APK **needs no server** — the JS is already inside it. So a bug that only
   appears in the APK cannot be reproduced in the browser or in Expo Go.
3. Therefore: **browser for logic and layout, logcat for native reality.** They are not
   substitutes for each other.

---

## 1. Command cheat sheet

```bash
# ── pre-build gates ────────────────────────────────────────────────
./node_modules/.bin/tsc --noEmit                      # typecheck (not `npx tsc`)
./node_modules/.bin/eslint .                          # lint
npx expo-doctor                                       # deps + config health
npx expo export -p android --output-dir "$TEMP/exp"   # bundle builds end-to-end

# ── browser ────────────────────────────────────────────────────────
npx expo start --web                                  # Metro, hot reload
npx expo start --web -c                               # + clear bundler cache
npx expo export -p web --output-dir dist -s true      # static build + source maps
npx serve dist -l 3000                                # serve the static build

# ── real device ────────────────────────────────────────────────────
adb devices -l                                        # serial + model + state
adb install -r app.apk                                # replace, keep app data
adb shell am force-stop com.sb_ranjha.emberqr
adb logcat -c                                         # clear BEFORE launching
adb shell monkey -p com.sb_ranjha.emberqr 1           # launch by package
adb logcat --pid=$(adb shell pidof com.sb_ranjha.emberqr)
adb logcat -b crash -d                                # crash buffer only
adb exec-out screencap -p > shot.png                  # screenshot
adb shell am start -W -n com.sb_ranjha.emberqr/.MainActivity   # startup timing

# ── EAS ────────────────────────────────────────────────────────────
npx eas-cli build -p android --profile preview --non-interactive
npx eas-cli build:list -p android --limit 3 --json
npx eas-cli build:view <build-id> --json
npx eas-cli build:download --build-id <build-id> -p android
```

---

## 2. Browser: Chrome DevTools Protocol

### 2.1 What CDP actually is

Chrome can expose its internals over a WebSocket. You send JSON commands, you get JSON
events. Everything — the Network panel, the Console, breakpoints, performance traces —
is built on the same protocol.

Three steps to see it yourself:

```bash
# 1. start Chrome with the debugging port open
chrome --remote-debugging-port=9222 --user-data-dir="$TEMP/chrome-debug"

# 2. list targets (pages) — plain HTTP
curl -s http://localhost:9222/json/list

# 3. connect to a target's webSocketDebuggerUrl and send a command
#    {"id":1,"method":"Runtime.evaluate","params":{"expression":"1+1","returnByValue":true}}
```

The **domains** (command groups) worth knowing:

| Domain | What it gives you | Panel equivalent |
|---|---|---|
| `Runtime` | evaluate JS, console events, exceptions | Console |
| `Log` | browser-level warnings/errors | Console |
| `Network` | every request/response/status/body | Network |
| `Page` | navigate, reload, lifecycle, screenshots | — |
| `DOM` | query nodes, box models | Elements |
| `Debugger` | breakpoints, step, call frames | Sources |
| `Performance` | traces, metrics | Performance |
| `HeapProfiler` | heap snapshots | Memory |

### 2.2 Three ways to drive it

| Way | Use when | Cost |
|---|---|---|
| **MCP tools** (`chrome-devtools`, `playwright`, `browser-use`) | You want to *describe* an action to an agent | Zero setup, less precise |
| **Playwright / Puppeteer** | Repeatable checks, CI, 50 iterations | A small script |
| **Raw CDP** | Understanding, or a very specific probe | More code, no magic |

### 2.3 The smallest useful script

```js
// npm i playwright-core
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });   // installed Chrome
  const page = await browser.newPage();

  // These four listeners are "check all the logs".
  page.on('console',        m => console.log('[console]', m.type(), m.text()));
  page.on('pageerror',      e => console.log('[pageerror]', e.message));
  page.on('requestfailed',  r => console.log('[failed]', r.url(), r.failure()?.errorText));
  page.on('response',       r => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });

  await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'shot.png' });
  await browser.close();
})();
```

Why all four:

- **console** — your `console.log/warn/error`.
- **pageerror** — uncaught exceptions. React render crashes land here, not in console.
- **requestfailed** — connection refused / blocked / aborted requests.
- **response** — status codes. **A silent 404 looks exactly like a healthy empty state.**
  Only the network log separates them.

### 2.4 Assert state, don't eyeball screenshots

A screenshot proves pixels existed once. It does not prove behaviour.

```js
// count what actually rendered
const cards = await page.locator('[data-testid="qr-card"]').count();

// read layout instead of guessing
const box = await page.locator('button[aria-label="toggle theme"]')
  .evaluate(el => el.getBoundingClientRect().toJSON());

// read state the UI depends on
const stored = await page.evaluate(() => localStorage.getItem('theme'));

// run the interaction and compare
await page.getByRole('button', { name: /theme/i }).click();
const after = await page.evaluate(() => localStorage.getItem('theme'));
console.log({ cards, box, stored, after });
```

### 2.5 Stress-testing an interaction (how the toggle bug was proven)

Intermittent bugs die under repetition, not under one careful click:

```js
// 1. sequential: every tap should flip exactly once
for (let i = 0; i < 6; i++) { await page.getByRole('button', { name: /theme/i }).click(); await page.waitForTimeout(300); }

// 2. burst: 5 quick taps must equal ONE flip, not five
for (let i = 0; i < 5; i++) { await page.getByRole('button', { name: /theme/i }).click(); await page.waitForTimeout(120); }

// 3. interrupt: navigate away mid-animation, then come back
await page.getByRole('button', { name: /theme/i }).click();
await page.waitForTimeout(200);
await page.goto('http://localhost:8081/url');   // mid-flight
await page.goto('http://localhost:8081');
const state = await page.evaluate(() => document.documentElement.dataset.theme);
```

Measured on the fixed code: 6 taps → 6 flips; 5-tap burst → exactly 1 flip; navigate
mid-animation → 1 flip and the overlay is gone; tap then navigate at 60 ms → 1 flip.

### 2.6 DevTools panels worth learning by hand

| Panel | What it answers | Keystroke |
|---|---|---|
| **Network** | what loaded, status, timing waterfall, payload | `Ctrl+Shift+I` → Network |
| **Sources** | breakpoints in *your* code, call stack, scope | `Ctrl+P` to open a file |
| **Performance** | long tasks, layout thrash, frame drops | record → interact → stop |
| **Rendering** (drawer) | paint flashing, layout shift regions | `Ctrl+Shift+P` → Show Rendering |
| **Memory** | heap snapshots, detached DOM nodes | Memory panel |
| **Application** | localStorage, IndexedDB, cookies, SW | Application panel |

Rule of thumb: if automation says "nothing happened", open the panel by hand and watch
what the browser says. The script is only a client for that panel.

### 2.7 React Native Web specifics

| On the phone | In the browser | Consequence |
|---|---|---|
| Native `View`/`Text` | `div`/`span` with flexbox | Layout is *close*, not identical |
| Safe-area insets | often 0 | Header spacing differs |
| `expo-blur` | CSS backdrop filter | Look differs; `backgroundColor` may be replaced |
| Haptics, camera, share | stubbed or browser APIs | Can't verify natively on web |
| `Alert` | browser `alert` | Blocking behaviour differs |

Use the browser for **logic, state transitions, and console errors**. Use the phone for
**visual fidelity, native modules, and release behaviour**.

### 2.8 Browser traps

| Trap | Symptom | Fix |
|---|---|---|
| Stale Metro module graph | edits appear to do nothing | restart dev server or `-c`, or verify with `expo export` |
| `file://` static export | white page, module/CORS errors | serve over HTTP (`npx serve dist`) |
| Background/hidden tab | timers throttled ~1 s, clicks swallowed | bring tab to front before asserting |
| Stale page context after navigate | `evaluate` reads the previous document | wait for navigation, then re-read |
| Clicking `document` | "the button doesn't respond" | click the element itself |
| `Enter` key instead of click | button never activates | use a real click |
| Service worker cache | old assets after rebuild | unregister SW / hard reload |

---

## 3. Metro and the web bundle

### 3.1 What Metro is

Metro is the bundler/dev server: it resolves imports, transforms JSX/TS, serves one
bundle plus assets, and pushes updates over a WebSocket (Fast Refresh).

| Command | What it does |
|---|---|
| `npx expo start` | dev server on `:8081` (LAN by default) |
| `npx expo start --web` | same server, opens the web app |
| `npx expo start -c` | clears the transform cache first |
| `npx expo start -m localhost` | reachable only from this machine |
| `npx expo start --tunnel` | public URL when LAN is blocked |
| `npx expo start --no-dev --minify` | production-mode bundle (no dev warnings) |

`-p/--port` sets the **native** server port; the web app is served from the same origin
Metro prints on start. Don't assume `8081` — read the terminal.

### 3.2 Prove the served bundle is fresh

Metro on Windows sometimes misses edits (watchman-less file watching). Don't guess —
grep the served bundle for a string you just added:

```bash
# 1. find the bundle URL Metro advertises in the web HTML
curl -s http://localhost:8081 | grep -oE '/[^"]+\.bundle[^"]*' | head -1

# 2. fetch it and look for your marker
curl -s "http://localhost:8081<that-path>" | grep -c "YOUR_NEW_STRING"
```

0 matches = the served code is old → restart Metro with `-c`.
(For the native dev client the bundle URL is the
`.expo/.virtual-metro-entry.bundle?...&lazy=false` entry; same grep trick works.)

### 3.3 Static export = the honest build check

```bash
npx expo export -p web --output-dir dist -s true     # -s = source maps
npx expo export -p android --output-dir "$TEMP/exp"  # native bundle + .hbc
```

`expo export` runs the **production** bundler with no dev server and no leniency:
a missing import, a bad asset path, or a broken platform-specific file fails here rather
than in a 10-minute cloud build.

What a passing run looks like on this project (verified):

```
› android bundles (2):
_expo/static/js/android/entry-<hash>.hbc      (3MB)
_expo/static/js/android/entry-<hash>.hbc.map  (7.6MB)   ← only with -s true
› Files (1):
metadata.json
Exported: ...
```

The asset table above it also lists every bundled image/font — the place to notice that
an "unused" asset is still being shipped.

### 3.4 Connecting a phone to Metro

| Situation | Option |
|---|---|
| Same Wi-Fi | default LAN mode |
| Network blocks peer traffic | `npx expo start --tunnel` |
| USB only (dev build installed) | `adb reverse tcp:8081 tcp:8081`, then `-m localhost` |

The Metro terminal also prints device logs; `adb logcat` shows the same `console.log`
output under the `ReactNativeJS` tag.

---

## 4. Real device: adb

### 4.1 Setup

1. Phone → Settings → About → tap Build number 7× → Developer options.
2. Enable **USB debugging**, plug in, tap **Allow** on the prompt.
3. `adb devices -l` must show `device`, not `unauthorized`.

```bash
adb devices -l
# 10BCBN0QE30022R  device  product:... model:V2204 device:...
```

With more than one device attached, every command needs `-s <serial>`.

Wireless (optional): `adb pair <ip:port> <code>` then `adb connect <ip:port>`.

### 4.2 Core verbs

| Task | Command |
|---|---|
| Install / upgrade | `adb install -r app.apk` |
| Reinstall clean | `adb uninstall com.sb_ranjha.emberqr` then install |
| Launch | `adb shell monkey -p com.sb_ranjha.emberqr 1` |
| Launch + timings | `adb shell am start -W -n com.sb_ranjha.emberqr/.MainActivity` |
| Stop the app | `adb shell am force-stop com.sb_ranjha.emberqr` |
| Running PID | `adb shell pidof com.sb_ranjha.emberqr` |
| Installed version | `adb shell dumpsys package com.sb_ranjha.emberqr \| grep -E "versionName\|lastUpdateTime"` |
| Screenshot | `adb exec-out screencap -p > shot.png` |
| Screen recording | `adb shell screenrecord /sdcard/a.mp4` + `adb pull` |
| Copy a file out | `adb pull /sdcard/Download/x.json` |
| Shell | `adb shell` (then `run-as com.sb_ranjha.emberqr` for app-private files on debug builds) |
| Port forward (dev) | `adb reverse tcp:8081 tcp:8081` |

### 4.3 logcat in detail

`logcat` is a ring buffer of system + app log lines. Three buffers matter:

| Buffer | Contents |
|---|---|
| `main` | normal logs, including `ReactNativeJS` |
| `crash` | native/Java crashes, tombstone pointers |
| `system` | framework chatter (very noisy) |

| Flag | Meaning |
|---|---|
| `-c` | clear all buffers |
| `-d` | dump what's there and exit (don't follow) |
| `-b crash` | read the crash buffer |
| `-v time` | show timestamps |
| `--pid <n>` | only this process |
| `-s TAG` | silence everything else, show one tag |

The workflow:

```bash
adb devices -l
adb install -r app.apk
adb logcat -c
adb shell monkey -p com.sb_ranjha.emberqr 1
adb logcat --pid=$(adb shell pidof com.sb_ranjha.emberqr) | head -80
```

If the process dies before `pidof` sees it:

```bash
adb logcat -b crash -d > crash.txt
adb logcat -d > full.txt
grep -n -A40 "FATAL EXCEPTION" full.txt
```

### 4.4 Reading a crash

Real output from this app's broken preview build:

```
E/unknown:FabricUIManager: Exception thrown when executing UIFrameGuarded
E/unknown:FabricUIManager: java.lang.IllegalStateException: Didn't find a correct constructor for class xr0
    at expo.modules.kotlin.views.SimpleViewManagerWrapper.createViewInstance(SimpleViewManagerWrapper.kt)
    at com.facebook.react.uimanager.ViewManager.createViewInstance(ViewManager.java)
    at com.facebook.react.fabric.mounting.SurfaceMountingManager.preallocateView(SurfaceMountingManager.java)
E/AndroidRuntime: FATAL EXCEPTION: main
Process: com.sb_ranjha.emberqr, PID: 7772
java.lang.IllegalStateException: Didn't find a correct constructor for class xr0
```

Read it in this order:

1. **`Process` / `FATAL EXCEPTION`** — confirm it's your app, on the main thread.
2. **The message** — here it states the exact failing precondition.
3. **Topmost frames** — `SimpleViewManagerWrapper` + `preallocateView` = Fabric is
   building a native view. So the crash is native view *creation*, not JS.
4. **Class name** — `xr0` is 3 characters. Real classes aren't named that → obfuscated →
   **release build only** → R8 is involved (see §5).

Other shapes you'll meet:

| Pattern | Meaning |
|---|---|
| `FATAL EXCEPTION: main` + your package | unhandled exception on the UI thread → app closes |
| `ANR in com...` + `Input dispatching timed out` | main thread blocked > 5 s |
| `java.lang.UnsatisfiedLinkError` | native `.so` for this ABI is missing |
| `Unable to load script` | debug build can't reach Metro (use `adb reverse` or LAN) |
| `E/ReactNativeJS` | a JS error surfaced through the RN bridge |
| `W/unknown:ReactNative: ...` | warnings — usually not fatal |

### 4.5 After launch: smoke test on the device

Launching is not verification. Walk the feature surface (for this app):

- Home screen renders, ember background animates, no black flash.
- Type a URL → QR appears and updates while typing.
- Wi-Fi tab → SSID + password + encryption → QR changes accordingly.
- Phone tab → number → QR changes.
- Share button → system share sheet opens with the QR image.
- Sun/moon toggle → full-screen animation, theme flips exactly once.
- Tab bar → all three tabs reachable, blur renders.
- Lock/unlock screen, rotate if allowed, background/foreground → no crash, state kept.

Then re-read logcat for anything new:

```bash
adb logcat -d | grep -E "FATAL|AndroidRuntime|ReactNativeJS" | tail -40
```

### 4.6 Device traps

| Trap | Symptom | Fix |
|---|---|---|
| Device `unauthorized` | adb commands hang/fail | accept the RSA prompt; `adb kill-server` |
| Several devices | `more than one device` | `adb -s <serial>` |
| Different keystore | `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | uninstall first (loses data) |
| Installed an `.aab` | install fails | AABs are for stores; use the APK |
| Old app data | old token/cache changes behaviour | uninstall, or clear app storage |
| `pidof` empty | crash before registration | read the `crash` buffer |
| Screenshot via `adb shell screencap > f.png` | corrupt PNG on Windows | use `adb exec-out` |

---

## 5. Release-only failures: R8 and keep rules

### 5.1 What changes in a release build

| Debug / Expo Go | Release (`preview`, `production`) |
|---|---|
| JS bundle served by Metro | Hermes bytecode bundled in the APK |
| No code shrinking | **R8**: shrink + optimize + **rename** |
| RedBox / LogBox | none — errors only in logcat |
| `__DEV__ === true` | `__DEV__ === false` (dev-only branches removed) |
| Dev menu, Fast Refresh | none |

Anything that works in development but fails here is one of: obfuscation, a removed
dev-only branch, a native module Expo Go happened to include, or a config value that
only exists after prebuild.

### 5.2 How R8 breaks reflection

R8 assumes code it cannot see used is dead. It will:

- delete unreferenced classes/methods,
- **rename** classes, methods, fields, and **constructors** (`GLView` → `xr0`),
- keep only what a **keep rule** protects.

Reflection is invisible to that analysis. So a constructor invoked via
`Class.getConstructor(...).newInstance(...)` can be renamed away, and the lookup fails
at runtime — only in release builds.

### 5.3 Where Expo does this

`expo-modules-core` creates every native view reflectively
(`android/src/main/java/expo/modules/kotlin/views/ViewDefinitionBuilder.kt`):

1. try constructor `(Context, AppContext)`,
2. else `(Context)`,
3. else `throw IllegalStateException("Didn't find a correct constructor for $viewClass")`.

Step 3 is the message we saw. It happens during the **first frame**, which is why the
symptom is "splash, then closes".

### 5.4 Why some views are safe and others are not

`expo-modules-core/android/proguard-rules.pro` ships (line 30):

```proguard
-keepclassmembers class * implements expo.modules.kotlin.views.ExpoView {
  public <init>(android.content.Context);
  public <init>(android.content.Context, expo.modules.kotlin.AppContext);
}
```

In R8, `class * implements X` matches every subtype of `X` — subclasses included.

| Module | Native class | Extends | Protected? |
|---|---|---|---|
| `expo-blur` | `ExpoBlurView` | `ExpoView` | ✅ yes |
| `expo-gl` | `GLView` | **`TextureView`** | ❌ **no** → renamed → crash |

That single inheritance difference is the whole bug.

### 5.5 How to audit a library's rules

Rules can live in three places — check all:

```bash
# 1. a proguard file the library ships, wired via consumerProguardFiles
grep -rn "consumerProguardFiles\|proguard" node_modules/expo-*/android/build.gradle

# 2. @Keep annotations in the source
grep -rn "androidx.annotation.Keep\|@Keep" node_modules/expo-*/android/src

# 3. rules baked into the published AAR (META-INF/proguard/…) — not visible locally
```

Also check what the class actually extends — that decides which shipped rules apply:

```bash
grep -rn "^class .*View(" node_modules/expo-*/android/src/main/java
```

### 5.6 Apply a keep rule without touching `android/`

`android/` is generated (CNG). Configure it through `app.json` with
`expo-build-properties`:

```json
"plugins": [
  "expo-router",
  ["expo-splash-screen", { "backgroundColor": "#120F0C", "image": "./assets/images/splash-icon.png", "imageWidth": 92 }],
  "expo-sharing",
  [
    "expo-build-properties",
    { "android": { "extraProguardRules": "-keep class expo.modules.gl.** { *; }" } }
  ]
]
```

What it does during prebuild: appends your text to `android/app/proguard-rules.pro`
inside a generated block. Verify the release build consumes that file — the SDK 58
template does (read it out of the tarball instead of prebuilding):

```bash
mkdir -p "$TEMP/expo-tpl" && tar -xzf node_modules/expo/template.tgz -C "$TEMP/expo-tpl"
grep -n "minifyEnabled\|proguardFiles" "$TEMP/expo-tpl/package/android/app/build.gradle"
grep -n "enableMinify"              "$TEMP/expo-tpl/package/android/gradle.properties"
```

Output proves both halves:

```
118:            minifyEnabled enableMinifyInReleaseBuilds
119:            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
gradle.properties:32:android.enableMinifyInReleaseBuilds=true
```

### 5.7 Keep-rule syntax

```proguard
-keep class com.example.** { *; }                 # keep the NAME and all members
-keep class com.example.Foo { *; }                # same, one class
-keepclassmembers class com.example.Foo { <init>(...); }   # keep members, class may be renamed
-keepnames class com.example.**                   # names only (stack traces readable)
-keepattributes SourceFile,LineNumberTable        # keep line numbers
-dontobfuscate                                    # nuclear option — debugging only
```

Guidance:

- Use the **narrowest** rule that fixes the crash.
- Prefer the exact class + constructor over a whole package, unless upstream documents
  the package-wide rule (as expo-gl's issue does).
- A keep rule **cannot** fix a crash caused by deleted code that a JNI/reflective layer
  needs *by name* — that needs a specific class or member rule.

### 5.8 Two debugging tricks for R8 suspicions

1. **Disable obfuscation** temporarily (`-dontobfuscate` in `extraProguardRules`).
   If the crash disappears, you confirmed a rename — then replace it with the precise
   keep rule and remove `-dontobfuscate`.
2. **Retrace a stack trace.** A local release build writes
   `android/app/build/outputs/mapping/release/mapping.txt`. R8's `retrace` tool turns
   `xr0` back into `expo.modules.gl.GLView`. EAS builds don't give you the mapping by
   default, which is another reason to read crashes structurally (message + frames).

### 5.9 The upstream record (this exact bug)

- Issue: expo/expo **#51948** — "[expo-gl][android] Release builds crash at launch".
- Fix PR: **#51951**.
- Workaround, also what we applied: `-keep class expo.modules.gl.** { *; }`.
- `expo-gl` 58.0.3 is the newest published version at the time of writing, so the
  workaround (not a version bump) is the correct move.

---

## 6. Reading JS errors in a release build

Release has no RedBox. Two channels remain:

1. **`console.log` → logcat**, tag `ReactNativeJS`:

```bash
adb logcat -s ReactNativeJS
```

2. **Uncaught JS errors** are printed through the same tag as
   `E/ReactNativeJS: Error: ...`. Grep for it:

```bash
adb logcat -d | grep -E "ReactNativeJS" | tail -50
```

Stack traces from Hermes are **minified**. To make them readable, produce a build with
source maps and symbolicate:

```bash
npx expo export -p android --output-dir "$TEMP/exp" -s true
./node_modules/.bin/metro-symbolicate "$TEMP/exp/_expo/static/js/android/"*.map < stack.txt
```

(`metro-symbolicate` is already installed — it ships with Metro.)

For native crashes, only the keep rule / mapping approach in §5.8 helps.

---

## 7. EAS Build pipeline

### 7.1 Profiles

`eas.json` in this repo:

| Profile | Distribution | Output | Use |
|---|---|---|---|
| `development` | internal | dev client APK | Metro-connected development |
| `preview` | internal | **release APK** | real-device testing (this guide's builds) |
| `production` | store | AAB | Play Store |

`preview` is a *release* build: R8 on, Hermes bytecode, no dev menu. That is why the
launch crash appeared only there.

### 7.2 What happens on the build server

```
git archive of your working tree
        │
        ├─ npm install (lockfile)
        ├─ expo prebuild  → generates android/ (CNG) and runs config plugins
        │                   (here: the ProGuard rule gets appended)
        ├─ gradle assembleRelease  → Metro bundle → Hermes .hbc → R8 → sign
        └─ upload artifact (APK) + logs
```

### 7.3 The trap everyone hits: uncommitted files

EAS archives **the working directory**, not `HEAD`. So:

- Uncommitted edits **are** in the build.
- The build page still displays `gitCommitHash = HEAD`.

Consequence: a build can contain code that exists nowhere in git. If you need to know
*what* was built, commit first, or diff your tree against HEAD before building.

### 7.4 Command loop

```bash
npx eas-cli build -p android --profile preview --non-interactive
# prints: See logs: https://expo.dev/accounts/<acct>/projects/ember-qr/builds/<id>

npx eas-cli build:view <id> --json          # status, artifact urls, logFiles
npx eas-cli build:download --build-id <id> -p android
```

Statuses: `IN_QUEUE` → `IN_PROGRESS` → `FINISHED` / `ERRORED` / `CANCELED`.
`FINISHED` means an APK exists. It does **not** mean the app launches.

### 7.5 Reading build logs from the CLI

`logFiles[]` are gzipped NDJSON (one JSON object per line):

```bash
npx eas-cli build:view <id> --json > "$TEMP/build.json"
node -e "console.log(require(process.argv[1]).logFiles[0])" "$TEMP/build.json" > "$TEMP/logurl.txt"
curl --compressed -s "$(cat "$TEMP/logurl.txt")" > "$TEMP/build.ndjson"
node -e "
  require('fs').readFileSync(process.argv[1],'utf8').split('\n').filter(Boolean)
    .forEach(l => { try { const j = JSON.parse(l); if (j.msg) console.log(j.msg); } catch {} });
" "$TEMP/build.ndjson" | tail -40
```

(Trying to read that file as plain text gives binary garbage — it's compressed. That's
the tell.)

### 7.6 Install and re-launch

```bash
adb install -r <downloaded>.apk
adb shell am force-stop com.sb_ranjha.emberqr
adb logcat -c
adb shell monkey -p com.sb_ranjha.emberqr 1
adb logcat --pid=$(adb shell pidof com.sb_ranjha.emberqr)
```

### 7.7 Fingerprints, caching, OTA

- EAS computes a **fingerprint** of native inputs. Same fingerprint → it can reuse
  build artifacts and skip work.
- `eas update` ships **JS-only** changes over the air. Native changes (dependencies,
  config plugins, ProGuard rules) always require a **new binary**.
- A keep-rule fix is native → `eas update` cannot deliver it.

### 7.8 Local builds (if you must)

`npx eas-cli build --local` runs the same pipeline on your machine; it needs a full
Android SDK + JDK and is much heavier than the cloud path. On this Windows box the
cloud build is the supported route.

---

## 8. Is the build OK? The gate ladder

Each gate produces evidence. Stop at the first failure; do not "fix forward" past it.

| # | Gate | Command | Pass means | Does **not** prove |
|---|---|---|---|---|
| 1 | Types | `./node_modules/.bin/tsc --noEmit` | no type errors | feature works |
| 2 | Lint | `./node_modules/.bin/eslint .` | no rule violations | feature works |
| 3 | Deps/config | `npx expo-doctor` | versions/config compatible | runtime works |
| 4 | Bundle | `npx expo export -p android --output-dir "$TEMP/exp"` | every import resolves | native code works |
| 5 | Web smoke | export web → serve → Playwright | no console errors, no 4xx/5xx | looks right on phone |
| 6 | Cloud build | `eas build -p android --profile preview` | status `FINISHED` | app launches |
| 7 | Install | `adb install -r app.apk` | `Success` | app launches |
| 8 | **Launch** | clear logcat → launch → read logcat | no `FATAL EXCEPTION`, JS booted | features work |
| 9 | Feature | manual walkthrough (§4.5) | the changed behaviour is correct | nothing else regressed |

Gate 8 details — the check people skip:

```bash
adb logcat -c && adb shell monkey -p com.sb_ranjha.emberqr 1 && sleep 5
adb logcat -d | grep -E "FATAL|AndroidRuntime|ReactNativeJS" | head -40
```

Healthy looks like: `ReactNativeJS` lines (your logs), no `FATAL EXCEPTION`, no
`Unable to load script`. Unhealthy looks like the case file in §10.1.

### 8.1 One script that runs gates 1–4

```bash
set -u
cd /d/projects/ember-qr

./node_modules/.bin/tsc --noEmit            && echo "PASS tsc"    || echo "FAIL tsc"
./node_modules/.bin/eslint .                && echo "PASS lint"   || echo "FAIL lint"
npx expo-doctor                             && echo "PASS doctor" || echo "FAIL doctor"
npx expo export -p android --output-dir "$TEMP/export-check" \
                                            && echo "PASS export" || echo "FAIL export"
```

### 8.2 Symptom → likely cause

| Symptom | Most likely cause | First move |
|---|---|---|
| Splash, then closes | native crash on first frame | `adb logcat` → `FATAL EXCEPTION` |
| White screen, no crash | JS boot error, missing asset | `adb logcat -s ReactNativeJS` |
| Opens, buttons dead | JS logic / layout / hitbox | reproduce in browser, read console |
| Fine in dev, dead in preview | R8 rename / missing native module | obfuscated class in trace → keep rule |
| Fine on your phone, dead elsewhere | insets, screen size, API level | second device or emulator |
| Slow first frame | JS cold start | `am start -W`, then measure |
| Random crashes after a while | memory / native module | `adb logcat -b crash`, watch `GC`/`OOM` |
| Logs look empty | wrong buffer / filtered process | `adb logcat -d \| tail -100` |
| Browser "no change" | stale Metro graph | restart with `-c`, grep served bundle |

### 8.3 Performance sanity check

```bash
# time to first frame (TotalTime in ms)
adb shell am start -W -n com.sb_ranjha.emberqr/.MainActivity

# frame stats for your package
adb shell dumpsys gfxinfo com.sb_ranjha.emberqr framestats | head -30
```

Rough targets: cold start under ~2 s on mid-range hardware; sustained UI work should not
sit pinned at 60 fps budget misses. Watch the JS thread: a heavy re-render shows as
janky animation, not as a crash.

---

## 9. The debugging method

### 9.1 Six steps (used for both bugs in this repo)

1. **Reproduce deterministically.** Write down the exact steps and the exact symptom.
   "Sometimes closes" is not a repro; "splash → close, every launch, preview APK only"
   is.
2. **Read the error literally.** Don't paraphrase. `xr0` (short, no package) = obfuscated
   = release-only = R8. One word eliminated the entire JS layer.
3. **Find the thrower.** Grep the exact message in `node_modules` → found
   `ViewDefinitionBuilder.kt` → learned the precondition.
4. **Read the precondition, find the missing invariant.** Reflection needs a constructor;
   the rule protects only `ExpoView` subclasses; `GLView` isn't one. That's the root
   cause, not a hypothesis.
5. **Confirm against the outside world.** Search the exact exception + library. Upstream
   issue + fix matched. (If the internet disagrees, trust your evidence and say why.)
6. **One fix, then verify with evidence.** Rebuild → install → read logcat → walk the
   features. Never declare done off a green typecheck.

### 9.2 Instrumentation patterns

- **Boundary logging.** Log what enters and leaves each layer (JS → native → server).
  One run of boundary logs beats ten guesses.
- **Bisect.** `git log` + which build last worked; or comment out one suspect subtree.
- **Minimal repro.** Strip the app down to the one screen that fails; if it still fails,
  you've isolated it; if not, add back until it does.
- **Compare working vs broken.** Two similar screens, one broken: diff them line by
  line. The difference *is* the answer.
- **Timing bugs need repetition.** Run the interaction 5–20 times, with and without
  interruption, and count outcomes. One manual click proves nothing (see §2.5).

### 9.3 Evidence vs claim

| Claim | Real evidence |
|---|---|
| "It works" | click it, read state, read the log |
| "The build is fine" | installed on the target device, launched, no FATAL |
| "Types are green" | no type errors — says nothing about behaviour |
| "The bundle is updated" | grep the served bundle for the new string |
| "The fix is deployed" | the APK you installed contains it (new build ID) |
| "No one uses X" | `git grep`, `tsc`, and a positive control that the grep can match |

### 9.4 Anti-patterns

- Changing three things at once, then celebrating when it works.
- Fixing the *symptom* (wrapping in try/catch) without the thrower's precondition.
- Trusting a screenshot after a rebuild without checking which build is installed.
- Retrying the same click that "did nothing" instead of inspecting the element.
- Declaring a cloud build verified because its status is `FINISHED`.
- Deleting caches/directories as a first move instead of measuring what's wrong.

---

## 10. Case files

### 10.1 Preview APK closed immediately after the splash

**Symptom.** `eas build --profile preview` finished; on the vivo V2204 the app showed
the splash and closed. No error dialog.

**Evidence trail.**

```bash
adb logcat -c
adb shell monkey -p com.sb_ranjha.emberqr 1
adb logcat --pid=$(adb shell pidof com.sb_ranjha.emberqr)
```

```
java.lang.IllegalStateException: Didn't find a correct constructor for class xr0
  at expo.modules.kotlin.views.SimpleViewManagerWrapper.createViewInstance
  at com.facebook.react.fabric.mounting.SurfaceMountingManager.preallocateView
```

**Reasoning.**

1. `xr0` → obfuscated → release-only → R8.
2. The thrower is expo-modules-core's reflective view factory.
3. The precondition is a `(Context, AppContext)` constructor.
4. `expo-modules-core`'s shipped rule keeps that constructor **only for `ExpoView`
   subclasses**; `expo-blur`'s view is one, `expo-gl`'s `GLView` (`TextureView`) is not.
5. Upstream issue #51948 describes exactly this; workaround is the package keep rule.

**Fix.** `expo-build-properties` → `android.extraProguardRules:
"-keep class expo.modules.gl.** { *; }"` in `app.json` (native change → new build
required, no OTA).

**Verification.** New preview build → `adb install -r` → launch → logcat shows no
`FATAL EXCEPTION` → walk the smoke list (§4.5).

### 10.2 Theme toggle "works sometimes"

**Symptom.** The full-screen day/night animation sometimes flipped the theme twice, and
occasionally left the overlay stuck or ate the tap.

**Root causes.**

1. Two overlapping `Animated` runs, and a watchdog that could fire while another leg's
   callback was still in flight → both called `toggle()`.
2. `measureInWindow` on a detached router scene returns `0×0` or never calls back, so
   the measurement-only path could hang without ever committing.

**Fix.** A monotonic run id; every callback checks `live(id)`; one guarded `commit(id)`
that flips at most once per run; `stopAnimation()` on both drivers when a run exits; a
deadline watchdog so a lost measurement still completes the tap.

**Verification (browser, scripted).** 6 sequential taps → 6 flips; 5-tap burst at 120 ms
→ exactly 1 flip; navigate away mid-animation → 1 flip and overlay cleared; tap then
navigate at 60 ms → 1 flip.

**Lesson.** "Sometimes" bugs are state machines, not paint issues. Prove them with
counted, repeated interactions.

### 10.3 Proving a dependency drop was real

Claims about "smaller" are cheap. Measurements used:

- `node_modules` delta: −163.2 MB after removing six unused packages.
- Android Hermes bundle: 3.9 MB → 3.7 MB.
- `assets/`: 684 KB → 329,879 B (fonts 241,289 B + images 88,590 B).

Method: measure before, change one thing, measure after with the same command, and
state where the number came from. If the number doesn't move, the change wasn't real.

---

## 11. Learning path and references

1. **DevTools by hand** (1 h) — Network, Sources breakpoints, Performance, Console.
   Everything automated is these panels over a socket.
2. **Playwright basics** (1 afternoon) — open, log, click, assert, screenshot.
3. **Raw CDP** (optional) — `--remote-debugging-port=9222` +
   `connectOverCDP`. Then nothing is magic.
4. **Android by hand** — `adb logcat`, `adb shell`, `screencap`, `dumpsys`.
5. **Build internals** — read `node_modules/expo/template.tgz` and libraries'
   `android/` folders. Generated projects are readable; you just don't edit them.
6. **The method** — §9. Tools change, the loop doesn't.

References:

- Expo docs index: <https://docs.expo.dev/llms.txt>
- EAS Build: <https://docs.expo.dev/build/introduction/>
- `expo-build-properties`: <https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/>
- Chrome DevTools Protocol: <https://chromedevtools.github.io/devtools-protocol/>
- Playwright: <https://playwright.dev/docs/intro>
- adb: <https://developer.android.com/tools/adb>
- logcat: <https://developer.android.com/tools/logcat>
- Shrink/obfuscate (R8): <https://developer.android.com/build/shrink-code>
- expo/expo #51948 (expo-gl release crash): <https://github.com/expo/expo/issues/51948>

---

## A. Glossary

| Term | Meaning |
|---|---|
| **Metro** | RN's bundler/dev server |
| **Hermes** | JS engine used by RN; release builds are precompiled `.hbc` |
| **CNG** | Continuous Native Generation — `android/`/`ios/` are generated from config |
| **R8** | Android shrinker/optimizer/obfuscator, runs in release builds |
| **Keep rule** | ProGuard/R8 instruction to preserve classes/members |
| **AAR / APK / AAB** | Android library archive / installable app / store bundle |
| **CDP** | Chrome DevTools Protocol (WebSocket JSON) |
| **MCP** | Model Context Protocol — how tools like browser control are exposed to an agent |
| **Fingerprint** | hash of native build inputs; decides build reuse |
| **Fabric** | RN's new renderer; mounts native views via `SurfaceMountingManager` |
| **ANR** | Application Not Responding — main thread blocked > 5 s |
| **NDJSON** | newline-delimited JSON (EAS log format, gzipped) |

---

## B. Windows notes

| Trap | What happens | Do this |
|---|---|---|
| `C:\...\tmp` vs bash `/tmp` | bash maps `/tmp` to Windows temp, Node resolves it to `D:\tmp` → ENOENT | use `$TEMP` on both sides |
| `npx tsc` | may run an unrelated global package ("not the tsc command you are looking for") | `./node_modules/.bin/tsc` |
| `npx eslint` after `expo lint` | wrong ESLint version resolution | `./node_modules/.bin/eslint .` |
| `adb shell screencap > f.png` | CRLF corrupts the PNG | `adb exec-out screencap -p > f.png` |
| CRLF patches | `git apply` silently mismatches | read as latin1 or use `--ignore-whitespace` |
| Long paths | Gradle/node errors on deep paths | keep the project near the drive root |

---

## C. This repo's facts

| Item | Value |
|---|---|
| Package | `com.sb_ranjha.emberqr` |
| Main activity | `.MainActivity` |
| Expo SDK / RN / React | 58 / 0.88 / 19.3 |
| Routes | `src/app/index.tsx`, `phone.tsx`, `url.tsx`, `wifi.tsx` |
| EAS project | `@sb_ranjha/ember-qr`, id `908dd8df-2472-480c-8b1f-adb0fa61ed35` |
| Preview profile | `distribution: internal` → release APK |
| ProGuard workaround | `-keep class expo.modules.gl.** { *; }` (app.json, `extraProguardRules`) |
| Test device used | vivo V2204 (`10BCBN0QE30022R`) |
| Never commit | `.metro-web.log`, `.expo/`, build outputs, `dist/` |
