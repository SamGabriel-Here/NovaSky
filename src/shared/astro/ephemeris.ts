/**
 * Positional astronomy: where an object is, when it rises and sets, and whether it is
 * actually observable right now.
 *
 * Every value produced here is computed from astronomy-engine at the requested moment
 * and is reported to the UI with `origin: 'calculated'`. Catalogue values (a star's
 * magnitude, a galaxy's size) pass through untouched with `origin: 'catalog'`.
 */
import * as Astronomy from 'astronomy-engine'
import type {
  DataOrigin,
  Distance,
  GeoLocation,
  HorizontalPosition,
  ObjectSnapshot,
  RiseSetTimes,
  SkyObject,
  Visibility,
  VisibilityState
} from '../types'
import { azimuthToCardinal, formatDegrees, makeObserver } from './coords'
import type { Catalog } from './catalog'
import { BLACK_HOLE_NOTES, CONSTELLATION_LORE, OBJECT_NOTES, PLANET_NOTES } from './lore'

/** Astronomical twilight: the Sun this far below the horizon means a properly dark sky. */
export const ASTRONOMICAL_TWILIGHT = -18
/** Nautical twilight, used as a fallback at latitudes where it never gets fully dark. */
export const NAUTICAL_TWILIGHT = -12
/** Standard refracted altitude of the Sun's upper limb at sunrise/sunset. */
export const HORIZON_ALTITUDE = -0.833

/**
 * Scratch slot for arbitrary catalogue positions. astronomy-engine offers eight
 * user-defined star slots; NovaSky reserves the last one for one-shot rise/set queries.
 * All uses are synchronous, so the slot is never read across an await boundary.
 */
const SCRATCH_STAR = Astronomy.Body.Star8

function defineScratchStar(raHours: number, decDeg: number, distanceLy: number | null): Astronomy.Body {
  // Distance only matters for parallax; anything beyond a few light-years is
  // indistinguishable, so unknown distances get a safely large placeholder.
  Astronomy.DefineStar(SCRATCH_STAR, raHours, decDeg, Math.max(distanceLy ?? 1000, 1))
  return SCRATCH_STAR
}

const toIso = (t: Astronomy.AstroTime | null): string | null => (t ? t.date.toISOString() : null)

function bodyFromName(name: string): Astronomy.Body {
  const body = (Astronomy.Body as unknown as Record<string, Astronomy.Body>)[name]
  if (!body) throw new Error(`Unknown astronomy-engine body: ${name}`)
  return body
}

/** The astronomy-engine body used to compute this object's position. */
export function resolveBody(object: SkyObject): Astronomy.Body {
  if (object.body) return bodyFromName(object.body)
  if (object.ra === null || object.dec === null) {
    throw new Error(`Object ${object.id} has neither a body nor fixed coordinates`)
  }
  const ly = object.distance?.unit === 'ly' ? object.distance.value : null
  return defineScratchStar(object.ra, object.dec, ly)
}

/** Apparent horizontal position of any catalogue object at a moment. */
export function getPosition(
  object: SkyObject,
  date: Date,
  location: GeoLocation
): HorizontalPosition {
  const time = Astronomy.MakeTime(date)
  const observer = makeObserver(location)
  const body = resolveBody(object)
  // `ofdate: true` precesses to the equator of date, which is what Horizon() expects
  // when refraction is applied. `aberration: true` accounts for Earth's motion.
  const equatorial = Astronomy.Equator(body, time, observer, true, true)
  const horizontal = Astronomy.Horizon(
    time,
    observer,
    equatorial.ra,
    equatorial.dec,
    'normal'
  )
  return {
    altitude: horizontal.altitude,
    azimuth: horizontal.azimuth,
    ra: equatorial.ra,
    dec: equatorial.dec
  }
}

/** Altitude only — cheaper when scanning a night hour by hour. */
function altitudeAt(body: Astronomy.Body, time: Astronomy.AstroTime, observer: Astronomy.Observer): number {
  const eq = Astronomy.Equator(body, time, observer, true, true)
  return Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal').altitude
}

