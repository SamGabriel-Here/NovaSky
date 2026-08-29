# Data sources and accuracy

NovaSky never invents an astronomical value. Every number in the app is either read from
a published catalogue or computed from an ephemeris, and the UI labels which of those it
is on every figure it shows.

## The four origins

The `DataOrigin` type is attached to values throughout the app and surfaced as a badge
next to them:

| Origin | Meaning | Examples |
| --- | --- | --- |
| **Calculated** | Computed from an ephemeris model for the exact moment shown | altitude, azimuth, rise/transit/set, planetary magnitude and distance, eclipse circumstances |
| **Catalogue** | Read from a dataset bundled with the app | star magnitudes and parallax distances, deep-sky sizes and shapes, constellation figures |
| **Live** | Downloaded from the network during this session | satellite orbital elements |
| **Cached** | Downloaded earlier and reused because the network is unavailable | stale satellite elements, always shown with an age warning |

## Bundled catalogues

All of these are fetched and reduced by `npm run data:build` (`scripts/build-data.mjs`)
and written to `resources/data/`.

### Stars: HYG database v4.1

<https://github.com/astronexus/HYG-Database>

A merge of the Hipparcos catalogue, the Yale Bright Star Catalogue and the Gliese
catalogue of nearby stars. NovaSky ships two subsets:

- `stars.json` holds 8,920 stars down to magnitude 6.5, roughly the naked-eye limit
  under a dark sky. These are searchable, selectable and labelled. Fields kept: HYG and Hipparcos
  ids, proper name, Bayer and Flamsteed designations, J2000 right ascension and
  declination, visual magnitude, B−V colour index, distance in parsecs, spectral type
  and constellation.
- `stars-faint.json` holds 74,559 stars from magnitude 6.5 to 9.0, stored as a flat number
  array of `[ra, dec, magnitude, colourIndex]`. These are never searched or clicked;
  they exist so that the Milky Way appears in the sky map as what it actually is, the
  combined light of tens of thousands of real stars along the galactic plane.

HYG encodes "parallax unknown" as the sentinel distance 100 000 parsecs. The build
script converts that to `null`, and the app then says "Not catalogued" rather than
printing a fictional distance.

Licence: CC BY-SA 4.0.

### Constellations: d3-celestial

<https://github.com/ofrohn/d3-celestial>

All 88 IAU constellations with their names, genitive forms, centre positions and the
traditional stick figures. The source stores right ascension in degrees on −180…180;
NovaSky converts to hours on 0 to 24. All 88 of them have a figure, and the test suite
checks that.

Licence: BSD-3-Clause.

### Deep-sky objects: OpenNGC

<https://github.com/mattiaverga/OpenNGC>

The NGC and IC catalogues plus an addendum of non-NGC objects. NovaSky keeps 1,314
entries: everything with a Messier number, everything with a common name, and everything
brighter than magnitude 11.5. Fields kept: designation, Messier number, common names,
object class, constellation, J2000 position, V (or B) magnitude, and the major axis,
minor axis and position angle, which the renderer uses to draw each object at its real
size, shape and orientation.

109 of the 110 Messier objects are present. M102 is the genuine gap: it is a disputed
entry that OpenNGC does not assign, and NovaSky does not guess.

OpenNGC has no distance column, so the details panel reports "Not catalogued" for
deep-sky distances rather than substituting a figure from elsewhere.

Licence: CC BY-SA 4.0.

### Black holes: SIMBAD

<https://simbad.cds.unistra.fr/>

Seventeen confirmed black holes and strong candidates: twelve stellar-mass systems in
the Milky Way and its satellites, and five supermassive ones. There is no downloadable
"catalogue of black holes", since the confirmed set is a short, well-studied list, so
`scripts/build-data.mjs` holds the list of SIMBAD identifiers and queries SIMBAD's TAP
service at build time for each one's position, magnitude and object class. No coordinate
is ever hand-entered.

The magnitude recorded for a black-hole system belongs to its companion star or host
galaxy; a black hole emits no light, and the details panel says so.

Please credit SIMBAD as its operators request: Wenger et al. (2000), A&AS 143, 9.

### Places: IANA time-zone reference points

<https://github.com/moment/moment-timezone> (`data/meta/latest.json`)

418 time-zone reference cities with coordinates and country, used to guess a starting
location from the system time zone and to back the "nearest city" picker. NovaSky never
asks the operating system for GPS.

Licence: MIT.

## Imagery

Imagery is the one category of data in NovaSky that is *pictures* rather than
measurements. It is never used to work out a position, a magnitude or a time, which
always come from the catalogues and the ephemeris, and the UI labels it separately.

### All-sky panorama: ESO GigaGalaxy Zoom

<https://www.eso.org/public/images/eso0932a/>

A 4000x2000 photographic mosaic of the entire sky by Serge Brunier, equirectangular in
galactic coordinates. It ships with the app (4.6 MB) and provides the dust lanes, the
Great Rift and the nebulosity of the Milky Way, which no star catalogue can supply.

Nothing about its alignment is assumed. The fragment shader converts each view direction
into galactic coordinates using the rotation matrix from `Astronomy.Rotation_EQJ_GAL()`
and samples the panorama directly, so the image registers against the computed sky by
construction. `tests/renderer/geometry.test.ts` checks that transform against Sagittarius
A* and the north galactic pole.

The panorama fades out below a 34-degree field of view: 4000 pixels across 360 degrees
is about 5.4 arcminutes per pixel, so past that point it is being magnified beyond its
resolution and survey cutouts take over.

Credit: ESO/S. Brunier. Licence: CC BY 4.0.

### Deep-sky cutouts: Digitized Sky Survey

