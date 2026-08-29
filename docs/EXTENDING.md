# Extending NovaSky

Where to add things, and what you have to touch to make them appear everywhere.

## The shape of the app

```
scripts/build-data.mjs   downloads and reduces catalogues  ->  resources/data/*.json
src/main/catalog.ts      reads those files from disk       ->  IPC
src/shared/astro/        turns them into SkyObjects, computes positions and events
src/renderer/            draws them and explains them
```

`src/shared` is free of Electron and DOM imports. Anything astronomical belongs there,
which is what makes it directly testable.

## Adding a new class of object

Worked example: the black holes, which were added after the first version and touched
every layer. Follow the same seven steps.

### 1. Get the data

Add a source to `SOURCES` and a `buildX()` function in `scripts/build-data.mjs`, writing
a compact JSON file into `resources/data/`. Two rules:

- Never hand-enter a coordinate. If the objects are not in a downloadable catalogue,
  query an authority for them at build time — the black-hole builder holds a list of
  SIMBAD identifiers and asks SIMBAD's TAP service for the positions.
- Write `null` for anything the source does not have. The UI is built to say "Not
  catalogued", and that is always better than a plausible-looking guess.

Add the new file to the manifest counts so it shows up in Settings, and register it in
`FILES` in `src/main/catalog.ts` and in `CatalogPayload` in `src/shared/types.ts`.

### 2. Add the kind

Add to `ObjectKind` in `src/shared/types.ts`. TypeScript will now tell you every place
that has to handle it — `KIND_LABEL` in the search palette, the label CSS classes, the
renderer's label-offset switch. Work through the errors.

### 3. Model it

In `src/shared/astro/catalog.ts`, add the raw row interface, a `xToSkyObject` mapper and
a loop in `buildCatalog`. Give it useful `aliases`: those are what search matches on, so
include catalogue designations in every form someone might type them. Set `beginner` if
it should survive beginner mode.

If it should rank high in search, add a bonus in `scoreObject`.

### 4. Describe it

Curated prose goes in `src/shared/astro/lore.ts`. Wire it into `describeObject` and
`buildLinks` in `src/shared/astro/ephemeris.ts`. If there is no curated note, the
fallback assembles a sentence from catalogue fields, which never asserts anything the
data does not contain.

Nothing else is needed for positions: as long as the object has `ra` and `dec`,
`resolveBody` handles it through astronomy-engine's user-defined star slot, so altitude,
azimuth, rise/set, transit, visibility and best-viewing time all work immediately.

### 5. Draw it

In `src/renderer/sky/SkyRenderer.ts`:

- Add a `buildX()` that fills a `THREE.BufferGeometry` and a `ShaderMaterial`, and call
  it from `setCatalog`.
- Add the layer to the array in `updateCamera` so it receives the shared uniforms
  (`zoom`, `elapsed`, `pxPerDegree`, `aspect`, `animate`).
- Push labels and pick targets in `refreshLabels`. Picking is a dot product against
  every candidate, so nothing special is required — just add to `pickTargets`.

Shaders get `elapsed` in seconds and `animate`, which is `0` when the user has asked for
reduced motion. Multiply every time-varying term by `animate`.

### 6. Let the user turn it off

Add a boolean to `Settings` in `src/shared/types.ts`, a default in
`src/shared/settings.ts`, an entry in `LAYERS` in `SkyScreen.tsx` and a `Toggle` in
`SettingsScreen.tsx`. If beginner mode should override it, add it to
`BEGINNER_OVERRIDES`.

### 7. Test it

Add coordinate-range and search assertions to `tests/astro/catalog.test.ts`, and a
details-panel assertion to `tests/ui/components.test.tsx`.

## Adding a new event type

1. Add the kind to `AstroEventKind` in `src/shared/types.ts`.
2. Write a `getX(from, to, location)` in `src/shared/astro/events.ts` returning
   `AstroEvent[]`. Use `eventId(kind, key, time)` so ids are stable and unique — the
   test suite asserts uniqueness.
3. Call it from `getEvents`, guarded by `include(kind)`.
4. Add presentation in `KIND_META` in `EventsScreen.tsx` and an entry in
   `NOTIFICATION_KINDS` in `SettingsScreen.tsx`.