export interface DarkWindow {
  sunset: string | null
  sunrise: string | null
  /** Start of full astronomical darkness, or of the darkest available twilight. */
  darkStart: string | null
  darkEnd: string | null
  /** True when the Sun never reaches -18 degrees — summer nights at high latitude. */
  neverFullyDark: boolean
  /** True when the Sun never rises above the horizon — polar night. */
  polarNight: boolean
  /** True when the Sun never sets — midnight Sun. */
  polarDay: boolean
}

/**
 * The observing window for the night that follows `date`.
 *
 * Searching starts at local noon so that "tonight" means the coming night even when
 * the user opens the app after midnight.
 */
export function getDarkWindow(date: Date, location: GeoLocation): DarkWindow {
  const observer = makeObserver(location)
  const start = Astronomy.MakeTime(startOfObservingDay(date, location))

  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, start, 2)
  const sunrise = sunset
    ? Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, sunset, 2)
    : Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, start, 2)

  const polarDay = sunset === null && altitudeAt(Astronomy.Body.Sun, start, observer) > 0
  const polarNight = sunrise === null && altitudeAt(Astronomy.Body.Sun, start, observer) < 0

  let duskLimit = ASTRONOMICAL_TWILIGHT
  let dusk = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, -1, start, 2, duskLimit)
  let neverFullyDark = false
  if (!dusk && !polarNight) {
    neverFullyDark = true
    duskLimit = NAUTICAL_TWILIGHT
    dusk = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, -1, start, 2, duskLimit)
  }
  const dawn = dusk
    ? Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, +1, dusk, 2, duskLimit)
    : null

  return {
    sunset: toIso(sunset),
    sunrise: toIso(sunrise),
    darkStart: toIso(dusk) ?? toIso(sunset),
    darkEnd: toIso(dawn) ?? toIso(sunrise),
    neverFullyDark,
    polarNight,
    polarDay
  }
}

/** Local noon on the day of `date`, which is where an observing night is anchored. */
export function startOfObservingDay(date: Date, location: GeoLocation): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: location.timeZone,
    hour: 'numeric',
    hour12: false
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '12')
  const anchor = new Date(date)
  // Before local noon, the interesting night is the one that started yesterday evening.
  const shift = hour < 12 ? -1 : 0
  anchor.setUTCHours(anchor.getUTCHours() + shift * 24)
  // Step back to roughly local noon; exact precision is not needed, only the right day.
  anchor.setUTCHours(anchor.getUTCHours() - (hour - 12))
  return anchor
}

/** Rise, transit and set for the day containing `date`. */
export function getRiseSetTimes(
  object: SkyObject,
  date: Date,
  location: GeoLocation
): RiseSetTimes {
  const observer = makeObserver(location)
  const body = resolveBody(object)
  const start = Astronomy.MakeTime(startOfObservingDay(date, location))

  const rise = Astronomy.SearchRiseSet(body, observer, +1, start, 1.5)
  const set = Astronomy.SearchRiseSet(body, observer, -1, start, 1.5)
  let transit: Astronomy.HourAngleEvent | null = null
  try {
    transit = Astronomy.SearchHourAngle(body, observer, 0, start)
  } catch {
    // SearchHourAngle throws for bodies that never culminate above the pole; ignore.
    transit = null
  }

  const transitAltitude = transit ? transit.hor.altitude : null
  const circumpolar = rise === null && set === null && (transitAltitude ?? -1) > 0
  const neverRises = rise === null && set === null && (transitAltitude ?? 1) <= 0

  return {
    rise: toIso(rise),
    transit: transit ? transit.time.date.toISOString() : null,
    set: toIso(set),
    transitAltitude,
    circumpolar,
    neverRises
  }
}

export interface SkyConditions {
  sunAltitude: number
  moonAltitude: number
  moonIllumination: number
  darkness: 'day' | 'civil' | 'nautical' | 'astronomical'
}

