# NovaSky

[![CI](https://github.com/SamGabriel-Here/NovaSky/actions/workflows/ci.yml/badge.svg)](https://github.com/SamGabriel-Here/NovaSky/actions/workflows/ci.yml)

A desktop stargazing app for Windows, macOS and Linux. It draws the real sky above your
location at any moment in time, tells you what you are looking at, and works without a
network connection.

![The Milky Way over New York, with the photographic sky layer](docs/screenshots/14-photo-sky.png)

## What it does

The sky map is the main screen. It draws 8,920 naked-eye stars, another 74,559
telescopic ones whose density is what you see as the Milky Way, all 88 constellation
figures, the Sun, Moon and planets, 1,314 deep-sky objects at their catalogued size and
shape, 17 black holes, and satellites if you switch them on. You move around with the
mouse, the trackpad or the keyboard.

Behind all of that sits a photograph of the whole sky, aligned by converting each view
direction into galactic coordinates. Zoom in far enough on a nebula or a galaxy and the
app fetches a real survey image of it and puts it in place at the right size and angle.
The catalogue stars land on the stars in the photograph, which is how you can tell it
went in the right place.

Search finds anything by name, Bayer letter or catalogue number. Select it and you get
altitude, azimuth, magnitude, distance, rise and set times, when it is best placed
tonight, a short explanation of what it actually is, and links out to NASA, Wikipedia
and SIMBAD.

The Time Machine sets the sky to any date, past or future, and will run time forward at
up to a month per second. Visible Tonight tells you what is worth going outside for from
where you are, checked against tonight's real dark window rather than the clock. Events
covers eclipses, meteor showers, conjunctions, oppositions, lunar phases and the
solstices, and says for each one whether you can see it from your location.

Beginner mode strips the sky back to the bright, well-known objects. The Learn screen
has guided activities that only complete when you actually find the thing on the map,
plus quizzes and progress stored on your machine.

Everything except satellite tracking works offline, because every catalogue ships inside
the app. Wherever a number appears, the interface says whether it was calculated, read
from a catalogue, downloaded, or reused from cache.

## Downloads

Installers for all three platforms are attached to the
[latest release](https://github.com/SamGabriel-Here/NovaSky/releases/latest): a `.dmg`
and a `.zip` for macOS, an installer and a portable build for Windows, an AppImage and a
`.deb` for Linux.

None of them are signed, since there is no Apple or Microsoft certificate behind this.
On macOS you have to right-click and choose Open the first time, and Windows SmartScreen
will complain. The macOS builds are Apple silicon only, so an Intel Mac needs a local
build.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A C toolchain, for the one native dependency (`better-sqlite3`). Xcode Command Line
  Tools on macOS, the Visual Studio Build Tools on Windows, `build-essential` and
  `python3` on Linux. If it will not build, the app falls back to a JSON file store and
  says so in Settings. Nothing else changes.

## Setup

```bash
npm install
```

```bash
npm run data:build
```

The second step downloads the source catalogues once, about 38 MB, and reduces them to
the 8 MB or so that ships inside the app in `resources/data`. Downloads are cached in
`.data-cache/`, so running it again is cheap. The app will not start until you have done
this. If the files are missing it says so and points you here.

## Running

There is one application and two ways to start it. You never launch Electron by itself.
Electron is the runtime the app is built on, in the same way a Java app runs on the JVM.

For development, with hot reload:

```bash
npm run dev
```

macOS shows this in the Dock as Electron rather than NovaSky, because it is running
inside the generic development binary. That is expected. It is the same app.

To actually use it, build the packaged app once and open it like anything else:

```bash
npm run pack:mac
```

```bash
open release/mac-arm64/NovaSky.app
```

That one has the right name and icon and needs no terminal.

Two more that are occasionally useful. `npm run build` type-checks both projects and
writes a production bundle to `out/`. `npm start` runs that bundle without packaging it.
`npm run icon` regenerates `build/icon.png`, the single source image electron-builder
turns into the icon sets for all three platforms.

## Packaging

```bash
npm run pack:mac
```

```bash
npm run pack:win
```

```bash
npm run pack:linux
```

Output lands in `release/`, with the unpacked `.app` in `release/mac-arm64/` (or
`release/mac/` on Intel). You also get a `.dmg` and a `.zip` on macOS, an NSIS installer
and a portable `.exe` on Windows, an AppImage and a `.deb` on Linux.

The JavaScript cross-compiles fine, but `better-sqlite3` is native, so build each
platform's installer on that platform or let CI do it. Otherwise the binding will not
match.

## Testing

```bash
npm test
```

163 tests. The astronomy ones check coordinate transforms against astronomy-engine's own
routines, rise and set times against known geometry, eclipse and meteor-shower dates
against published values, and SGP4 against real ISS elements. The renderer ones check
the galactic rotation against Sagittarius A* and the north galactic pole, and where
survey cutouts land and which way up they are. The rest cover the Content Security
Policy and the UI: search, the Time Machine, onboarding, the details panel, and
accessibility roles.

```bash
npm run typecheck
```

```bash
npm run offline
```

The last one boots the built app with every outbound request refused and checks the sky
map still renders. Working with no network is the whole point of the app, so it gets its
own test. It also reports how many requests were attempted, and the answer should be
zero.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `T` | Open the Time Machine |
| `S` | Focus search |
| `B` | Toggle beginner mode |
| `F` | Toggle fullscreen |
| `Esc` | Close panels |
| Arrow keys | Look around the sky |
| `+` / `-` | Zoom in and out |
| `0` | Reset the view |

## Project layout

```
novasky/
├── .github/workflows/       # CI: type-check, test, build and boot on all three OSes
├── scripts/build-data.mjs   # downloads and reduces the source catalogues
├── resources/data/          # the offline catalogues that ship with the app
├── src/
│   ├── main/                # Electron main: window, storage, network, notifications
│   ├── preload/             # the single, audited bridge into the renderer
│   ├── renderer/            # React UI and the Three.js sky map
│   └── shared/              # astronomy, catalogue model and types, used by both
├── tests/                   # astronomy, renderer geometry, CSP and UI tests
└── docs/                    # data sources, design, and how to extend the app
```

`src/shared` imports nothing from Electron and nothing from the DOM, so every
astronomical calculation is testable on its own and usable from either process.

## Privacy

There are no accounts and no telemetry of any kind. Your location, settings and learning
progress live in a SQLite database inside the app's own data directory on your machine. The only
request the app ever makes on its own is to CelesTrak for satellite orbital elements,
and you can switch that off in Settings. Settings also has buttons for clearing cached
downloads and for erasing everything the app has stored.

## Documentation

- [Data sources and accuracy](docs/DATA_SOURCES.md)
- [Design and screens](docs/DESIGN.md)
- [Extending NovaSky](docs/EXTENDING.md)
- [Architecture](docs/ARCHITECTURE.md)

## Licence

MIT for the code. The bundled catalogues and imagery are other people's work and keep
their own licences, listed in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) and summarised
in [LICENSE](LICENSE).
