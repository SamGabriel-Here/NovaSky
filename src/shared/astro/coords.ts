/**
 * Coordinate conversions and formatting.
 *
 * NovaSky uses two frames:
 *
 *  - **EQJ**  equatorial J2000, the frame every catalogue in `resources/data` is in.
 *  - **World** the renderer's frame, a right-handed system centred on the observer:
 *             `+x` = East, `+y` = zenith, `+z` = South. Three.js' default camera looks
 *             down `-z`, so an untouched camera faces due north.
 *
 * astronomy-engine's horizontal frame (HOR) is `x` = north, `y` = west, `z` = zenith,
 * so the World mapping is `(x, y, z) = (-hor.y, hor.z, -hor.x)`.
 */
import * as Astronomy from 'astronomy-engine'
import type { GeoLocation } from '../types'

export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const degToRad = (d: number): number => d * DEG
export const radToDeg = (r: number): number => r * RAD

/** Wrap degrees into 0..360. */
export function normalizeDegrees(deg: number): number {
  const d = deg % 360
  return d < 0 ? d + 360 : d
}

/** Wrap right ascension into 0..24 hours. */
export function normalizeHours(hours: number): number {
  const h = hours % 24
  return h < 0 ? h + 24 : h
}

export function makeObserver(location: GeoLocation): Astronomy.Observer {
  return new Astronomy.Observer(location.latitude, location.longitude, location.elevation)
}

/** Unit vector in the EQJ frame for a J2000 right ascension (hours) and declination (degrees). */
export function eqjUnitVector(raHours: number, decDeg: number): Vec3 {
  const ra = raHours * 15 * DEG
  const dec = decDeg * DEG
  const cosDec = Math.cos(dec)
  return { x: cosDec * Math.cos(ra), y: cosDec * Math.sin(ra), z: Math.sin(dec) }
}

/** Inverse of {@link eqjUnitVector}. */
export function vectorToEquatorial(v: Vec3): { ra: number; dec: number } {
  const r = Math.hypot(v.x, v.y, v.z)
  if (r === 0) return { ra: 0, dec: 0 }
  return {
    ra: normalizeHours((Math.atan2(v.y, v.x) * RAD) / 15),
    dec: Math.asin(v.z / r) * RAD
  }
}

/** Unit vector in the World frame for an altitude/azimuth pair, both in degrees. */
export function horizontalToWorld(altitudeDeg: number, azimuthDeg: number): Vec3 {
  const alt = altitudeDeg * DEG
  const az = azimuthDeg * DEG
  const cosAlt = Math.cos(alt)
  return { x: cosAlt * Math.sin(az), y: Math.sin(alt), z: -cosAlt * Math.cos(az) }
}

/** Inverse of {@link horizontalToWorld}. */
export function worldToHorizontal(v: Vec3): { altitude: number; azimuth: number } {
  const r = Math.hypot(v.x, v.y, v.z)
  if (r === 0) return { altitude: 0, azimuth: 0 }
  return {
    altitude: Math.asin(v.y / r) * RAD,
    azimuth: normalizeDegrees(Math.atan2(v.x, -v.z) * RAD)
  }
}

/**
 * Row-major 3x3 rotation taking EQJ vectors to World vectors for a given moment and
 * observer. Precession, nutation and the observer's position are all handled by
 * astronomy-engine; this only re-labels its axes.
 *
 * The result is fed straight to the Three.js sky group, so the whole 8 900-star scene
 * follows a time or location change with one matrix update.
 */
export function eqjToWorldMatrix(date: Date, location: GeoLocation): number[] {
  const time = Astronomy.MakeTime(date)
  const rot = Astronomy.Rotation_EQJ_HOR(time, makeObserver(location))
  // rot.rot is column-major: rot.rot[i][j] maps source axis i to target axis j.
  const m = (row: number, col: number): number => rot.rot[col][row]
  // HOR axes: 0 = north, 1 = west, 2 = zenith.  World: x = -west, y = zenith, z = -north.
  return [
    -m(1, 0), -m(1, 1), -m(1, 2),
    m(2, 0), m(2, 1), m(2, 2),
    -m(0, 0), -m(0, 1), -m(0, 2)
  ]
}

