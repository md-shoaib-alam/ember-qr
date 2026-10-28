# Releasing to GitHub — every command, in order

A copy-paste runbook. Each step has one command, what it does, and what you should see.
Run it in **Git Bash** on this machine, from the repo.

Values used as the example: `v1.0.0`, build `7a2347ab`, APK 120,237,326 bytes — the real
release published on 2026-10-28. For the next release, change only the variables in step 0.

---

## Step 0 — set the variables (once per release)

What it does: every later command reads these, so the paths stay short and consistent.

```bash
cd /d/projects/ember-qr
export REPO=md-shoaib-alam/ember-qr
export VERSION=1.0.0
export TAG=v$VERSION
export APK_NAME=ember-qr-$VERSION.apk
echo "$REPO $TAG $APK_NAME"
```

Expected: `md-shoaib-alam/ember-qr v1.0.0 ember-qr-1.0.0.apk`

---

## Step 1 — make sure the tree is clean

What it does: EAS uploads the **working directory**, not `HEAD`, so anything uncommitted
ends up inside the APK while the build page shows the older commit. That mismatch is real:
the v1.0.0 build recorded `624f790` but contained the code of `360ccf4`, committed one
minute later.

```bash
git status --short
git log --oneline -1
```

Expected: nothing from `git status` (clean), and the commit you intend to ship.

If something is listed: commit it, or knowingly accept it is in the build.

---

## Step 2 — confirm the version number

What it does: the release tag should match `expo.version`.

```bash
node -e "console.log(require('./app.json').expo.version)"
```

Expected: `1.0.0`.

If you are bumping it: edit `app.json` → `expo.version`, then commit that change **before**
building.

---

## Step 3 — start the EAS build

What it does: builds a signed release APK in Expo's cloud. `preview` is
`distribution: "internal"`, which produces an installable APK rather than a Play `.aab`.

```bash
CI=1 npx eas-cli@latest build -p android --profile preview --non-interactive
```

Expected: the CLI prints a build page URL, then exits or waits. It takes 10–20 minutes and
keeps running even if you close the terminal.

Notes:
- `npm notice` lines before the real output are normal (npx is downloading the CLI).
- `CI=1` + `--non-interactive` stop it from asking questions.

You already have a build for 1.0.0 — jump to step 4.

---

## Step 4 — list builds as JSON

What it does: asks Expo for your recent Android builds.

```bash
CI=1 npx eas-cli@latest build:list --platform android --limit 5 --non-interactive --json > "$TEMP/eas-builds.json"
ls -l "$TEMP/eas-builds.json"
```

Expected: a file of a few KB.

Gotcha: the file may start with `npm notice` lines, so do not feed it straight to
`JSON.parse`. Every command below slices from the first `[`.

---

## Step 5 — read the newest build

What it does: prints status, date, profile, recorded commit, version and artifact link.

```bash
node -e "
const fs=require('fs');
const raw=fs.readFileSync(process.env.TEMP+'/eas-builds.json','utf8');
const builds=JSON.parse(raw.slice(raw.indexOf('[')));
for (const b of builds) console.log([b.status,b.createdAt,b.buildProfile,(b.gitCommitHash||'').slice(0,7),b.appVersion+'.'+b.appBuildVersion,b.artifacts?.buildUrl||'no-artifact'].join(' | '));
"
```

Expected (real output from this project):

```
FINISHED | 2026-10-28T11:53:03.507Z | preview | 624f790 | 1.0.0.1 | https://expo.dev/artifacts/eas/93ok....apk
FINISHED | 2026-10-28T10:33:56.402Z | preview | 624f790 | 1.0.0.1 | https://expo.dev/artifacts/eas/3PHi....apk
FINISHED | 2026-10-28T09:28:33.392Z | preview | e6a8102 | 1.0.0.1 | https://expo.dev/artifacts/eas/ty7K....apk
```

Reading it:
- `FINISHED` means an APK exists. It does **not** mean the app launches.
- `624f790` is the commit that HEAD pointed at when the upload started. Not proof of
  contents — steps 10–12 are.
- The APK link dies after ~14 days. A GitHub Release does not.

---

## Step 6 — save the build ID and the APK URL

What it does: extracts the newest build's two values into shell variables.

```bash
BUILD_ID=$(node -e "const fs=require('fs');const raw=fs.readFileSync(process.env.TEMP+'/eas-builds.json','utf8');process.stdout.write(JSON.parse(raw.slice(raw.indexOf('[')))[0].id)")
ARTIFACT_URL=$(node -e "const fs=require('fs');const raw=fs.readFileSync(process.env.TEMP+'/eas-builds.json','utf8');process.stdout.write(JSON.parse(raw.slice(raw.indexOf('[')))[0].artifacts.buildUrl)")
echo "$BUILD_ID"
echo "$ARTIFACT_URL"
```

