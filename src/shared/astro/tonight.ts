/**
 * The "Visible Tonight" planner.
 *
 * Scanning every catalogue object across the night would be far too slow, so the
 * planner works from a shortlist of genuinely observable candidates and evaluates each
 * one analytically: a fixed object's altitude peaks at transit, so three position
 * computations (window start, window end, transit) are enough to find its best moment.
 */
import * as Astronomy from 'astronomy-engine'
import type { AstroEvent, GeoLocation, RiseSetTimes, SkyObject } from '../types'
import type { Catalog } from './catalog'
import { SOLAR_SYSTEM, deepSkyToSkyObject, starToSkyObject, constellationToSkyObject } from './catalog'
import {
  type DarkWindow,
  type SkyConditions,
  getDarkWindow,
  getRiseSetTimes,
  getSkyConditions,
  getPosition,
  getMagnitude,
  resolveBody
} from './ephemeris'
import { makeObserver } from './coords'
import { getEvents } from './events'

/** Naked-eye stars worth calling out by name. */
const BRIGHT_STAR_MAGNITUDE = 2.2
/** Deep-sky objects a beginner has a realistic chance with. */
const DEEP_SKY_MAGNITUDE = 9.0
/** Below this altitude the atmosphere ruins the view, so nothing is recommended. */
const MIN_USEFUL_ALTITUDE = 15

export interface TonightEntry {
  object: SkyObject
  /** Best moment during the dark window, ISO. */
  bestTime: string
  /** Altitude at that moment, degrees. */
  bestAltitude: number
  /** Azimuth at that moment, degrees. */
  bestAzimuth: number
  riseSet: RiseSetTimes
  magnitude: number | null
  /** One-line reason this made the list. */
  note: string
}

export interface TonightPlan {
  window: DarkWindow
  conditions: SkyConditions
  moonNote: string
  planets: TonightEntry[]
  moon: TonightEntry | null
  stars: TonightEntry[]
  constellations: TonightEntry[]
  deepSky: TonightEntry[]
  events: AstroEvent[]
  /** Set when the location makes a normal night impossible. */
  warning: string | null
}

/**
 * Peak altitude of an object inside the dark window.
 *
 * Altitude is monotonic either side of transit, so the maximum over an interval is
 * either at transit (if it falls inside) or at one of the two endpoints.
 */
export function peakInWindow(
  object: SkyObject,
  window: DarkWindow,
  location: GeoLocation
): { time: Date; altitude: number; azimuth: number } | null {
  if (!window.darkStart || !window.darkEnd) return null
  const start = new Date(window.darkStart)
  const end = new Date(window.darkEnd)
  const observer = makeObserver(location)

  const candidates: Date[] = [start, end]
  try {
    const body = resolveBody(object)
    const transit = Astronomy.SearchHourAngle(body, observer, 0, Astronomy.MakeTime(start))
    if (transit.time.date >= start && transit.time.date <= end) candidates.push(transit.time.date)
  } catch {
    // Objects that never culminate from this latitude simply use the endpoints.
  }

  let best: { time: Date; altitude: number; azimuth: number } | null = null
  for (const when of candidates) {
    const position = getPosition(object, when, location)
    if (!best || position.altitude > best.altitude) {
      best = { time: when, altitude: position.altitude, azimuth: position.azimuth }
    }
  }
  return best
}

function makeEntry(
  object: SkyObject,
  window: DarkWindow,
  location: GeoLocation,
  note: string
): TonightEntry | null {
  const peak = peakInWindow(object, window, location)
  if (!peak) return null
  const { magnitude } = getMagnitude(object, peak.time)
  return {
    object,
    bestTime: peak.time.toISOString(),
    bestAltitude: peak.altitude,
    bestAzimuth: peak.azimuth,
    riseSet: getRiseSetTimes(object, peak.time, location),
    magnitude,
    note
  }
}

function moonPhaseName(phaseAngle: number): string {
  // Ecliptic longitude of the Moon relative to the Sun, 0 = new, 180 = full.
  if (phaseAngle < 22.5 || phaseAngle >= 337.5) return 'New Moon'
  if (phaseAngle < 67.5) return 'Waxing crescent'
  if (phaseAngle < 112.5) return 'First quarter'
  if (phaseAngle < 157.5) return 'Waxing gibbous'
  if (phaseAngle < 202.5) return 'Full Moon'
  if (phaseAngle < 247.5) return 'Waning gibbous'
  if (phaseAngle < 292.5) return 'Last quarter'
  return 'Waning crescent'
}

export function getMoonSummary(date: Date, location: GeoLocation): { name: string; illumination: number; note: string } {
  const time = Astronomy.MakeTime(date)
  const phase = Astronomy.MoonPhase(time)
  const illumination = Astronomy.Illumination(Astronomy.Body.Moon, time).phase_fraction
  const name = moonPhaseName(phase)
  const conditions = getSkyConditions(date, location)

  let note: string
  if (illumination < 0.15) {
    note = `${name}, ${Math.round(illumination * 100)}% lit, which is excellent for faint objects.`
  } else if (illumination < 0.5) {
    note = `${name}, ${Math.round(illumination * 100)}% lit. Deep-sky objects are still workable once the Moon sets.`
  } else if (conditions.moonAltitude > 0) {
    note = `${name}, ${Math.round(illumination * 100)}% lit and above the horizon. Bright moonlight will wash out faint targets, so stick to the Moon, planets and bright stars.`
  } else {
    note = `${name}, ${Math.round(illumination * 100)}% lit, but currently below the horizon.`
  }
  return { name, illumination, note }
}

