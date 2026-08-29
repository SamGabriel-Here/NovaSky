/**
 * Astronomical event calculation.
 *
 * Eclipses, lunar phases, oppositions, elongations and the seasons all come from
 * astronomy-engine searches. Meteor showers are the one exception: their radiants and
 * activity levels are observational data taken from the IMO working list (see
 * METEOR_SHOWERS below), while each year's peak *date* is solved for from the shower's
 * solar longitude, which is how the IMO publishes it.
 */
import * as Astronomy from 'astronomy-engine'
import type { AstroEvent, AstroEventKind, GeoLocation } from '../types'
import { angularSeparation, azimuthToCardinal, makeObserver, normalizeDegrees } from './coords'
import { equatorialToHorizontal } from './coords'

export interface MeteorShower {
  id: string
  name: string
  /** Solar longitude of maximum, degrees, referred to the J2000 equinox (IMO). */
  peakSolarLongitude: number
  /** Zenithal hourly rate at maximum under ideal conditions (IMO working list). */
  zhr: number
  /** Radiant position at maximum, J2000. */
  radiantRa: number
  radiantDec: number
  /** Activity period as (month, day) pairs. */
  activeFrom: [number, number]
  activeTo: [number, number]
  parent: string
  note: string
}

/**
 * Major annual showers from the International Meteor Organization working list.
 * Rates are nominal maxima; real rates vary year to year, and the Moon often matters
 * more than the ZHR does.
 */
export const METEOR_SHOWERS: MeteorShower[] = [
  { id: 'qua', name: 'Quadrantids', peakSolarLongitude: 283.15, zhr: 110, radiantRa: 15.34, radiantDec: 49.5, activeFrom: [12, 28], activeTo: [1, 12], parent: 'Asteroid 2003 EH1', note: 'A very sharp peak only a few hours wide, so timing matters more than for any other shower.' },
  { id: 'lyr', name: 'Lyrids', peakSolarLongitude: 32.32, zhr: 18, radiantRa: 18.07, radiantDec: 34, activeFrom: [4, 14], activeTo: [4, 30], parent: 'Comet C/1861 G1 Thatcher', note: 'A modest but reliable shower, occasionally producing brief outbursts.' },
  { id: 'eta', name: 'Eta Aquariids', peakSolarLongitude: 45.5, zhr: 50, radiantRa: 22.53, radiantDec: -1, activeFrom: [4, 19], activeTo: [5, 28], parent: 'Comet 1P/Halley', note: 'Debris from Halley’s Comet. Strongly favours the southern hemisphere; northern observers see a short pre-dawn window.' },
  { id: 'cap', name: 'Alpha Capricornids', peakSolarLongitude: 127, zhr: 5, radiantRa: 20.47, radiantDec: -10, activeFrom: [7, 3], activeTo: [8, 15], parent: 'Comet 169P/NEAT', note: 'Low rates, but known for slow, bright fireballs.' },
  { id: 'sda', name: 'Southern Delta Aquariids', peakSolarLongitude: 125, zhr: 25, radiantRa: 22.67, radiantDec: -16, activeFrom: [7, 12], activeTo: [8, 23], parent: 'Comet 96P/Machholz', note: 'A broad maximum favouring southern and low northern latitudes.' },
  { id: 'per', name: 'Perseids', peakSolarLongitude: 140, zhr: 100, radiantRa: 3.2, radiantDec: 58, activeFrom: [7, 17], activeTo: [8, 24], parent: 'Comet 109P/Swift-Tuttle', note: 'The most-watched shower of the northern year, helped by warm August nights.' },
  { id: 'dra', name: 'Draconids', peakSolarLongitude: 195.4, zhr: 10, radiantRa: 17.47, radiantDec: 54, activeFrom: [10, 6], activeTo: [10, 10], parent: 'Comet 21P/Giacobini-Zinner', note: 'Highly variable — usually quiet, but has produced storms of thousands per hour. Best in the evening rather than after midnight.' },
  { id: 'ori', name: 'Orionids', peakSolarLongitude: 208, zhr: 20, radiantRa: 6.33, radiantDec: 16, activeFrom: [10, 2], activeTo: [11, 7], parent: 'Comet 1P/Halley', note: 'The second shower fed by Halley’s Comet, with fast meteors and a broad plateau of activity.' },
  { id: 'sta', name: 'Southern Taurids', peakSolarLongitude: 223, zhr: 5, radiantRa: 3.47, radiantDec: 15, activeFrom: [9, 10], activeTo: [11, 20], parent: 'Comet 2P/Encke', note: 'Low rates over many weeks, but a well-known source of autumn fireballs.' },
  { id: 'nta', name: 'Northern Taurids', peakSolarLongitude: 230, zhr: 5, radiantRa: 3.87, radiantDec: 22, activeFrom: [10, 20], activeTo: [12, 10], parent: 'Comet 2P/Encke', note: 'The northern branch of the Taurid stream, overlapping the southern one.' },
  { id: 'leo', name: 'Leonids', peakSolarLongitude: 235.27, zhr: 15, radiantRa: 10.13, radiantDec: 22, activeFrom: [11, 6], activeTo: [11, 30], parent: 'Comet 55P/Tempel-Tuttle', note: 'Modest most years, but responsible for some of the greatest meteor storms on record, roughly every 33 years.' },
  { id: 'gem', name: 'Geminids', peakSolarLongitude: 262.2, zhr: 150, radiantRa: 7.47, radiantDec: 33, activeFrom: [12, 4], activeTo: [12, 20], parent: 'Asteroid 3200 Phaethon', note: 'The richest annual shower, and unusual in coming from an asteroid rather than a comet.' },
  { id: 'urs', name: 'Ursids', peakSolarLongitude: 270.7, zhr: 10, radiantRa: 14.47, radiantDec: 76, activeFrom: [12, 17], activeTo: [12, 26], parent: 'Comet 8P/Tuttle', note: 'A quiet shower close to the solstice, with a circumpolar radiant for northern observers.' }
]