/** Apply a row-major 3x3 matrix to a vector. */
export function applyMatrix3(m: number[], v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z
  }
}

/**
 * Altitude and azimuth of a fixed J2000 position.
 * `refraction` matches astronomy-engine: 'normal' applies standard atmospheric
 * refraction, which is what a naked-eye observer actually sees.
 */
export function equatorialToHorizontal(
  raHours: number,
  decDeg: number,
  date: Date,
  location: GeoLocation,
  refraction: 'normal' | null = 'normal'
): { altitude: number; azimuth: number } {
  const time = Astronomy.MakeTime(date)
  const observer = makeObserver(location)
  // Precess the catalogue (J2000) position to the equator of date before applying
  // refraction, which is defined in the frame of the observer.
  const rot = Astronomy.Rotation_EQJ_EQD(time)
  const vec = eqjUnitVector(raHours, decDeg)
  const eqd = Astronomy.RotateVector(
    rot,
    new Astronomy.Vector(vec.x, vec.y, vec.z, time)
  )
  const sphere = Astronomy.EquatorFromVector(eqd)
  const hor = Astronomy.Horizon(time, observer, sphere.ra, sphere.dec, refraction ?? undefined)
  return { altitude: hor.altitude, azimuth: hor.azimuth }
}

/** Great-circle separation in degrees between two J2000 positions. */
export function angularSeparation(
  ra1: number,
  dec1: number,
  ra2: number,
  dec2: number
): number {
  const a = eqjUnitVector(ra1, dec1)
  const b = eqjUnitVector(ra2, dec2)
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z))
  return Math.acos(dot) * RAD
}

const CARDINALS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
] as const

/** Nearest 16-point compass label for an azimuth in degrees. */
export function azimuthToCardinal(azimuthDeg: number): string {
  const index = Math.round(normalizeDegrees(azimuthDeg) / 22.5) % 16
  return CARDINALS[index]
}

const pad = (n: number, width = 2): string => String(Math.floor(n)).padStart(width, '0')

/** "05h 34m 32s" */
export function formatRa(raHours: number): string {
  const h = normalizeHours(raHours)
  const hours = Math.floor(h)
  const minutesTotal = (h - hours) * 60
  const minutes = Math.floor(minutesTotal)
  const seconds = Math.round((minutesTotal - minutes) * 60)
  // Rounding can push seconds to 60; carry it.
  const carry = seconds === 60
  return `${pad(hours)}h ${pad(carry ? minutes + 1 : minutes)}m ${pad(carry ? 0 : seconds)}s`
}

/** "+22° 00′ 52″" */
export function formatDec(decDeg: number): string {
  const sign = decDeg < 0 ? '-' : '+'
  const abs = Math.abs(decDeg)
  const degrees = Math.floor(abs)
  const minutesTotal = (abs - degrees) * 60
  const minutes = Math.floor(minutesTotal)
  const seconds = Math.round((minutesTotal - minutes) * 60)
  const carry = seconds === 60
  return `${sign}${pad(degrees)}° ${pad(carry ? minutes + 1 : minutes)}′ ${pad(carry ? 0 : seconds)}″`
}

/** "34.2° above the horizon" style value, one decimal. */
export function formatDegrees(deg: number): string {
  return `${deg >= 0 ? '' : '-'}${Math.abs(deg).toFixed(1)}°`
}

/** "112.4° (ESE)" */
export function formatAzimuth(azimuthDeg: number): string {
  const az = normalizeDegrees(azimuthDeg)
  return `${az.toFixed(1)}° (${azimuthToCardinal(az)})`
}