export function getSkyConditions(date: Date, location: GeoLocation): SkyConditions {
  const time = Astronomy.MakeTime(date)
  const observer = makeObserver(location)
  const sunAltitude = altitudeAt(Astronomy.Body.Sun, time, observer)
  const moonAltitude = altitudeAt(Astronomy.Body.Moon, time, observer)
  const moonIllumination = Astronomy.Illumination(Astronomy.Body.Moon, time).phase_fraction

  const darkness: SkyConditions['darkness'] =
    sunAltitude > HORIZON_ALTITUDE
      ? 'day'
      : sunAltitude > -6
        ? 'civil'
        : sunAltitude > ASTRONOMICAL_TWILIGHT
          ? 'nautical'
          : 'astronomical'

  return { sunAltitude, moonAltitude, moonIllumination, darkness }
}

/** Roughly the faintest star visible to the unaided eye under the current sky. */
function nakedEyeLimit(conditions: SkyConditions): number {
  if (conditions.darkness === 'day') return -3
  if (conditions.darkness === 'civil') return 1.5
  if (conditions.darkness === 'nautical') return 4
  // Moonlight raises the background; a full Moon costs roughly a magnitude and a half.
  return conditions.moonAltitude > 0 ? 6.5 - 1.5 * conditions.moonIllumination : 6.5
}

/**
 * The best moment to look at an object during the coming night: the time of greatest
 * altitude inside the dark window, sampled at five-minute resolution.
 */
export function getBestViewingTime(
  object: SkyObject,
  date: Date,
  location: GeoLocation,
  window: DarkWindow = getDarkWindow(date, location)
): { time: string; altitude: number } | null {
  if (!window.darkStart || !window.darkEnd) return null
  const observer = makeObserver(location)
  const body = resolveBody(object)
  const start = new Date(window.darkStart).getTime()
  const end = new Date(window.darkEnd).getTime()
  if (!(end > start)) return null

  const stepMs = 5 * 60 * 1000
  let best: { time: string; altitude: number } | null = null
  for (let t = start; t <= end; t += stepMs) {
    const altitude = altitudeAt(body, Astronomy.MakeTime(new Date(t)), observer)
    if (!best || altitude > best.altitude) best = { time: new Date(t).toISOString(), altitude }
  }
  return best && best.altitude > 0 ? best : null
}

export function getVisibility(
  object: SkyObject,
  position: HorizontalPosition,
  magnitude: number | null,
  date: Date,
  location: GeoLocation,
  window?: DarkWindow
): Visibility {
  const conditions = getSkyConditions(date, location)
  const limit = nakedEyeLimit(conditions)
  const best = getBestViewingTime(object, date, location, window)

  let state: VisibilityState
  let summary: string

  if (object.kind === 'sun') {
    state = position.altitude > HORIZON_ALTITUDE ? 'daylight' : 'below-horizon'
    summary =
      position.altitude > HORIZON_ALTITUDE
        ? `Above the horizon at ${formatDegrees(position.altitude)}. Never look at the Sun directly.`
        : 'Below the horizon.'
  } else if (position.altitude <= 0) {
    state = 'below-horizon'
    summary = `Below the horizon (${formatDegrees(position.altitude)}).`
  } else if (conditions.darkness === 'day') {
    // Venus, Jupiter and the Moon are genuinely findable in daylight.
    const brightEnoughForDay = magnitude !== null && magnitude < -3
    state = 'daylight'
    summary = brightEnoughForDay
      ? 'Up now, but the sky is bright. Bright enough to find in daylight if you know where to look.'
      : 'Up now, but lost in daylight. Wait until after sunset.'
  } else if (conditions.darkness === 'civil' || conditions.darkness === 'nautical') {
    state = 'twilight'
    summary = `Up at ${formatDegrees(position.altitude)} in the ${azimuthToCardinal(position.azimuth)}, in twilight. The sky is still brightening the view.`
  } else if (magnitude !== null && magnitude > limit + 3) {
    state = 'too-faint'
    summary = `Up at ${formatDegrees(position.altitude)}, but at magnitude ${magnitude.toFixed(1)} it needs a telescope.`
  } else {
    state = 'visible'
    const aid =
      magnitude !== null && magnitude > limit
        ? ' Binoculars or a small telescope will help.'
        : ''
    summary = `Visible now, ${formatDegrees(position.altitude)} above the horizon in the ${azimuthToCardinal(position.azimuth)}.${aid}`
  }

  let bestViewingNote: string | null = null
  if (best) {
    bestViewingNote = `Highest at ${formatDegrees(best.altitude)} during tonight's dark hours.`
  } else if (state === 'below-horizon') {
    bestViewingNote = 'Not above the horizon during tonight’s dark hours.'
  }

  return { state, summary, bestViewing: best?.time ?? null, bestViewingNote }
}

