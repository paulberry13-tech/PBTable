# Running this app natively — what actually works

Written 2026-08-31, the first time this codebase was ever run on a native device.
Everything here was learned the hard way in one session.

## The iPhone + Expo Go route is CLOSED

Expo Go is versioned to match the SDK: an **SDK 57** project needs **Expo Go 57.x**.

- The App Store's Expo Go is on **54.x**. It cannot run this project, and no amount of
  updating changes that — there is only ever one version in the App Store.
- The error the dev server prints is *"Project is incompatible with this version of
  Expo Go — the project requires a newer version"*, which reads like the phone is out
  of date. It is the store that is behind.
- Expo publishes the correct client for every SDK at
  `https://github.com/expo/expo-go-releases/releases`, but the **iOS build is a
  `.tar.gz` for the SIMULATOR only** — it cannot be sideloaded onto a physical iPhone.
  Only the **Android build is a directly installable `.apk`**.

So on a real iPhone the only routes are the **Mac's iOS Simulator** (which can install
the correct Expo Go automatically) or a **development build via EAS + TestFlight**,
which needs the £79/yr Apple Developer account.

Check what the current SDK needs with:

```bash
curl -s https://api.expo.dev/v2/versions/latest \
  | python -c "import sys,json; print(json.load(sys.stdin)['data']['sdkVersions']['57.0.0'])"
```

⚠️ The `iosVersion` / `androidVersion` fields in that same response are **legacy junk**
(they still say `2.25.1`). Only the per-SDK `iosClientVersion` / `androidClientVersion`
are meaningful. This wasted a round trip.

## The Android emulator route WORKS, and needs no Android Studio

Full Android Studio is ~8GB and unnecessary. The command-line tools plus one system
image is about 2GB, needs no admin rights, and installs outside OneDrive.

Installed on this machine at:

- JDK 17 — `%LOCALAPPDATA%\pbtable-tools\jdk\jdk-17.0.20.1+1`
- Android SDK — `%LOCALAPPDATA%\Android\Sdk`
- AVD named **`pbtable`** (Pixel 7, API 35, google_apis x86_64)
- Expo Go 57.0.9 APK — `%LOCALAPPDATA%\pbtable-tools\ExpoGo-57.0.9.apk`

To bring it up again:

```bash
export JAVA_HOME="/c/Users/PaulBerry/AppData/Local/pbtable-tools/jdk/jdk-17.0.20.1+1"
export PATH="$JAVA_HOME/bin:$PATH"
SDK="/c/Users/PaulBerry/AppData/Local/Android/Sdk"

"$SDK/emulator/emulator.exe" -avd pbtable -no-snapshot-save -gpu auto -no-boot-anim &
"$SDK/platform-tools/adb.exe" wait-for-device

# In the project: npx expo start
# Then point the emulator at the dev server. adb reverse is what makes
# 127.0.0.1:8081 inside the emulator reach Metro on the host:
"$SDK/platform-tools/adb.exe" reverse tcp:8081 tcp:8081
"$SDK/platform-tools/adb.exe" shell am start -a android.intent.action.VIEW \
  -d "exp://127.0.0.1:8081" host.exp.exponent
```

Screenshot with `adb exec-out screencap -p > shot.png`.

Windows notes: `HypervisorPresent` was already true on this machine, so the emulator
accelerated without enabling any Windows features (which would have needed admin and a
reboot). No Android SDK or Java existed beforehand.

## The crash that cost the most time

First native launch died instantly with a **native** crash, not a JS error:

```
Fatal signal 11 (SIGSEGV) ... in tid (mqt_v_js)
#00 libhermesvm.so
#01 libworklets.so      <-- the culprit
```

Cause: **the project's package versions had drifted from what SDK 57 expects.**
`react-native-worklets` was on 0.10.0 where 0.10.1 was expected, `react-native-reanimated`
4.5.0 vs 4.5.1, `react-native` 0.86.0 vs 0.86.3 — eighteen packages in all.

Expo Go ships FIXED native code. When the JS half of a native module does not match the
native half compiled into Expo Go, it does not fail politely — it segfaults the moment
the bundle loads.

**None of this shows up on web**, which is why it survived unnoticed: the web export has
no native modules at all, so `npx expo export -p web` passed throughout.

The fix is the sanctioned one:

```bash
npx expo install --check   # lists the drift
npx expo install --fix     # corrects it
```

⚠️ `--fix` also **edits `app.json`**, adding config plugins for packages that declare
them (it added `expo-image`, `expo-status-bar`, `expo-web-browser`). That is correct for
native, but it is a config change made by a tool, not by a person — check the diff.

**Lesson for the future: run `npx expo install --check` before assuming a native
problem is your own code.** The dev server prints a one-line hint about this at startup
("17 other packages may need updating"), which is easy to scroll past.