/**
 * The IMO quotes solar longitudes referred to J2000, while astronomy-engine searches
 * the apparent longitude of date. General precession in longitude is 50.2879 arcsec
 * per year, which is about 0.36 degrees — roughly nine hours of shower timing — a
 * quarter century after J2000, so it is worth correcting.
 */
function solarLongitudeOfDate(j2000Longitude: number, year: number): number {
  return normalizeDegrees(j2000Longitude + (50.2879 * (year - 2000)) / 3600)
}

/**
 * Time at which the Sun reaches a given apparent ecliptic longitude during `year`.
 *
 * astronomy-engine's SearchSunLongitude bisects for a sign change in the longitude
 * difference, which wraps every 365 days — so handing it a year-long window makes it
 * fail for roughly a third of all target longitudes. Anchoring on the March equinox
 * (where the apparent longitude is zero by definition) and searching a short window
 * around the estimate is both reliable and faster.
 */
function sunReachesLongitude(targetLongitude: number, year: number): Astronomy.AstroTime | null {
  const equinox = Astronomy.Seasons(year).mar_equinox
  /** Mean apparent motion of the Sun along the ecliptic, degrees per day. */
  const DEGREES_PER_DAY = 0.98565
  const estimate = equinox.AddDays(targetLongitude / DEGREES_PER_DAY)
  // The true motion varies by about 3 per cent over the year, so a plus or minus
  // ten-day window comfortably brackets the crossing while containing only one.
  return Astronomy.SearchSunLongitude(targetLongitude, estimate.AddDays(-10), 20)
}

function eventId(kind: AstroEventKind, key: string, time: Date): string {
  return `${kind}:${key}:${time.toISOString().slice(0, 10)}`
}

const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'] as const
const SUPERIOR = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const
const INFERIOR = ['Mercury', 'Venus'] as const

const bodyOf = (name: string): Astronomy.Body =>
  (Astronomy.Body as unknown as Record<string, Astronomy.Body>)[name]

// ------------------------------------------------------------ meteor showers