Expected: a UUID, then an `https://expo.dev/artifacts/eas/....apk` URL.

---

## Step 7 — download the APK

What it does: saves the signed APK into the Windows temp folder.

```bash
curl -sL --max-time 600 -o "$TEMP/$APK_NAME" "$ARTIFACT_URL"
ls -l "$TEMP/$APK_NAME"
```

Expected: about 120 MB. The v1.0.0 file was **120,237,326 bytes** — remember your number,
you compare it again in step 24.

No login is needed: the artifact URL is already signed.

---

## Step 8 — (optional) confirm the build with the CLI

What it does: prints the build record for the ID you are about to publish.

```bash
CI=1 npx eas-cli@latest build:view "$BUILD_ID" --non-interactive --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s.slice(s.indexOf('{')));console.log(b.status,b.platform,b.appVersion,'build',b.appBuildVersion,b.gitCommitHash)})"
```

Expected: `FINISHED ANDROID 1.0.0 build 1 <sha>`

---

## Step 9 — unpack the files needed to check the APK

What it does: an APK is a zip. Classes are in `classes.dex` (compressed, so search after
extracting), the manifest is binary XML whose strings are UTF-16.

```bash
mkdir -p "$TEMP/apk-check" && cd "$TEMP/apk-check"
unzip -o -q "$TEMP/$APK_NAME" classes.dex AndroidManifest.xml resources.arsc
ls -l classes.dex AndroidManifest.xml resources.arsc
```

Expected: three files. `classes.dex` is ~10 MB.

---

## Step 10 — check the native classes

What it does: lists the app's own Kotlin classes that ended up in the build.

```bash
grep -ao "expo/modules/[a-z]*/[A-Za-z]*" classes.dex | sort -u
```

Expected for v1.0.0: the clock module's classes are present —

```
expo/modules/clocknotify/BootReceiver
expo/modules/clocknotify/ClockBareWidgetProvider
expo/modules/clocknotify/ClockRowWidgetProvider
expo/modules/clocknotify/ClockScanWidgetProvider
expo/modules/clocknotify/ClockWidgetProvider
```

If they are missing, the build predates the module. Do not release it as the new version.

---

## Step 11 — check the resources

What it does: looks for resource names and literal strings compiled into the APK.

```bash
grep -ao "clock_scan_title\|clock_scan" resources.arsc | sort -u
grep -ao "SCAN QR\|OPEN CAMERA" resources.arsc | sort -u
```

Expected: `clock_scan`, `clock_scan_title`, `SCAN QR`, `OPEN CAMERA`.

---

## Step 12 — check the manifest (UTF-16, so plain grep fails)

What it does: proves the widget receivers and the deep-link scheme are registered.

```bash
node -e "
const fs=require('fs');
const man=fs.readFileSync('AndroidManifest.xml');
const has=s=>man.includes(Buffer.from(s,'utf16le'));
for (const s of ['MainActivity','ClockWidgetProvider','ClockScanWidgetProvider','emberqr']) console.log(s.padEnd(26), has(s));
"
```

Expected: `true` on every line.

`MainActivity` is the **positive control**: it must be `true`. If it is `false`, your
search method is broken and every `false` below it means nothing.

A negative result that *is* expected: `clock_scan_info` is `false`. The binary manifest
stores resource references as numeric IDs, never names.

---

## Step 13 — leave the temp folder

What it does: the next commands run from the repo, not from the unpacked APK.

```bash
cd /d/projects/ember-qr
pwd
```

Expected: `/d/projects/ember-qr`

---

## Step 14 — create the tag

What it does: an annotated tag records a message and a tagger, and points at the commit the
APK was built from.

```bash
git tag -a "$TAG" -m "Ember QR $VERSION"
git show --stat --oneline "$TAG" | head -3
```

Expected: the tag exists and points at your release commit (for 1.0.0: `360ccf4`).

If the tag already exists: `git tag -d "$TAG"` first — but only if it was never pushed.

---

## Step 15 — push the tag

What it does: puts the tag on GitHub. The release needs it there.

```bash
GIT_TERMINAL_PROMPT=0 git push origin "$TAG"
```

Expected: `* [new tag] v1.0.0 -> v1.0.0`

---

## Step 16 — prove the tag arrived

What it does: reads the remote's tag list instead of trusting the push message.

```bash
git ls-remote --tags origin | grep "$TAG"
```

Expected: two lines — the tag object, and `refs/tags/v1.0.0^{}` with the commit SHA. The
`^{}` line is what proves which commit it really points to.

---