Fetched on demand from CDS's `hips2fits` service (DSS2 colour), with NASA SkyView as a
fallback. Zooming in on a selected deep-sky object below a 6-degree field requests a
512-pixel gnomonic cutout matched to the current view, which is then placed on the
celestial sphere at the object's true position, scale and orientation.

The mesh is built from the projection the service delivers, which is TAN with north up
and east left, so the photograph lands registered with the catalogue stars drawn on top
of it. That
registration is the check that the orientation is right, and it is asserted in
`tests/renderer/geometry.test.ts`.

Cutouts are cached in the local database, so an object you have already looked at works
offline afterwards. Nothing is fetched when `allowNetwork` is off, and the sky map falls
back to its computed rendering whenever an image is unavailable.

Credit: Digitized Sky Survey, served by CDS/Aladin and NASA SkyView. See the DSS
copyright notice at <https://archive.stsci.edu/dss/copyright.html>.

#### Why DSS rather than a deeper survey

CDS also serves PanSTARRS DR1 through the same
interface, and on faint extended objects it is visibly better: more nebular filament,
better colour. It was rejected for two reasons. It saturates badly on bright cores: a
cutout of the Orion Nebula comes back with hard red and blue blocks where the detectors
clipped, which is worse than no image. And it only covers declinations above about -30
degrees, so a southern observer would get nothing. DSS is shallower but uniform across
the whole sky and well behaved on bright targets, which matters more for the objects
people actually look up. Choosing per object would work, PanSTARRS for faint targets and
DSS for bright ones, and that is the obvious place to start if anyone revisits this.

## Calculated values

### Ephemeris: astronomy-engine

<https://github.com/cosinekitty/astronomy>

Positions of the Sun, Moon and planets; precession and nutation; refraction; rise, set
and transit; twilight; illumination and phase; eclipses; lunar phases; the seasons;
oppositions and greatest elongations. Its accuracy is roughly one arcminute for the
planets over the years 1700 to 2200, which is well inside what any observer can resolve by
eye.

Two implementation notes worth knowing:

- The sky map orients all 8,920 stars with a single rotation matrix obtained from
  `Astronomy.Rotation_EQJ_HOR`, re-labelled into the renderer's axes by
  `eqjToWorldMatrix` in `src/shared/astro/coords.ts`. That matrix is verified against
  `Astronomy.Horizon` for multiple stars, dates and latitudes in
  `tests/astro/coords.test.ts`, so precession and nutation are handled correctly even
  when the Time Machine is set centuries away.
- `Astronomy.SearchSunLongitude` bisects for a sign change in a quantity that wraps once
  a year, so it fails when handed a year-long search window. `sunReachesLongitude` in
  `src/shared/astro/events.ts` anchors on the March equinox and searches a twenty-day
  window instead.

### Meteor showers: IMO working list

<https://www.imo.net/resources/calendar/>

Thirteen major annual showers. The radiant positions, activity periods, parent bodies
and zenithal hourly rates are observational data taken from the International Meteor
Organization's working list and stored in `METEOR_SHOWERS` in
`src/shared/astro/events.ts`. Each year's peak *date* is not stored. It is solved for
from the shower's solar longitude, which is how the IMO publishes it, so the dates shift
correctly from year to year.

The IMO quotes solar longitudes referred to J2000 while astronomy-engine searches the
apparent longitude of date. NovaSky corrects for general precession in longitude
(50.2879″ per year), which is worth about nine hours of shower timing a quarter century
after J2000.

Rates are nominal maxima under ideal dark skies. Real rates vary considerably, and the
Moon usually matters more than the ZHR does, which is why the app reports the Moon's
phase alongside every shower.

### Satellites: CelesTrak, propagated with SGP4

<https://celestrak.org/>

The "visual" group of orbital elements, propagated with `satellite.js`. This is the only
part of NovaSky that touches the network, and the only data that genuinely cannot work
offline: orbital elements decay, and a set more than a couple of days old drifts
visibly.

NovaSky warns at 48 hours and refuses to present positions as reliable beyond 14 days.
A satellite is shown as visible only when it is sunlit *and* the observer's sky is dark,
tested with a cylindrical Earth-shadow model.

Please respect CelesTrak's usage guidelines: NovaSky caches for an hour and never polls
faster than that.

## Editorial content

Constellation mythology, object descriptions and the Learn material in
`src/shared/astro/lore.ts` and `src/shared/learn.ts` are written prose, not data. They
are kept in separate files from the catalogues for exactly that reason. Attribution
conventions used there:

- "Ptolemy": one of the 48 constellations in the *Almagest* (2nd century CE).
- "Keyser & de Houtman": charted on the 1595 to 1597 Dutch voyage, published by Plancius
  (1598) and popularised in Bayer's *Uranometria* (1603).
- "Lacaille": introduced by Nicolas-Louis de Lacaille from his 1751 to 1752 Cape survey.
- "Hevelius": introduced by Johannes Hevelius, published 1687 or 1690.

Where a mass or distance appears in prose (black holes, mostly) it is quoted as a
published estimate and hedged, because for most of those objects the error bars are
large. Values that are not well established are omitted rather than guessed.

## What is deliberately approximate

Two things in the renderer are drawn larger than life, as every planetarium does, so
that they are legible and clickable:

- The Moon's disc has a floor of 16 pixels, so its phase can be seen when zoomed out.
  Its *position* is exact; only the drawn diameter is exaggerated.
- Planets and deep-sky markers are drawn at a minimum size so they can be clicked.

Nothing else is stylised. The nebula glows use each object's catalogued major axis,
minor axis and position angle, so the Andromeda Galaxy really is about six full-Moons
long and really is oriented at a position angle of 35°.