export function getMeteorShowers(from: Date, to: Date, location: GeoLocation): AstroEvent[] {
  const events: AstroEvent[] = []
  const firstYear = from.getUTCFullYear()
  const lastYear = to.getUTCFullYear()

  for (let year = firstYear - 1; year <= lastYear + 1; year++) {
    for (const shower of METEOR_SHOWERS) {
      const target = solarLongitudeOfDate(shower.peakSolarLongitude, year)
      const peak = sunReachesLongitude(target, year)
      if (!peak) continue
      const time = peak.date
      if (time < from || time > to) continue

      // Radiant altitude at the moment of maximum decides whether the shower is
      // worth anything from this location.
      const { altitude, azimuth } = equatorialToHorizontal(
        shower.radiantRa,
        shower.radiantDec,
        time,
        location
      )
      const moon = Astronomy.Illumination(Astronomy.Body.Moon, Astronomy.MakeTime(time))
      const moonNote =
        moon.phase_fraction > 0.6
          ? ` The Moon is ${Math.round(moon.phase_fraction * 100)}% lit at the peak and will wash out fainter meteors.`
          : ''

      events.push({
        id: eventId('meteor-shower', shower.id, time),
        kind: 'meteor-shower',
        title: `${shower.name} peak`,
        time: time.toISOString(),
        startTime: monthDayToIso(shower.activeFrom, year, time),
        endTime: monthDayToIso(shower.activeTo, year, time, true),
        description: `Up to about ${shower.zhr} meteors an hour under ideal dark skies, from debris left by ${shower.parent}. ${shower.note}${moonNote}`,
        objectIds: [],
        localVisibility:
          altitude > 0
            ? `Radiant is ${altitude.toFixed(0)}° up in the ${azimuthToCardinal(azimuth)} at peak time from ${location.label}.`
            : `Radiant is below the horizon at the exact peak from ${location.label}; watch in the hours before dawn instead.`,
        origin: 'calculated'
      })
    }
  }
  return events
}

/** Resolves an activity-window (month, day) to an ISO date near the given peak. */
function monthDayToIso(
  [month, day]: [number, number],
  year: number,
  peak: Date,
  isEnd = false
): string {
  let y = year
  const peakMonth = peak.getUTCMonth() + 1
  // Windows that straddle new year (e.g. Quadrantids, Dec 28 - Jan 12).
  if (!isEnd && month > peakMonth + 6) y -= 1
  if (isEnd && month + 6 < peakMonth) y += 1
  return new Date(Date.UTC(y, month - 1, day)).toISOString()
}

// ---------------------------------------------------------------- eclipses

export function getEclipses(from: Date, to: Date, location: GeoLocation): AstroEvent[] {
  const events: AstroEvent[] = []
  const observer = makeObserver(location)

  let lunar = Astronomy.SearchLunarEclipse(Astronomy.MakeTime(from))
  for (let guard = 0; guard < 60 && lunar.peak.date <= to; guard++) {
    const time = lunar.peak.date
    if (time >= from) {
      const { altitude } = equatorialToHorizontalMoon(time, location)
      events.push({
        id: eventId('lunar-eclipse', lunar.kind, time),
        kind: 'lunar-eclipse',
        title: `${capitalise(lunar.kind)} lunar eclipse`,
        time: time.toISOString(),
        startTime: new Date(time.getTime() - lunar.sd_partial * 60000).toISOString(),
        endTime: new Date(time.getTime() + lunar.sd_partial * 60000).toISOString(),
        description: describeLunarEclipse(lunar),
        objectIds: ['moon'],
        localVisibility:
          altitude > 0
            ? `The Moon is ${altitude.toFixed(0)}° above the horizon at maximum from ${location.label}, so the eclipse is visible.`
            : `The Moon is below the horizon at maximum from ${location.label}; the eclipse is not visible from here.`,
        origin: 'calculated'
      })
    }
    lunar = Astronomy.NextLunarEclipse(lunar.peak)
  }

  // Solar eclipses are enumerated globally so that a major eclipse still shows up in
  // the timeline even when it misses this location, then annotated with the local
  // circumstances when there are any.
  let solar = Astronomy.SearchGlobalSolarEclipse(Astronomy.MakeTime(from))
  for (let guard = 0; guard < 40 && solar.peak.date <= to; guard++) {
    const time = solar.peak.date
    if (time >= from) {
      const local = findLocalCircumstances(time, observer)
      const localNote = local
        ? `Seen from ${location.label} this is a ${local.kind} eclipse, with up to ${(local.obscuration * 100).toFixed(0)}% of the Sun covered, and the Sun ${local.peak.altitude.toFixed(0)}° above the horizon at maximum.`
        : `Not visible from ${location.label}.${
            solar.latitude !== undefined && solar.longitude !== undefined
              ? ` Greatest eclipse falls near ${formatLatLon(solar.latitude, solar.longitude)}.`
              : ''
          }`
      events.push({
        id: eventId('solar-eclipse', solar.kind, time),
        kind: 'solar-eclipse',
        title: `${capitalise(solar.kind)} solar eclipse`,
        time: time.toISOString(),
        startTime: local?.partial_begin?.time.date.toISOString(),
        endTime: local?.partial_end?.time.date.toISOString(),
        description: `${capitalise(article(solar.kind))} ${solar.kind} solar eclipse. Never look at a partially eclipsed Sun without a certified solar filter — only totality itself is safe to view with the unaided eye, and only while it lasts.`,
        objectIds: ['sun', 'moon'],
        localVisibility: localNote,
        origin: 'calculated'
      })
    }
    solar = Astronomy.NextGlobalSolarEclipse(solar.peak)
  }

  return events
}

