# Architecture

## Processes

```
┌─ main ─────────────────────────────────────────────┐
│  index.ts     window, menu, CSP, permissions       │
│  store.ts     SQLite (JSON fallback) in userData   │
│  catalog.ts   reads resources/data from disk       │
│  network.ts   the only outbound request: CelesTrak │
│  notifications.ts  opt-in event scheduler          │
│  ipc.ts       every privileged operation, in one file
└───────────────┬────────────────────────────────────┘
                │  contextBridge, 11 functions
┌─ renderer ────┴────────────────────────────────────┐
│  state/       zustand store, memoised calculations │
│  sky/         Three.js renderer + React wrapper    │
│  screens/     Sky, Search, Tonight, Learn, Events, Settings
│  components/  search palette, details, time machine, onboarding
└────────────────────────────────────────────────────┘
                │
┌─ shared ──────┴────────────────────────────────────┐
│  astro/coords, catalog, ephemeris, events,         │
│        tonight, satellites, lore                   │
│  types.ts, settings.ts, learn.ts                   │
└────────────────────────────────────────────────────┘
```

`shared` imports nothing from Electron or the DOM, so both processes use it and the test
suite exercises it directly.

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`.
- A strict CSP built by `src/shared/csp.ts`. In production, `script-src 'self'` and
  `connect-src 'self'`: the renderer makes no network requests at all, catalogues arrive
  over IPC, and satellite elements are fetched by the main process. Development
  additionally allows `'unsafe-inline'` scripts and the localhost dev server, because
  @vitejs/plugin-react injects its React Refresh preamble as an inline script — block it
  and the window renders nothing. `tests/main/csp.test.ts` asserts the dev relaxations
  never reach a packaged build.
- All web permissions are denied. NovaSky needs no camera, microphone or geolocation —
  location is typed in or derived from the system time zone.
- `setWindowOpenHandler` denies every popup and forwards https URLs to the system
  browser. `will-navigate` blocks navigation away from the app shell.
- `shell:open-external` accepts https only, and only for an allowlist of six hosts.

## How the sky map stays fast

Every fixed object is stored once as a unit vector in the J2000 equatorial frame inside
one Three.js group. Orienting the sky for a given time and place is a single matrix
assignment on that group, obtained from `Astronomy.Rotation_EQJ_HOR` and re-labelled
into the renderer's axes. Changing the time therefore costs one matrix update rather
than 83 000 trigonometric conversions, which is what makes scrubbing the Time Machine
smooth and what makes month-per-second playback possible at all.

The horizon, ground, compass points, alt-azimuth grid and satellites live in a second
group in the observer's frame, so they stay still while the sky turns above them.

Solar-System bodies are the exception: they move, so their vertices are rewritten
whenever the time changes — ten objects, not ten thousand.

Picking is a dot product of the click ray against every candidate, with the ray rotated
into the sky group's frame first. Ten thousand dot products per click is far cheaper and
far more reliable than raycasting against a point cloud.

Labels are DOM elements positioned each frame by projecting their object's position.
That keeps text crisp and selectable-by-screen-reader, and a screen-space occupancy test
stops them piling up.

## Where calculations happen

All of it in the renderer, in `src/shared/astro`. The expensive ones are memoised on
inputs rounded to a sensible resolution:

| Hook | Recomputed when |
| --- | --- |
| `useSnapshot` | object, observer, or sky time to the minute |
| `useDarkWindow` | observer, or sky time to the hour |
| `useTonightPlan` | observer, beginner mode, or sky time to 15 minutes |

The Tonight planner evaluates a shortlist of candidates analytically rather than
sampling: a fixed object's altitude peaks at transit, so three position computations —
window start, window end, and transit if it falls inside — find its best moment exactly.

## State

One zustand store (`src/renderer/state/useAppStore.ts`) holds the parsed catalogue,
settings, sky time and selection. Settings are optimistic: the UI updates immediately,
then the main process confirms and returns the authoritative value. Screens are
presentational and read from the store.

Beginner mode is applied as an overlay by `effectiveSettings`, never by overwriting the
user's stored preferences — so turning it off restores exactly what they had.
