import { describe, expect, it } from 'vitest'
import * as Astronomy from 'astronomy-engine'
import {
  EQUATORIAL_RADIUS_KM,
  SATURN_RING_KM,
  bodyFrame,
  getBodyAppearance,
  inFrame
} from '@shared/astro/bodies'
import type { Vec3 } from '@shared/astro/coords'

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z)
const DATE = new Date('2027-01-15T22:00:00Z')

const appearanceOf = (id: string, body: string, date = DATE) => {
  const value = getBodyAppearance(id, body, date)
  if (!value) throw new Error(`no appearance for ${id}`)
  return value
}

describe('angular size', () => {
  it('matches the published range for each body', () => {
    // Apparent diameters in arcseconds, from the NASA fact sheets.
    const ranges: [string, string, number, number][] = [
      ['moon', 'Moon', 1760, 2010],
      ['sun', 'Sun', 1870, 1950],
      ['jupiter', 'Jupiter', 29, 51],
      ['saturn', 'Saturn', 14, 21],
      ['mars', 'Mars', 3.4, 26],
      ['venus', 'Venus', 9.5, 66]
    ]
    for (const [id, body, min, max] of ranges) {
      // Sample across a few years so the full range of distances is covered.
      for (let month = 0; month < 30; month += 3) {
        const date = new Date(Date.UTC(2027, month, 1))
        const arcsec = appearanceOf(id, body, date).angularDiameter * 3600
        expect(arcsec, `${id} at month ${month}`).toBeGreaterThan(min * 0.9)
        expect(arcsec, `${id} at month ${month}`).toBeLessThan(max * 1.1)
      }
    }
  })

  it('returns null for a body with no recorded radius', () => {
    expect(getBodyAppearance('ceres', 'Sun', DATE)).toBeNull()
  })
})

describe('phase geometry', () => {
  it('puts the Sun behind the observer at full phase and behind the body at new', () => {
    // 18 July 2027 is a full Moon and 2 August 2027 a new Moon, the same new Moon that
    // produces that year's total solar eclipse.
    const full = appearanceOf('moon', 'Moon', new Date('2027-07-18T22:00:00Z'))
    const dark = appearanceOf('moon', 'Moon', new Date('2027-08-02T10:00:00Z'))
    expect(full.illumination).toBeGreaterThan(0.99)
    expect(dark.illumination).toBeLessThan(0.01)
    expect(inFrame(bodyFrame(full), full.toSun).z).toBeGreaterThan(0.99)
    expect(inFrame(bodyFrame(dark), dark.toSun).z).toBeLessThan(-0.99)
  })

  it('agrees with the phase angle for every body', () => {
    // The z component of the Sun direction in the disc frame is cos of the phase angle,
    // which is what makes the terminator land in the right place.
    for (const [id, body] of [
      ['moon', 'Moon'],
      ['venus', 'Venus'],
      ['mars', 'Mars'],
      ['jupiter', 'Jupiter'],
      ['mercury', 'Mercury']
    ]) {
      const appearance = appearanceOf(id, body)
      const sun = inFrame(bodyFrame(appearance), appearance.toSun)
      expect(sun.z, id).toBeCloseTo(Math.cos(appearance.phaseAngle * (Math.PI / 180)), 3)
    }
  })
})

describe('body frame', () => {
  it('is orthonormal', () => {
    for (const [id, body] of [
      ['moon', 'Moon'],
      ['saturn', 'Saturn'],
      ['uranus', 'Uranus']
    ]) {
      const frame = bodyFrame(appearanceOf(id, body))
      for (const axis of [frame.x, frame.y, frame.z]) expect(length(axis)).toBeCloseTo(1, 9)
      expect(dot(frame.x, frame.y)).toBeCloseTo(0, 9)
      expect(dot(frame.y, frame.z)).toBeCloseTo(0, 9)
      expect(dot(frame.x, frame.z)).toBeCloseTo(0, 9)
    }
  })

  it('faces the observer', () => {
    const appearance = appearanceOf('mars', 'Mars')
    // z points from the body back toward Earth, so it opposes the line of sight.
    expect(dot(bodyFrame(appearance).z, appearance.direction)).toBeCloseTo(-1, 9)
  })
})