/** Apparent magnitude at this instant. Planets and the Moon vary; catalogue values do not. */
export function getMagnitude(
  object: SkyObject,
  date: Date
): { magnitude: number | null; origin: DataOrigin } {
  if (object.body && object.kind !== 'sun') {
    try {
      const illum = Astronomy.Illumination(bodyFromName(object.body), Astronomy.MakeTime(date))
      return { magnitude: illum.mag, origin: 'calculated' }
    } catch {
      return { magnitude: object.magnitude, origin: 'catalog' }
    }
  }
  if (object.kind === 'sun') return { magnitude: -26.7, origin: 'catalog' }
  return { magnitude: object.magnitude, origin: 'catalog' }
}

const AU_KM = 149597870.7
const LY_AU = 63241.077

/** Distance at this instant for Solar-System bodies; the catalogue value otherwise. */
export function getDistance(object: SkyObject, date: Date): Distance | null {
  if (!object.body) return object.distance
  const time = Astronomy.MakeTime(date)
  if (object.kind === 'moon') {
    const vec = Astronomy.GeoMoon(time)
    const au = Math.hypot(vec.x, vec.y, vec.z)
    return { value: Math.round(au * AU_KM), unit: 'km', origin: 'calculated' }
  }
  const vec = Astronomy.GeoVector(bodyFromName(object.body), time, true)
  const au = Math.hypot(vec.x, vec.y, vec.z)
  return { value: Number(au.toFixed(4)), unit: 'au', origin: 'calculated' }
}

/** Illuminated fraction, 0..1, for bodies that show phases. */
export function getIllumination(object: SkyObject, date: Date): number | null {
  if (!object.body || object.kind === 'sun') return null
  try {
    return Astronomy.Illumination(bodyFromName(object.body), Astronomy.MakeTime(date)).phase_fraction
  } catch {
    return null
  }
}

/** Name of the constellation the object currently sits in, from IAU boundaries. */
export function constellationAt(raOfDate: number, decOfDate: number): { symbol: string; name: string } {
  const info = Astronomy.Constellation(raOfDate, decOfDate)
  return { symbol: info.symbol, name: info.name }
}

// ------------------------------------------------------- description + links

const WIKI = (title: string): string =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

function buildLinks(object: SkyObject): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = []
  if (object.kind === 'planet' || object.kind === 'moon' || object.kind === 'sun') {
    const slug = object.name.toLowerCase()
    const isUnique = slug === 'sun' || slug === 'moon'
    links.push({
      label: `NASA science page for ${isUnique ? 'the ' : ''}${object.name}`,
      url: `https://science.nasa.gov/${isUnique ? slug : `${slug}/`}`
    })
    links.push({ label: 'NASA/JPL planetary fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' })
  }
  if (object.kind === 'black-hole') {
    links.push({
      label: `SIMBAD record for ${object.name}`,
      url: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(object.aliases[object.aliases.length - 2] ?? object.name)}`
    })
    links.push({ label: 'NASA: black holes explained', url: 'https://science.nasa.gov/universe/black-holes/' })
  }

  if (object.kind === 'deep-sky') {
    const messier = object.aliases.find((a) => /^M\d+$/.test(a))
    if (messier) {
      links.push({ label: `NASA: ${messier}`, url: `https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/` })
    }
    links.push({ label: 'SIMBAD astronomical database', url: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(object.aliases[0] ?? object.name)}` })
  }
  links.push({ label: `Wikipedia: ${object.name}`, url: WIKI(object.name) })
  return links
}