## Step 17 — load the GitHub token without printing it

What it does: reads the credential Git already saved for GitHub and puts it in a variable
for the next commands.

```bash
token=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')
[ -n "$token" ] && echo "token loaded" || echo "no token - run: git push origin main once"
```

Expected: `token loaded`.

Rules: never `echo "$token"`, never put it in a file, never paste it into chat. If it ever
leaks, revoke it on GitHub and re-authenticate.

---

## Step 18 — write the release notes to a file

What it does: keeps the notes out of the shell command, where long text gets mangled.

```bash
cat > "$TEMP/release-notes.md" <<'EOF'
## Ember QR 1.0.0

First tagged release, with a downloadable APK.

### Clock
- 12-hour clock card: hours, minutes, seconds, AM/PM beside the HOURS label
- Same tiles in the notification shade and as three widgets
- Android 12+ previews the real widget in the picker

### Scan
- Widget that opens the app on the camera tab

### APK
- Package `com.sb_ranjha.emberqr`, version 1.0.0 (versionCode 1)
- Built with the EAS `preview` profile, signed by Expo
EOF
wc -l "$TEMP/release-notes.md"
```

Expected: a line count of the file you just wrote.

---

## Step 19 — build the release JSON

What it does: assembles the API payload, embedding the notes file as the body.

```bash
node -e "
const fs=require('fs');
fs.writeFileSync(process.env.TEMP+'/release.json', JSON.stringify({
  tag_name: process.env.TAG,
  name: 'Ember QR '+process.env.VERSION,
  body: fs.readFileSync(process.env.TEMP+'/release-notes.md','utf8'),
  draft: false,
  prerelease: false
}, null, 2));
"
head -5 "$TEMP/release.json"
```

Expected: JSON with `tag_name`, `name`, `body`, `draft: false`, `prerelease: false`.

Why omit `target_commitish`: the pushed tag already pins the commit. Only add it when you
create the release before pushing a tag.

---

## Step 20 — create the release

What it does: `POST /releases` publishes the release page (no APK yet).

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $token" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  --data-binary "@$TEMP/release.json" \
  "https://api.github.com/repos/$REPO/releases" \
  -o "$TEMP/release-response.json" -w "status %{http_code}\n"
```

Expected: `status 201`.

Codes you may see:
- `401` — token invalid or expired.
- `404` — repo name wrong, or the token cannot see the repo.
- `422` — a release for this tag already exists.

---

## Step 21 — read the release ID and upload URL

What it does: both values are in the response; the upload URL must lose its
`{?name,label}` template tail before use.

```bash
RELEASE_ID=$(node -e "console.log(require(process.env.TEMP+'/release-response.json').id)")
UPLOAD_URL=$(node -e "console.log(require(process.env.TEMP+'/release-response.json').upload_url.replace('{?name,label}',''))")
RELEASE_URL=$(node -e "console.log(require(process.env.TEMP+'/release-response.json').html_url)")
echo "$RELEASE_ID"
echo "$UPLOAD_URL"
echo "$RELEASE_URL"
```

Expected:

```
426636921
https://uploads.github.com/repos/md-shoaib-alam/ember-qr/releases/426636921/assets
https://github.com/md-shoaib-alam/ember-qr/releases/tag/v1.0.0
```

---

## Step 22 — upload the APK

What it does: attaches the file to the release. The content type tells browsers (and
phones) what they are downloading.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary "@$TEMP/$APK_NAME" \
  --max-time 900 \
  "$UPLOAD_URL?name=$APK_NAME" \
  -o "$TEMP/asset-response.json" -w "upload %{http_code} in %{time_total}s\n"
```

Expected: `upload 201 in 13.2s` (120 MB on a normal connection).

If `422`: an asset with that name already exists on the release. Delete the old asset, or
use a different `APK_NAME`.

---

## Step 23 — confirm the asset bytes match your file

What it does: compares the size GitHub recorded with the file on disk. A truncated upload
is invisible until someone tries to install it.

```bash
node -e "
const a=require(process.env.TEMP+'/asset-response.json');
console.log(a.name, a.state, a.size, a.browser_download_url);
"
ls -l "$TEMP/$APK_NAME" | awk '{print $5, $9}'
```

Expected: both sizes identical (v1.0.0: `120237326`), state `uploaded`.

---

## Step 24 — verify the public download (logged out)

What it does: follows the redirect chain a stranger's browser would follow.

```bash
curl -sIL -o /dev/null \
  -w "%{http_code} %{content_type}\n" \
  "https://github.com/$REPO/releases/download/$TAG/$APK_NAME"
```

Expected: `200 application/vnd.android.package-archive`

If it returns `404`: the release is a draft, the tag is wrong, or the asset name differs.