/**
 * Local circumstances for the eclipse peaking at `time`, or null if none are visible
 * from this observer. astronomy-engine only searches forward for locally visible
 * eclipses, so a result more than a day away means this one misses us.
 */
function findLocalCircumstances(
  time: Date,
  observer: Astronomy.Observer
): Astronomy.LocalSolarEclipseInfo | null {
  const search = Astronomy.MakeTime(new Date(time.getTime() - 36 * 3600 * 1000))
  const local = Astronomy.SearchLocalSolarEclipse(search, observer)
  const deltaHours = Math.abs(local.peak.time.date.getTime() - time.getTime()) / 3600000
  return deltaHours < 24 ? local : null
}

/** "12.3\u00b0S 45.6\u00b0W" for the point of greatest eclipse. */
function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(1)}\u00b0${ns} ${Math.abs(lon).toFixed(1)}\u00b0${ew}`
}

function equatorialToHorizontalMoon(date: Date, location: GeoLocation): { altitude: number } {
  const time = Astronomy.MakeTime(date)
  const observer = makeObserver(location)
  const eq = Astronomy.Equator(Astronomy.Body.Moon, time, observer, true, true)
  return { altitude: Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal').altitude }
}

function describeLunarEclipse(eclipse: Astronomy.LunarEclipseInfo): string {
  switch (eclipse.kind) {
    case 'total':
      return 'The Moon passes entirely into Earth’s shadow and usually turns a deep coppery red, lit only by sunlight bent through Earth’s atmosphere. Safe to watch with the unaided eye.'
    case 'partial':
      return 'Part of the Moon passes through Earth’s dark umbral shadow, taking a visible bite out of the disc. Safe to watch with the unaided eye.'
    default:
      return 'The Moon passes through Earth’s faint outer shadow. The dimming is subtle and easy to miss without comparing photographs.'
  }
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** "a partial" / "an annular" — the eclipse kinds include vowel-initial words. */
const article = (word: string): string => ('aeiou'.includes(word[0]?.toLowerCase()) ? 'an' : 'a')

// ------------------------------------------------- oppositions + elongations

export function getPlanetaryEvents(from: Date, to: Date): AstroEvent[] {
  const events: AstroEvent[] = []

  for (const planet of SUPERIOR) {
    let time = Astronomy.SearchRelativeLongitude(bodyOf(planet), 180, Astronomy.MakeTime(from))
    for (let guard = 0; guard < 40 && time.date <= to; guard++) {
      if (time.date >= from) {
        const illum = Astronomy.Illumination(bodyOf(planet), time)
        events.push({
          id: eventId('opposition', planet, time.date),
          kind: 'opposition',
          title: `${planet} at opposition`,
          time: time.date.toISOString(),
          description: `${planet} lies opposite the Sun in our sky, so it rises at sunset, is highest around midnight and sets at sunrise. This is also its closest approach for the year, at magnitude ${illum.mag.toFixed(1)} and ${illum.geo_dist.toFixed(2)} AU from Earth — the best time of year to observe it.`,
          objectIds: [planet.toLowerCase()],
          localVisibility: 'Visible all night from anywhere the planet rises.',
          origin: 'calculated'
        })
      }
      time = Astronomy.SearchRelativeLongitude(
        bodyOf(planet),
        180,
        new Astronomy.AstroTime(new Date(time.date.getTime() + 30 * 86400000))
      )
    }
  }

  for (const planet of INFERIOR) {
    let elong = Astronomy.SearchMaxElongation(bodyOf(planet), Astronomy.MakeTime(from))
    for (let guard = 0; guard < 40 && elong.time.date <= to; guard++) {
      if (elong.time.date >= from) {
        const evening = elong.visibility === 'evening'
        events.push({
          id: eventId('elongation', `${planet}`, elong.time.date),
          kind: 'elongation',
          title: `${planet} at greatest ${elong.visibility} elongation`,
          time: elong.time.date.toISOString(),
          description: `${planet} reaches its greatest apparent separation from the Sun, ${elong.elongation.toFixed(0)}°, putting it as far from the glare as it gets this cycle. Look ${evening ? 'west shortly after sunset' : 'east shortly before sunrise'}.`,
          objectIds: [planet.toLowerCase()],
          localVisibility: null,
          origin: 'calculated'
        })
      }
      elong = Astronomy.SearchMaxElongation(
        bodyOf(planet),
        new Astronomy.AstroTime(new Date(elong.time.date.getTime() + 20 * 86400000))
      )
    }
  }

  return events
}

/**
 * Close approaches between pairs of naked-eye planets (and the Moon).
 *
 * Scans daily separations, then refines each local minimum by ternary search. Only
 * approaches closer than `maxSeparation` and outside the Sun's glare are reported.
 */
export function getConjunctions(
  from: Date,
  to: Date,
  maxSeparation = 3
): AstroEvent[] {
  const events: AstroEvent[] = []
  const bodies = [...PLANETS, 'Moon'] as const
  const dayMs = 86400000

  const separationAt = (a: string, b: string, t: number): number => {
    const time = Astronomy.MakeTime(new Date(t))
    const eqA = Astronomy.Equator(bodyOf(a), time, DUMMY_OBSERVER, true, true)
    const eqB = Astronomy.Equator(bodyOf(b), time, DUMMY_OBSERVER, true, true)
    return angularSeparation(eqA.ra, eqA.dec, eqB.ra, eqB.dec)
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]
      const b = bodies[j]
      let prev = separationAt(a, b, from.getTime() - dayMs)
      let current = separationAt(a, b, from.getTime())

      for (let t = from.getTime() + dayMs; t <= to.getTime(); t += dayMs) {
        const next = separationAt(a, b, t)
        if (current < prev && current < next && current < maxSeparation * 2) {
          // Refine the minimum to the nearest few minutes.
          let lo = t - 2 * dayMs
          let hi = t
          for (let k = 0; k < 40; k++) {
            const m1 = lo + (hi - lo) / 3
            const m2 = hi - (hi - lo) / 3
            if (separationAt(a, b, m1) < separationAt(a, b, m2)) hi = m2
            else lo = m1
          }
          const peak = new Date((lo + hi) / 2)
          const sep = separationAt(a, b, peak.getTime())
          if (sep <= maxSeparation && peak >= from && peak <= to) {
            const elongation = Astronomy.AngleFromSun(bodyOf(a), Astronomy.MakeTime(peak))
            if (elongation > 15) {
              events.push({
                id: eventId('conjunction', `${a}-${b}`, peak),
                kind: 'conjunction',
                title: `${a} and ${b} in conjunction`,
                time: peak.toISOString(),
                description: `${a} and ${b} pass within ${sep.toFixed(1)}° of each other — close enough to frame together in binoculars. They are ${elongation.toFixed(0)}° from the Sun at closest approach.`,
                objectIds: [a.toLowerCase(), b.toLowerCase()],
                localVisibility: null,
                origin: 'calculated'
              })
            }
          }
        }
        prev = current
        current = next
      }
    }
  }
  return events
}

/** Geocentric positions do not depend on the observer, but Equator() wants one. */
const DUMMY_OBSERVER = new Astronomy.Observer(0, 0, 0)

// --------------------------------------------------- moon phases + seasons

const QUARTER_NAMES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'] as const
const QUARTER_NOTES = [
  'The Moon is between Earth and the Sun and is not visible. These are the darkest nights of the month and the best for deep-sky observing.',
  'Half the disc is lit. The terminator — the line between light and dark — is where craters throw their longest shadows, making this the best phase for lunar detail.',
  'The whole disc is lit and the Moon is up all night. Bright, but the flattest lighting of the month, and it washes out fainter objects across the sky.',
  'Half lit again, rising after midnight. Good for early-morning lunar observing and for evening deep-sky work.'
] as const

export function getMoonPhases(from: Date, to: Date): AstroEvent[] {
  const events: AstroEvent[] = []
  let quarter = Astronomy.SearchMoonQuarter(Astronomy.MakeTime(from))
  for (let guard = 0; guard < 200 && quarter.time.date <= to; guard++) {
    if (quarter.time.date >= from) {
      events.push({
        id: eventId('moon-phase', String(quarter.quarter), quarter.time.date),
        kind: 'moon-phase',
        title: QUARTER_NAMES[quarter.quarter],
        time: quarter.time.date.toISOString(),
        description: QUARTER_NOTES[quarter.quarter],
        objectIds: ['moon'],
        localVisibility: null,
        origin: 'calculated'
      })
    }
    quarter = Astronomy.NextMoonQuarter(quarter)
  }
  return events
}

export function getSeasons(from: Date, to: Date): AstroEvent[] {
  const events: AstroEvent[] = []
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year++) {
    const seasons = Astronomy.Seasons(year)
    const entries: [Astronomy.AstroTime, AstroEventKind, string, string][] = [
      [seasons.mar_equinox, 'equinox', 'March equinox', 'The Sun crosses the celestial equator heading north. Day and night are close to equal everywhere, and the Sun rises due east and sets due west.'],
      [seasons.jun_solstice, 'solstice', 'June solstice', 'The Sun reaches its northernmost point. Longest day in the northern hemisphere, shortest in the southern — and the shortest observing nights for northern stargazers.'],
      [seasons.sep_equinox, 'equinox', 'September equinox', 'The Sun crosses back over the celestial equator heading south, again giving nearly equal day and night.'],
      [seasons.dec_solstice, 'solstice', 'December solstice', 'The Sun reaches its southernmost point. Longest nights in the northern hemisphere — the best stretch of the year for northern observing.']
    ]
    for (const [time, kind, title, description] of entries) {
      if (time.date < from || time.date > to) continue
      events.push({
        id: eventId(kind, title, time.date),
        kind,
        title,
        time: time.date.toISOString(),
        description,
        objectIds: ['sun'],
        localVisibility: null,
        origin: 'calculated'
      })
    }
  }
  return events
}

// -------------------------------------------------------------- aggregate

export interface EventQuery {
  from: Date
  to: Date
  location: GeoLocation
  kinds?: AstroEventKind[]
}

/** All events in a window, sorted by time. */
export function getEvents(query: EventQuery): AstroEvent[] {
  const { from, to, location } = query
  const wanted = query.kinds ? new Set(query.kinds) : null
  const include = (kind: AstroEventKind): boolean => !wanted || wanted.has(kind)

  const events: AstroEvent[] = []
  if (include('meteor-shower')) events.push(...getMeteorShowers(from, to, location))
  if (include('lunar-eclipse') || include('solar-eclipse')) {
    events.push(...getEclipses(from, to, location).filter((e) => include(e.kind)))
  }
  if (include('opposition') || include('elongation')) {
    events.push(...getPlanetaryEvents(from, to).filter((e) => include(e.kind)))
  }
  if (include('conjunction')) events.push(...getConjunctions(from, to))
  if (include('moon-phase')) events.push(...getMoonPhases(from, to))
  if (include('solstice') || include('equinox')) {
    events.push(...getSeasons(from, to).filter((e) => include(e.kind)))
  }

  return events.sort((a, b) => a.time.localeCompare(b.time))
}
