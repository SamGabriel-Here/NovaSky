import { describe, expect, it } from 'vitest'
import {
  isSunlit,
  parseTle,
  predictPasses,
  getSatelliteState,
  tleAgeHours,
  tleWarning
} from '@shared/astro/satellites'
import * as Astronomy from 'astronomy-engine'
import type { TleBundle, TleRecord } from '@shared/types'
import { GREENWICH, INDORE } from '../fixtures'

/**
 * A real ISS element set. Fixed here so the test is deterministic and works offline;
 * the epoch is what matters, not how current it is.
 */
const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00016717  00000+0  30777-3 0  9993
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49814556432198`

const ISS: TleRecord = {
  name: 'ISS (ZARYA)',
  noradId: 25544,
  line1: ISS_TLE.split('\n')[1],
  line2: ISS_TLE.split('\n')[2]
}

/** A moment close to the element-set epoch, where SGP4 is at its most accurate. */
const NEAR_EPOCH = new Date('2024-01-01T13:00:00Z')

describe('parseTle', () => {
  it('parses a three-line element set', () => {
    const records = parseTle(ISS_TLE)
    expect(records).toHaveLength(1)
    expect(records[0].name).toBe('ISS (ZARYA)')
    expect(records[0].noradId).toBe(25544)
  })

  it('parses several records and ignores blank lines', () => {
    const text = `${ISS_TLE}\n\nHST\n1 20580U 90037B   24001.50000000  .00001183  00000+0  63000-4 0  9995\n2 20580  28.4696 288.8102 0002481 154.1949 316.9425 15.09982442640651\n`
    const records = parseTle(text)
    expect(records).toHaveLength(2)
    expect(records.map((r) => r.noradId)).toEqual([25544, 20580])
  })

  it('returns nothing for input that is not a TLE', () => {
    expect(parseTle('not a tle at all')).toHaveLength(0)
    expect(parseTle('')).toHaveLength(0)
  })
})

describe('getSatelliteState', () => {
  it('places the ISS in low Earth orbit', () => {
    const state = getSatelliteState(ISS, NEAR_EPOCH, GREENWICH, 'cached')
    expect(state).not.toBeNull()
    // The station orbits between roughly 370 and 460 km.
    expect(state?.heightKm).toBeGreaterThan(350)
    expect(state?.heightKm).toBeLessThan(470)
  })

  it('keeps the ground track within the orbital inclination', () => {
    // The ISS is inclined 51.6 degrees, so it never passes over the poles.
    for (let minutes = 0; minutes < 95; minutes += 5) {
      const when = new Date(NEAR_EPOCH.getTime() + minutes * 60000)
      const state = getSatelliteState(ISS, when, GREENWICH, 'cached')
      expect(Math.abs(state?.latitude ?? 0)).toBeLessThanOrEqual(52.5)
    }
  })

  it('reports look angles in the expected ranges', () => {
    const state = getSatelliteState(ISS, NEAR_EPOCH, INDORE, 'cached')
    expect(state?.azimuth).toBeGreaterThanOrEqual(0)
    expect(state?.azimuth).toBeLessThan(360)
    expect(state?.altitude).toBeGreaterThanOrEqual(-90)
    expect(state?.altitude).toBeLessThanOrEqual(90)
    expect(state?.rangeKm).toBeGreaterThan(300)
  })

  it('carries the origin through so the UI can label live versus cached data', () => {
    expect(getSatelliteState(ISS, NEAR_EPOCH, GREENWICH, 'live')?.origin).toBe('live')
    expect(getSatelliteState(ISS, NEAR_EPOCH, GREENWICH, 'cached')?.origin).toBe('cached')
  })

  it('returns null rather than throwing on a malformed element set', () => {
    const broken: TleRecord = { ...ISS, line1: 'nonsense', line2: 'nonsense' }
    expect(getSatelliteState(broken, NEAR_EPOCH, GREENWICH, 'cached')).toBeNull()
  })
})

describe('isSunlit', () => {
  /** Unit vector from Earth's centre toward the Sun, in the same frame isSunlit uses. */
  const sunDirection = (date: Date): { x: number; y: number; z: number } => {
    const time = Astronomy.MakeTime(date)
    const vector = Astronomy.RotateVector(
      Astronomy.Rotation_EQJ_EQD(time),
      Astronomy.GeoVector(Astronomy.Body.Sun, time, false)
    )
    const length = Math.hypot(vector.x, vector.y, vector.z)
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
  }

  const scale = (v: { x: number; y: number; z: number }, k: number): typeof v => ({
    x: v.x * k,
    y: v.y * k,
    z: v.z * k
  })

  it('lights a satellite on the sunward side', () => {
    for (const iso of ['2024-01-01T12:00:00Z', '2024-06-01T00:00:00Z', '2027-09-14T06:00:00Z']) {
      const date = new Date(iso)
      expect(isSunlit(scale(sunDirection(date), 6778), date), iso).toBe(true)
    }
  })

  it('puts a satellite directly behind Earth into shadow', () => {
    for (const iso of ['2024-01-01T12:00:00Z', '2024-06-01T00:00:00Z', '2027-09-14T06:00:00Z']) {
      const date = new Date(iso)
      expect(isSunlit(scale(sunDirection(date), -6778), date), iso).toBe(false)
    }
  })

  it('lights a satellite level with the terminator but clear of the shadow cylinder', () => {
    const date = new Date('2024-06-01T00:00:00Z')
    const sun = sunDirection(date)
    // A direction perpendicular to the Sun, at a radius greater than Earth's.
    const perpendicular = { x: -sun.y, y: sun.x, z: 0 }
    const length = Math.hypot(perpendicular.x, perpendicular.y, perpendicular.z)
    expect(isSunlit(scale(perpendicular, 6778 / length), date)).toBe(true)
  })
})

describe('predictPasses', () => {
  it('finds passes with sensible geometry', () => {
    const passes = predictPasses(ISS, NEAR_EPOCH, GREENWICH, 'cached', {
      hours: 24,
      stepSeconds: 30,
      minAltitude: 10
    })
    expect(passes.length).toBeGreaterThan(0)
    for (const pass of passes) {
      const rise = new Date(pass.rise).getTime()
      const culminate = new Date(pass.culminate).getTime()
      const set = new Date(pass.set).getTime()
      expect(rise).toBeLessThanOrEqual(culminate)
      expect(culminate).toBeLessThanOrEqual(set)
      // A low-Earth-orbit pass lasts minutes, never hours.
      expect((set - rise) / 60000).toBeLessThan(15)
      expect(pass.maxAltitude).toBeGreaterThanOrEqual(10)
      expect(pass.maxAltitude).toBeLessThanOrEqual(90)
    }
  })

  it('returns fewer passes when only visible ones are wanted', () => {
    const options = { hours: 48, stepSeconds: 60, minAltitude: 10 as number }
    const all = predictPasses(ISS, NEAR_EPOCH, GREENWICH, 'cached', options)
    const visible = predictPasses(ISS, NEAR_EPOCH, GREENWICH, 'cached', {
      ...options,
      visibleOnly: true
    })
    expect(visible.length).toBeLessThanOrEqual(all.length)
    expect(visible.every((p) => p.visible)).toBe(true)
  })

  it('returns nothing for a malformed element set instead of throwing', () => {
    const broken: TleRecord = { ...ISS, line1: 'nope', line2: 'nope' }
    expect(predictPasses(broken, NEAR_EPOCH, GREENWICH, 'cached')).toHaveLength(0)
  })
})

describe('TLE freshness', () => {
  const bundle = (hoursOld: number): TleBundle => ({
    records: [ISS],
    fetchedAt: new Date(Date.now() - hoursOld * 3600000).toISOString(),
    origin: 'cached',
    warning: null
  })

  it('measures age in hours', () => {
    expect(tleAgeHours(bundle(5))).toBeCloseTo(5, 1)
  })

  it('stays quiet about fresh elements and warns about stale ones', () => {
    expect(tleWarning(bundle(2))).toBeNull()
    expect(tleWarning(bundle(72))).toContain('hours old')
    expect(tleWarning(bundle(24 * 30))).toContain('unreliable')
  })
})
