/**
 * Satellite tracking via SGP4.
 *
 * TLE (two-line element) sets come from CelesTrak and are propagated with satellite.js.
 * TLEs decay in accuracy quickly — a set more than a few days old is worth a warning,
 * and beyond a couple of weeks the positions are not trustworthy at all. Every result
 * carries a {@link DataOrigin} so the UI can say whether it is live or cached.
 */
import * as Astronomy from 'astronomy-engine'
import {
  degreesLat,
  degreesLong,
  eciToEcf,
  eciToGeodetic,
  ecfToLookAngles,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec
} from 'satellite.js'
import type { DataOrigin, GeoLocation, SatellitePass, TleBundle, TleRecord } from '../types'
import { makeObserver } from './coords'

/** Mean equatorial radius of Earth in kilometres (IAU). */
const EARTH_RADIUS_KM = 6378.137
/** Minimum peak altitude for a pass to be worth reporting. */
const MIN_PASS_ALTITUDE = 10
/** A satellite lower than this is lost in haze and buildings. */
const HORIZON_MASK = 0
/** The sky must be at least this dark for a sunlit satellite to stand out. */
const OBSERVER_DARKNESS = -6

/** TLE age at which the UI should start warning the user. */
export const TLE_STALE_HOURS = 48
/** TLE age beyond which SGP4 output should not be presented as reliable. */
export const TLE_UNUSABLE_HOURS = 14 * 24

/** Splits a CelesTrak three-line TLE file into records. */
export function parseTle(text: string): TleRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)

  const records: TleRecord[] = []
  for (let i = 0; i + 2 < lines.length + 1; i++) {
    const name = lines[i]
    const line1 = lines[i + 1]
    const line2 = lines[i + 2]
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue
    const noradId = Number(line1.slice(2, 7).trim())
    if (!Number.isFinite(noradId)) continue
    records.push({ name: name.trim(), noradId, line1, line2 })
    i += 2
  }
  return records
}

/** How old a TLE bundle is, in hours. */
export function tleAgeHours(bundle: TleBundle, now: Date = new Date()): number {
  return (now.getTime() - new Date(bundle.fetchedAt).getTime()) / 3600000
}

export function tleWarning(bundle: TleBundle, now: Date = new Date()): string | null {
  const age = tleAgeHours(bundle, now)
  if (age > TLE_UNUSABLE_HOURS) {
    return `Satellite elements are ${Math.round(age / 24)} days old. Positions shown are unreliable — reconnect to refresh them.`
  }
  if (age > TLE_STALE_HOURS) {
    return `Satellite elements are ${Math.round(age)} hours old and drifting. Positions may be off by several degrees.`
  }
  return null
}

export interface SatelliteState {
  noradId: number
  name: string
  altitude: number
  azimuth: number
  /** Slant range from the observer, kilometres. */
  rangeKm: number
  /** Height above Earth's surface, kilometres. */
  heightKm: number
  /** Ground track position. */
  latitude: number
  longitude: number
  /** In sunlight and therefore potentially visible. */
  sunlit: boolean
  origin: DataOrigin
}

/** Unit vector from Earth's centre toward the Sun, in the ECI frame of date. */
function sunDirectionEci(date: Date): { x: number; y: number; z: number } {
  const time = Astronomy.MakeTime(date)
  // satellite.js works in TEME, which differs from the true equator of date by well
  // under a degree — irrelevant for deciding whether a satellite is in shadow.
  const eqj = Astronomy.GeoVector(Astronomy.Body.Sun, time, false)
  const eqd = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), eqj)
  const length = Math.hypot(eqd.x, eqd.y, eqd.z)
  return { x: eqd.x / length, y: eqd.y / length, z: eqd.z / length }
}

/**
 * Cylindrical shadow test: a satellite is sunlit unless it lies behind Earth *and*
 * within Earth's radius of the anti-solar axis.
 */
export function isSunlit(positionEci: { x: number; y: number; z: number }, date: Date): boolean {
  const sun = sunDirectionEci(date)
  const dot = positionEci.x * sun.x + positionEci.y * sun.y + positionEci.z * sun.z
  if (dot > 0) return true // day side of Earth
  const perpendicular = Math.hypot(
    positionEci.x - dot * sun.x,
    positionEci.y - dot * sun.y,
    positionEci.z - dot * sun.z
  )
  return perpendicular > EARTH_RADIUS_KM
}

const toDegrees = (radians: number): number => (radians * 180) / Math.PI

/** Current look angles for one satellite, or null when SGP4 fails to converge. */
export function getSatelliteState(
  record: TleRecord,
  date: Date,
  location: GeoLocation,
  origin: DataOrigin
): SatelliteState | null {
  let satrec: SatRec
  try {
    satrec = twoline2satrec(record.line1, record.line2)
  } catch {
    return null
  }
  return stateFromSatrec(satrec, record, date, location, origin)
}