---

## Step 25 — read the published release back

What it does: proves the release is live, public, and has exactly one asset.

```bash
curl -sS "https://api.github.com/repos/$REPO/releases/tags/$TAG" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const r=JSON.parse(s);
  console.log(r.name,'| draft:',r.draft,'| prerelease:',r.prerelease,'| tag:',r.tag_name);
  r.assets.forEach(a=>console.log(' asset:',a.name,a.size,'bytes',a.state));
})"
```

Expected:

```
Ember QR 1.0.0 | draft: false | prerelease: false | tag: v1.0.0
 asset: ember-qr-1.0.0.apk 120237326 bytes uploaded
```

---

## Step 26 — install the downloaded APK on the phone (optional)

What it does: tests the file you just published, not the one Expo gave you.

```bash
adb install -r "$TEMP/$APK_NAME"
```

Expected: `Performing Streamed Install` then `Success`.

If adb is not on PATH, use the full path to `platform-tools/adb.exe`. If the phone is
already running a build signed by another key: `adb uninstall com.sb_ranjha.emberqr` first.

---

## Step 27 — launch it and read the crash buffer (optional)

What it does: turns "it installed" into "it starts".

```bash
adb logcat -c
adb shell monkey -p com.sb_ranjha.emberqr 1
sleep 5
adb logcat -d | grep -E "FATAL|AndroidRuntime|ReactNativeJS" | head -40
```

Expected: `ReactNativeJS` lines and no `FATAL EXCEPTION`.

---

## Step 28 — clean up scratch files (optional)

What it does: removes the local copies; GitHub has the permanent one now.

```bash
du -sh "$TEMP/$APK_NAME" "$TEMP/apk-check" 2>/dev/null
rm -rf "$TEMP/apk-check" "$TEMP/$APK_NAME"
```

Expected: the sizes print first, then the paths are gone. Measure before deleting — that
order is what makes a mistake visible instead of silent.

---

## Doing it again — the short list

```
1.  edit app.json version if needed → commit
2.  git status --short                      (must be empty)
3.  CI=1 npx eas-cli@latest build -p android --profile preview --non-interactive
4.  CI=1 npx eas-cli@latest build:list --platform android --limit 5 --non-interactive --json > "$TEMP/eas-builds.json"
5.  read the newest build, save BUILD_ID + ARTIFACT_URL         (steps 5–6)
6.  curl -L -o "$TEMP/$APK_NAME" "$ARTIFACT_URL"                (step 7)
7.  unzip + check classes / resources / manifest                (steps 9–12)
8.  git tag -a "$TAG" -m "..." && git push origin "$TAG"        (steps 14–15)
9.  POST /releases, then upload the APK                         (steps 17–22)
10. verify size, public download, release JSON                  (steps 23–25)
```

Change `VERSION`/`TAG`/`APK_NAME` in step 0 and the rest of the commands still work.

---

## Troubleshooting

| Symptoms | Cause | Command that fixes it |
|---|---|---|
| Release lacks the new feature | built from an older tree | rebuild from the right commit, repeat from step 3 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | different signing key | `adb uninstall com.sb_ranjha.emberqr`, then install |
| APK link 403/404 on expo.dev | artifact expired (~14 days) | rebuild, or keep a copy on GitHub |
| `gh: command not found` | GitHub CLI missing | use steps 17–25 (API), or `winget install GitHub.cli` |
| API `401` | token missing/expired | `git push` once to refresh the credential, reload in step 17 |
| API `404` | wrong `$REPO`, or no access | `echo "$REPO"`, check the repo URL |
| API `422` on create | release for that tag exists | edit that release, or delete it and retry |
| `422` on upload | duplicate asset name | delete the asset, or change `$APK_NAME` |
| Download is 0 bytes | asset still processing | wait a few seconds, repeat step 24 |
| Widget picker shows the app icon | Android 11 and older ignore `previewLayout` | expected; previews need Android 12+ |

---

## What the pieces are

| Term | Meaning |
|---|---|
| EAS | Expo's cloud build service; it compiles and signs the APK |
| Artifact | the file a build produces — here, a signed APK |
| Internal distribution | an installable build that is not for a store |
| Annotated tag | a Git tag object with a message and tagger, not just a pointer |
| versionCode | Android's integer build number; EAS increments it (`appVersionSource: "remote"`) |
| `target_commitish` | which commit a release's tag should point at |
| Content type | the `Content-Type` header; `application/vnd.android.package-archive` = APK |
| Keystore | the signing key. EAS keeps it; lose it and no future APK can upgrade the app in place |

Deeper material: [docs/README.md](README.md) — EAS internals, R8 keep rules, adb/logcat.
