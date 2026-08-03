# @aegisdrive/mobile

The driver protection app. Expo (SDK 53), React 19, expo-router.

## Running it

```bash
cd apps/mobile
pnpm install --ignore-workspace   # its own lockfile, its own node_modules
cp .env.example .env
pnpm start
```

`pnpm verify` runs the enum drift check and the typecheck — the same two gates CI runs.

## Why this is not a workspace package

Excluded from `pnpm-workspace.yaml` deliberately — see
[ADR-0003](../../docs/adr/0003-mobile-standalone.md). Expo pins exact versions of
React, React Native and ~40 native modules, and pnpm's symlinked `node_modules`
breaks Metro's resolver and native autolinking.

**Consequence:** it cannot import `@aegisdrive/types`. `src/types/enums.ts`
mirrors the canonical enums, and `scripts/check-enum-drift.mjs` fails CI if they
diverge. Those string values are load-bearing across the API, the console and
this app; a mismatch is a silent data bug, not a compile error.

## The four rules this app is built on

**1. A panic must never depend on connectivity to be recorded.**

`activatePanic()` writes to a SQLite outbox, buzzes the phone, and returns. No
network call is on that path. The sync engine delivers whenever there is signal,
retrying across app restarts and reboots, and **never discards an entry** — a
panic that has failed twelve times is still a panic.

**2. Nothing claims to work when it does not.**

The voice trigger and smartwatch pairing both need native modules that managed
Expo cannot provide. Rather than stubbing them, each defines its full contract
and ships a default that reports _unavailable_, which the settings screen states
plainly. A driver who believes their duress phrase is armed will rely on it.

**3. The panic button never moves.**

It is above the fold on every device size, on the home tab, in the same place.
Long-press to arm (a pocket tap must not dispatch armed responders), ten seconds
to cancel, then it commits. Covert, voice and watch triggers skip the countdown
entirely — they are already deliberate acts under duress.

**4. Undelivered means undelivered.**

`ConnectivityBanner` distinguishes _offline_ from _degraded_ from
**`ALARM NOT YET DELIVERED`**. A driver who triggered an alarm in a dead zone
must know it has not reached anyone, because their next decision depends on it.

## Layout

```
app/                          expo-router routes
├─ _layout.tsx                boot order: database → sync → session
├─ (auth)/login.tsx
└─ (app)/
   ├─ _layout.tsx             tabs + the always-armed shake detector
   ├─ index.tsx               driver dashboard
   ├─ vehicle.tsx             vehicle status + live telemetry
   ├─ navigate.tsx            SafeCorridor selection + deviation warning
   ├─ messages.tsx            secure messaging + covert quick replies
   └─ more/
      ├─ incidents.tsx        live incident status + stand-down
      ├─ contacts.tsx         emergency contacts (local-first, one-tap dial)
      ├─ watch.tsx            smartwatch pairing
      ├─ evidence.tsx         capture + local vault with checksums
      └─ settings.tsx         permissions, covert channels, offline state

src/
├─ db/         SQLite, durable outbox, last-known-good cache
├─ lib/        api client (timeouts, single-flight refresh), secure storage
├─ services/   location, panic, covert activation, voice, watch, evidence, sync
├─ stores/     auth, connectivity, sos, trip, messaging, watch
├─ components/ UI kit, PanicButton, ConnectivityBanner
├─ theme/      tokens mirroring packages/ui
└─ types/      the enum + domain mirror
```

## Requires a development build

These need native modules Expo Go does not include. Everything else runs in Expo Go.

| Feature                     | Needs                                                              | Status                                                                                             |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Voice duress trigger        | On-device wake-word engine (Picovoice Porcupine or bundled TFLite) | Contract + phrase policy done; `registerVoiceRecognizer()` is the hook                             |
| Smartwatch pairing          | WatchConnectivity / Wear Data Layer / `react-native-ble-plx`       | Protocol + pairing state machine + heartbeat watchdog done; `registerWatchTransport()` is the hook |
| Power-button covert trigger | Native key-event interception                                      | Not implemented — the OS reserves the event. Shake gesture covers this                             |
| Background location         | Config plugin (already declared)                                   | Works in a dev build; Expo Go cannot hold background location                                      |

## Two things to fix before release

1. **Evidence upload has no body transfer yet.** `captureEvidence()` hashes the
   file, stores it locally and queues the _registration_. Pushing the bytes to
   object storage against a signed URL needs the storage provider chosen — the
   same gap the API and `services/evidence` have.

2. **Check-in timeouts are defined but not scheduled.** `PanicTrigger.CHECK_IN_TIMEOUT`
   exists and the outbox handles it; the background task that fires it when a
   driver misses a mandatory check-in is not written.