describe('body-fixed axes', () => {
  it('are orthonormal and right-handed with the pole', () => {
    for (const [id, body] of [
      ['moon', 'Moon'],
      ['mars', 'Mars'],
      ['jupiter', 'Jupiter']
    ]) {
      const a = appearanceOf(id, body)
      expect(dot(a.primeMeridian, a.eastward)).toBeCloseTo(0, 9)
      expect(dot(a.primeMeridian, a.northPole)).toBeCloseTo(0, 9)
      expect(dot(a.eastward, a.northPole)).toBeCloseTo(0, 9)
      expect(length(a.primeMeridian)).toBeCloseTo(1, 9)
    }
  })

  /**
   * The strongest check available: the Moon is tidally locked, so the point facing
   * Earth must always sit within a libration of the origin of its coordinate system.
   * If the prime meridian were derived wrongly the far side would face us instead.
   */
  it('keeps the near side of the Moon toward Earth', () => {
    for (const iso of [
      '2027-01-15T22:00:00Z',
      '2027-04-02T06:00:00Z',
      '2027-07-18T22:00:00Z',
      '2028-11-30T12:00:00Z'
    ]) {
      const a = appearanceOf('moon', 'Moon', new Date(iso))
      const toObserver = { x: -a.direction.x, y: -a.direction.y, z: -a.direction.z }
      const longitude =
        Math.atan2(dot(toObserver, a.eastward), dot(toObserver, a.primeMeridian)) * (180 / Math.PI)
      const latitude = Math.asin(dot(toObserver, a.northPole)) * (180 / Math.PI)
      // Lunar libration reaches about 8 degrees in longitude and 7 in latitude.
      expect(Math.abs(longitude), `longitude at ${iso}`).toBeLessThan(9)
      expect(Math.abs(latitude), `latitude at ${iso}`).toBeLessThan(8)
    }
  })

  it('shows libration rather than a perfectly fixed face', () => {
    // If libration were being ignored the sub-Earth point would never move.
    const longitudes = ['2027-01-05', '2027-01-12', '2027-01-19', '2027-01-26'].map((day) => {
      const a = appearanceOf('moon', 'Moon', new Date(`${day}T00:00:00Z`))
      const toObserver = { x: -a.direction.x, y: -a.direction.y, z: -a.direction.z }
      return Math.atan2(dot(toObserver, a.eastward), dot(toObserver, a.primeMeridian))
    })
    const spread = Math.max(...longitudes) - Math.min(...longitudes)
    expect(spread * (180 / Math.PI)).toBeGreaterThan(2)
  })
})

describe('Saturn', () => {
  it('reports a ring tilt only for Saturn, inside the range the geometry allows', () => {
    expect(appearanceOf('jupiter', 'Jupiter').ringTilt).toBeNull()
    for (let year = 2027; year < 2042; year += 2) {
      const tilt = appearanceOf('saturn', 'Saturn', new Date(Date.UTC(year, 5, 1))).ringTilt
      expect(tilt).not.toBeNull()
      // The rings open to at most about 27 degrees and close to edge on.
      expect(Math.abs(tilt as number)).toBeLessThan(28)
    }
  })

  it('has rings that sit outside the globe', () => {
    expect(SATURN_RING_KM.inner).toBeGreaterThan(EQUATORIAL_RADIUS_KM.saturn)
    expect(SATURN_RING_KM.outer).toBeGreaterThan(SATURN_RING_KM.inner)
    // The A ring's outer edge is a little over twice the planet's radius.
    expect(SATURN_RING_KM.outer / EQUATORIAL_RADIUS_KM.saturn).toBeGreaterThan(2)
    expect(SATURN_RING_KM.outer / EQUATORIAL_RADIUS_KM.saturn).toBeLessThan(2.5)
  })
})

describe('radii', () => {
  it('match astronomy-engine where it carries the same constant', () => {
    // A cross-check that the fact-sheet numbers were transcribed correctly.
    expect(EQUATORIAL_RADIUS_KM.jupiter).toBeCloseTo(71492, 0)
    expect(EQUATORIAL_RADIUS_KM.moon).toBeCloseTo(1737.4, 1)
    const helio = Astronomy.HelioVector(Astronomy.Body.Earth, Astronomy.MakeTime(DATE))
    expect(Math.hypot(helio.x, helio.y, helio.z)).toBeGreaterThan(0.9)
  })
})