5. Fill in `localVisibility` if the event depends on where the observer is. This is what
   lets the app say "the path of totality misses you" instead of implying otherwise.

Beware `Astronomy.Search*` helpers over long windows: several of them bisect for a sign
change in a quantity that wraps annually and will return `null` rather than fail loudly.
Bracket the search near an estimate — `sunReachesLongitude` shows the pattern.

## Adding a new data source

1. Add the URL to `SOURCES` in `scripts/build-data.mjs`. Downloads are cached in
   `.data-cache/` by filename, so re-runs are cheap.
2. If it is fetched at *runtime* rather than build time, it belongs in
   `src/main/network.ts`, must respect `settings.allowNetwork`, must cache through the
   store, and must return a result carrying `origin: 'live' | 'cached'` plus a `warning`
   when the data is stale. Follow `getTleBundle`.
3. Add the host to `ALLOWED_LINK_HOSTS` in `src/main/ipc.ts` if the UI links to it. The
   renderer cannot open arbitrary URLs — `shell:open-external` refuses anything that is
   not https and on that list.
4. Document it in `docs/DATA_SOURCES.md`, including its licence.

## Adding a learning activity or quiz

Everything is data in `src/shared/learn.ts`.

- An `Activity` needs a `targetObjectId` matching a catalogue id. It completes when the
  learner actually selects that object anywhere in the app, so no extra wiring is
  needed. Add `southernTargetObjectId` and `southernNote` when the primary target is
  invisible from the southern hemisphere, as Polaris is.
- A `Quiz` is a list of questions with an `answerIndex` and an `explanation`. Passing at
  `QUIZ_PASS_RATIO` unlocks an achievement whose id matches the quiz id.
- Add the reward to `ACHIEVEMENTS` so it appears in the trophy list.

## Storage and migrations

`src/main/store.ts` keeps settings as one row per key, so adding a setting never
invalidates the others and an unknown key is ignored. New tables go in the `SCHEMA`
constant, which runs `CREATE TABLE IF NOT EXISTS` on every start. Mirror any new method
in both `SqliteStore` and `JsonStore` — the JSON store is the fallback when the native
binding will not load, and the `Store` interface will not compile until both implement it.

## Adding imagery

Imagery is kept apart from measurements throughout: `src/main/imagery.ts` is the only
module that produces it, and it never feeds a calculation.

- **Bundled** imagery is downloaded by `scripts/build-data.mjs`, listed in
  `electron-builder.yml` under `extraResources`, and read by `readSkyImage`. Send it to
  the renderer as raw bytes over IPC and turn it into a blob URL there — that keeps
  `img-src` in the CSP limited to `blob:` instead of opening it to the filesystem.
- **Fetched** imagery goes through `getObjectImage`, which must respect
  `settings.allowNetwork`, cache through the store, and return an `origin` of `live` or
  `cached` plus a `warning` when it cannot deliver. An absent image is a normal outcome:
  the sky map keeps its computed rendering.

If you add a new cutout service, match the projection assumptions in
`buildCutoutGeometry` (gnomonic, north up, east left) or extend it, and add an assertion
to `tests/renderer/geometry.test.ts`. Orientation bugs are easy to miss by eye on a
roughly symmetric object; the reliable check is whether the catalogue stars land on the
stars in the photograph.

## A note on the CSP

`src/shared/csp.ts` builds the renderer's Content Security Policy. A policy that is too
tight fails *silently* — Electron blocks the script, the window comes up blank, and
nothing appears in the terminal. If you add anything that loads a resource in the
renderer, extend the policy there and add an assertion to `tests/main/csp.test.ts`.
`createWindow` also forwards renderer console errors and `did-fail-load` to the terminal
in dev, so a future blank window announces itself.

## Security boundary

The renderer has no Node access. Everything privileged goes through one of the channels
in `src/main/ipc.ts`, mirrored one-to-one in `src/preload/index.ts`. If you need a new
capability, add it in both files and nowhere else — that pair of files is the whole
trust boundary, and it is meant to stay small enough to read in one sitting.