/**
 * Beginner-facing description. Curated notes take priority; otherwise the text is
 * assembled from catalogue fields so that nothing is asserted that is not in the data.
 */
export function describeObject(object: SkyObject, catalog: Catalog): string {
  if (object.kind === 'constellation') {
    const lore = CONSTELLATION_LORE[object.constellation ?? '']
    if (lore) return lore.summary
    return `${object.name} is one of the 88 constellations recognised by the International Astronomical Union.`
  }

  const curated =
    OBJECT_NOTES[object.name] ?? PLANET_NOTES[object.name] ?? BLACK_HOLE_NOTES[object.name]
  if (curated) return curated

  const constellation = object.constellation
    ? (catalog.constellationNames.get(object.constellation) ?? object.constellation)
    : null

  if (object.kind === 'star') {
    const parts = [`${object.name} is a star`]
    if (constellation) parts.push(` in the constellation ${constellation}`)
    if (object.magnitude !== null) parts.push(`, shining at magnitude ${object.magnitude.toFixed(2)}`)
    if (object.distance) parts.push(` about ${formatDistance(object.distance)} away`)
    if (object.subtype) parts.push(`. Its catalogued spectral type is ${object.subtype}`)
    return `${parts.join('')}.`
  }

  if (object.kind === 'black-hole') {
    return `${object.name} is a ${(object.subtype ?? 'black hole').toLowerCase()}${
      constellation ? ` in the direction of ${constellation}` : ''
    }. A black hole emits no light of its own; what telescopes detect is the material around it, or the motion of a companion star.`
  }

  if (object.kind === 'deep-sky') {
    const kind = (object.subtype ?? 'deep-sky object').toLowerCase()
    const parts = [`${object.name} is a ${kind}`]
    if (constellation) parts.push(` in ${constellation}`)
    if (object.magnitude !== null) parts.push(`, catalogued at magnitude ${object.magnitude.toFixed(1)}`)
    if (object.sizeArcmin) parts.push(` and spanning about ${object.sizeArcmin.toFixed(1)}′ of sky`)
    return `${parts.join('')}.`
  }

  return `${object.name} is tracked by NovaSky using the astronomy-engine ephemeris.`
}

export function formatDistance(distance: Distance): string {
  const { value, unit } = distance
  switch (unit) {
    case 'km':
      return `${Math.round(value).toLocaleString()} km`
    case 'au':
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} AU (${Math.round(value * AU_KM).toLocaleString()} km)`
    case 'ly':
      return value >= 1000
        ? `${(value / 1000).toFixed(1)} thousand light-years`
        : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} light-years`
    case 'kly':
      return `${value.toLocaleString()} thousand light-years`
    case 'Mly':
      return `${value.toLocaleString()} million light-years`
  }
}

export { AU_KM, LY_AU }

/** Everything the object details panel needs, for one object at one moment. */
export function buildSnapshot(
  object: SkyObject,
  date: Date,
  location: GeoLocation,
  catalog: Catalog,
  window?: DarkWindow
): ObjectSnapshot {
  const position = getPosition(object, date, location)
  const riseSet = getRiseSetTimes(object, date, location)
  const { magnitude, origin: magnitudeOrigin } = getMagnitude(object, date)
  const visibility = getVisibility(object, position, magnitude, date, location, window)
  const lore = object.kind === 'constellation' ? CONSTELLATION_LORE[object.constellation ?? ''] : null

  return {
    object,
    position,
    riseSet,
    visibility,
    magnitude,
    magnitudeOrigin,
    distance: getDistance(object, date),
    illumination: getIllumination(object, date),
    description: describeObject(object, catalog),
    mythology: lore?.mythology ?? null,
    links: buildLinks(object),
    positionOrigin: 'calculated'
  }
}