export interface TonightOptions {
  /** Restrict recommendations to the reduced beginner set. */
  beginnerMode?: boolean
  /** How many entries to return per section. */
  limit?: number
  /** How far ahead to look for upcoming events. */
  eventDays?: number
}

export function buildTonightPlan(
  catalog: Catalog,
  date: Date,
  location: GeoLocation,
  options: TonightOptions = {}
): TonightPlan {
  const limit = options.limit ?? 8
  const window = getDarkWindow(date, location)
  const conditions = getSkyConditions(date, location)
  const moonSummary = getMoonSummary(date, location)

  let warning: string | null = null
  if (window.polarDay) warning = 'The Sun does not set at this location today, so there is no observable night.'
  else if (window.polarNight) warning = 'The Sun does not rise at this location today. It is dark all day, so everything above the horizon is observable.'
  else if (window.neverFullyDark) warning = 'The Sun never drops 18° below the horizon tonight, so the sky stays in astronomical twilight. Faint objects will be difficult.'

  // --- Solar-System bodies -------------------------------------------------
  const planets: TonightEntry[] = []
  let moon: TonightEntry | null = null
  for (const entry of SOLAR_SYSTEM) {
    if (entry.kind === 'sun') continue
    const object = catalog.objects.get(entry.id)
    if (!object) continue
    if (options.beginnerMode && !object.beginner) continue
    const built = makeEntry(object, window, location, '')
    if (!built) continue
    if (entry.kind === 'moon') {
      moon = { ...built, note: moonSummary.note }
      continue
    }
    if (built.bestAltitude < 5) continue
    built.note =
      built.magnitude !== null
        ? `Magnitude ${built.magnitude.toFixed(1)}, reaching ${built.bestAltitude.toFixed(0)}° above the horizon.`
        : `Reaching ${built.bestAltitude.toFixed(0)}° above the horizon.`
    planets.push(built)
  }
  planets.sort((a, b) => (a.magnitude ?? 99) - (b.magnitude ?? 99))

  // --- Bright stars --------------------------------------------------------
  const genitives = new Map(catalog.constellations.map((c) => [c.id, c.genitive ?? c.name]))
  const starCandidates = catalog.stars
    // Proper names only: HYG lists individual components of multiple systems, and
    // "HYG 118360" is no use to someone standing outside looking up.
    .filter((s) => s.m <= BRIGHT_STAR_MAGNITUDE && s.n !== null)
    .map((s) => starToSkyObject(s, s.k ? genitives.get(s.k) : undefined))
  const stars = collect(starCandidates, window, location, limit, MIN_USEFUL_ALTITUDE, (e) => {
    const constellation = e.object.constellation
      ? (catalog.constellationNames.get(e.object.constellation) ?? e.object.constellation)
      : null
    return `Magnitude ${e.object.magnitude?.toFixed(2)}${constellation ? ` in ${constellation}` : ''}, up to ${e.bestAltitude.toFixed(0)}°.`
  })

  // --- Constellations ------------------------------------------------------
  const constellationCandidates = catalog.constellations
    .filter((c) => !options.beginnerMode || constellationToSkyObject(c).beginner)
    .map(constellationToSkyObject)
  const constellations = collect(
    constellationCandidates,
    window,
    location,
    limit,
    25,
    (e) => `Well placed at ${e.bestAltitude.toFixed(0)}° above the horizon.`
  )

  // --- Deep sky ------------------------------------------------------------
  const deepSkyCandidates = catalog.deepSky
    .filter((d) => (options.beginnerMode ? d.m !== null : d.v !== null && d.v <= DEEP_SKY_MAGNITUDE))
    .filter((d) => d.v === null || d.v <= DEEP_SKY_MAGNITUDE)
    .slice(0, 300)
    .map(deepSkyToSkyObject)
  const deepSky = collect(deepSkyCandidates, window, location, limit, 30, (e) => {
    const aid =
      e.object.magnitude === null
        ? ''
        : e.object.magnitude < 5
          ? ' Visible to the unaided eye under dark skies.'
          : e.object.magnitude < 8
            ? ' An easy binocular target.'
            : ' Needs a small telescope.'
    return `${e.object.subtype ?? 'Deep-sky object'}, magnitude ${e.object.magnitude?.toFixed(1) ?? '—'}, up to ${e.bestAltitude.toFixed(0)}°.${aid}`
  })

  // --- Upcoming events -----------------------------------------------------
  const eventDays = options.eventDays ?? 30
  const events = getEvents({
    from: date,
    to: new Date(date.getTime() + eventDays * 86400000),
    location
  }).slice(0, 12)

  return {
    window,
    conditions,
    moonNote: moonSummary.note,
    planets,
    moon,
    stars,
    constellations,
    deepSky,
    events,
    warning
  }
}

function collect(
  candidates: SkyObject[],
  window: DarkWindow,
  location: GeoLocation,
  limit: number,
  minAltitude: number,
  note: (entry: TonightEntry) => string
): TonightEntry[] {
  const entries: TonightEntry[] = []
  for (const object of candidates) {
    const entry = makeEntry(object, window, location, '')
    if (!entry || entry.bestAltitude < minAltitude) continue
    entry.note = note(entry)
    entries.push(entry)
  }
  // Rank on a simple score: every magnitude of brightness is worth about ten degrees
  // of altitude, so a brilliant star low down still beats a dim one overhead, while a
  // target close to the horizon is never recommended over an equally bright one high up.
  const score = (entry: TonightEntry): number =>
    entry.bestAltitude - (entry.magnitude ?? 6) * 10
  entries.sort((a, b) => score(b) - score(a))
  return entries.slice(0, limit)
}