function stateFromSatrec(
  satrec: SatRec,
  record: TleRecord,
  date: Date,
  location: GeoLocation,
  origin: DataOrigin
): SatelliteState | null {
  // twoline2satrec does not throw on malformed input: it returns a satrec with an
  // error code, and propagation then yields NaN. Reject both, so a corrupt element set
  // is reported as "no data" rather than drawn at an undefined position.
  if (satrec.error) return null
  const propagated = propagate(satrec, date)
  const eci = propagated?.position
  if (!eci || typeof eci === 'boolean') return null
  if (!Number.isFinite(eci.x) || !Number.isFinite(eci.y) || !Number.isFinite(eci.z)) return null

  const gmst = gstime(date)
  const ecf = eciToEcf(eci, gmst)
  const observerGd = {
    longitude: (location.longitude * Math.PI) / 180,
    latitude: (location.latitude * Math.PI) / 180,
    height: location.elevation / 1000
  }
  const look = ecfToLookAngles(observerGd, ecf)
  const geodetic = eciToGeodetic(eci, gmst)

  return {
    noradId: record.noradId,
    name: record.name,
    altitude: toDegrees(look.elevation),
    azimuth: (toDegrees(look.azimuth) + 360) % 360,
    rangeKm: look.rangeSat,
    heightKm: geodetic.height,
    latitude: degreesLat(geodetic.latitude),
    longitude: degreesLong(geodetic.longitude),
    sunlit: isSunlit(eci, date),
    origin
  }
}

export interface PassSearchOptions {
  /** How far ahead to search, hours. */
  hours?: number
  /** Sampling interval, seconds. Thirty seconds finds every pass without missing short ones. */
  stepSeconds?: number
  /** Only return passes that are actually seeable: sunlit satellite, dark observer. */
  visibleOnly?: boolean
  minAltitude?: number
}

/**
 * Predicts passes by stepping through time and watching for the satellite to cross the
 * horizon. Rise and set are refined by bisection so the reported times are good to a
 * few seconds.
 */
export function predictPasses(
  record: TleRecord,
  from: Date,
  location: GeoLocation,
  origin: DataOrigin,
  options: PassSearchOptions = {}
): SatellitePass[] {
  const hours = options.hours ?? 24
  const stepMs = (options.stepSeconds ?? 30) * 1000
  const minAltitude = options.minAltitude ?? MIN_PASS_ALTITUDE

  let satrec: SatRec
  try {
    satrec = twoline2satrec(record.line1, record.line2)
  } catch {
    return []
  }

  const observer = makeObserver(location)
  const end = from.getTime() + hours * 3600000
  const passes: SatellitePass[] = []

  const altitudeAt = (t: number): number | null =>
    stateFromSatrec(satrec, record, new Date(t), location, origin)?.altitude ?? null

  let current: {
    startTime: number
    peak: { time: number; altitude: number; azimuth: number }
    riseAzimuth: number
    anySunlit: boolean
    anyDark: boolean
  } | null = null

  for (let t = from.getTime(); t <= end; t += stepMs) {
    const state = stateFromSatrec(satrec, record, new Date(t), location, origin)
    if (!state) continue

    if (state.altitude > HORIZON_MASK) {
      const sunAltitude = observerSunAltitude(new Date(t), observer)
      if (!current) {
        current = {
          startTime: refineCrossing(altitudeAt, t - stepMs, t),
          peak: { time: t, altitude: state.altitude, azimuth: state.azimuth },
          riseAzimuth: state.azimuth,
          anySunlit: state.sunlit,
          anyDark: sunAltitude < OBSERVER_DARKNESS
        }
      } else {
        if (state.altitude > current.peak.altitude) {
          current.peak = { time: t, altitude: state.altitude, azimuth: state.azimuth }
        }
        current.anySunlit ||= state.sunlit
        current.anyDark ||= sunAltitude < OBSERVER_DARKNESS
      }
    } else if (current) {
      const setTime = refineCrossing(altitudeAt, t - stepMs, t)
      const visible = current.anySunlit && current.anyDark
      if (current.peak.altitude >= minAltitude && (!options.visibleOnly || visible)) {
        passes.push({
          satelliteId: record.noradId,
          name: record.name,
          rise: new Date(current.startTime).toISOString(),
          culminate: new Date(current.peak.time).toISOString(),
          set: new Date(setTime).toISOString(),
          maxAltitude: current.peak.altitude,
          riseAzimuth: current.riseAzimuth,
          setAzimuth: stateFromSatrec(satrec, record, new Date(setTime), location, origin)?.azimuth ?? 0,
          visible,
          origin
        })
      }
      current = null
    }
  }
  return passes
}

/** Bisects between a below-horizon and an above-horizon sample to find the crossing. */
function refineCrossing(
  altitudeAt: (t: number) => number | null,
  below: number,
  above: number
): number {
  let lo = below
  let hi = above
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const altitude = altitudeAt(mid)
    if (altitude === null) break
    if (altitude > HORIZON_MASK) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

function observerSunAltitude(date: Date, observer: Astronomy.Observer): number {
  const time = Astronomy.MakeTime(date)
  const eq = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true)
  return Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal').altitude
}

/** Satellites NovaSky highlights by default. */
export const FEATURED_SATELLITES = [
  { noradId: 25544, name: 'ISS (ZARYA)', note: 'The International Space Station — by far the brightest satellite, and easily mistaken for an aircraft without flashing lights.' },
  { noradId: 48274, name: 'CSS (TIANHE)', note: 'The core module of the Chinese space station, the second-brightest crewed object in orbit.' },
  { noradId: 20580, name: 'HST', note: 'The Hubble Space Telescope. Visible from low latitudes as a modest moving star.' }
]

/** Convenience: the featured satellites present in a TLE bundle. */
export function featuredRecords(bundle: TleBundle): TleRecord[] {
  const wanted = new Set(FEATURED_SATELLITES.map((s) => s.noradId))
  return bundle.records.filter((r) => wanted.has(r.noradId))
}
