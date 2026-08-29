import { describe, expect, it } from 'vitest'
import * as Astronomy from 'astronomy-engine'
import {
  angularSeparation,
  applyMatrix3,
  azimuthToCardinal,
  eqjToWorldMatrix,
  eqjUnitVector,
  equatorialToHorizontal,
  formatDec,
  formatRa,
  horizontalToWorld,
  normalizeDegrees,
  normalizeHours,
  vectorToEquatorial,
  worldToHorizontal
} from '@shared/astro/coords'
import { GREENWICH, INDORE, SYDNEY } from '../fixtures'

// Sirius, J2000, from the HYG catalogue.
const SIRIUS = { ra: 6.75248, dec: -16.71612 }
// Polaris, J2000.
const POLARIS = { ra: 2.53030, dec: 89.26411 }

describe('angle normalisation', () => {
  it('wraps degrees into 0..360', () => {
    expect(normalizeDegrees(370)).toBeCloseTo(10)
    expect(normalizeDegrees(-10)).toBeCloseTo(350)
    expect(normalizeDegrees(0)).toBe(0)
  })

  it('wraps hours into 0..24', () => {
    expect(normalizeHours(25)).toBeCloseTo(1)
    expect(normalizeHours(-1)).toBeCloseTo(23)
  })
})

describe('vector round trips', () => {
  it('converts equatorial coordinates to a unit vector and back', () => {
    const v = eqjUnitVector(SIRIUS.ra, SIRIUS.dec)
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 12)
    const back = vectorToEquatorial(v)
    expect(back.ra).toBeCloseTo(SIRIUS.ra, 9)
    expect(back.dec).toBeCloseTo(SIRIUS.dec, 9)
  })

  it('converts horizontal coordinates to the world frame and back', () => {
    for (const [alt, az] of [[0, 0], [45, 90], [-20, 180], [80, 270], [10, 315]]) {
      const v = horizontalToWorld(alt, az)
      const back = worldToHorizontal(v)
      expect(back.altitude).toBeCloseTo(alt, 9)
      expect(back.azimuth).toBeCloseTo(normalizeDegrees(az), 9)
    }
  })

  it('places the cardinal directions on the expected world axes', () => {
    // +x is East, +y is the zenith, -z is North.
    expect(horizontalToWorld(0, 0)).toMatchObject({ x: expect.closeTo(0, 12), y: expect.closeTo(0, 12), z: expect.closeTo(-1, 12) })
    expect(horizontalToWorld(0, 90)).toMatchObject({ x: expect.closeTo(1, 12), z: expect.closeTo(0, 12) })
    expect(horizontalToWorld(90, 0)).toMatchObject({ y: expect.closeTo(1, 12) })
  })
})

describe('eqjToWorldMatrix', () => {
  /**
   * The renderer positions all 8 900 stars with this single matrix, so it has to agree
   * with astronomy-engine's own Horizon() to well under a pixel.
   */
  it('matches Astronomy.Horizon for many stars, times and locations', () => {
    const dates = [
      new Date('2026-08-29T20:00:00Z'),
      new Date('2000-01-01T12:00:00Z'),
      new Date('1975-06-15T03:20:00Z'),
      new Date('2099-12-31T23:59:00Z')
    ]
    for (const location of [GREENWICH, INDORE, SYDNEY]) {
      for (const date of dates) {
        const matrix = eqjToWorldMatrix(date, location)
        for (const star of [SIRIUS, POLARIS, { ra: 18.61, dec: 38.78 }, { ra: 12.0, dec: -60 }]) {
          const world = applyMatrix3(matrix, eqjUnitVector(star.ra, star.dec))
          const fromMatrix = worldToHorizontal(world)
          const expected = equatorialToHorizontal(star.ra, star.dec, date, location, null)

          expect(fromMatrix.altitude).toBeCloseTo(expected.altitude, 6)
          // Azimuth is undefined at the zenith; skip the degenerate case.
          if (Math.abs(expected.altitude) < 89.9) {
            const delta = Math.abs(normalizeDegrees(fromMatrix.azimuth - expected.azimuth + 180) - 180)
            expect(delta).toBeLessThan(1e-5)
          }
        }
      }
    }
  })

  it('produces an orthonormal rotation', () => {
    const m = eqjToWorldMatrix(new Date('2026-08-29T20:00:00Z'), INDORE)
    const rows = [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)]
    for (const row of rows) expect(Math.hypot(...row)).toBeCloseTo(1, 12)
    const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    expect(dot(rows[0], rows[1])).toBeCloseTo(0, 12)
    expect(dot(rows[0], rows[2])).toBeCloseTo(0, 12)
    expect(dot(rows[1], rows[2])).toBeCloseTo(0, 12)
  })
})

describe('equatorialToHorizontal', () => {
  it('agrees with astronomy-engine for a body it can compute independently', () => {
    const date = new Date('2026-08-29T20:00:00Z')
    const time = Astronomy.MakeTime(date)
    const observer = new Astronomy.Observer(INDORE.latitude, INDORE.longitude, INDORE.elevation)
    // Use Jupiter's J2000 position as a stand-in "fixed" star for this instant.
    const eqj = Astronomy.Equator(Astronomy.Body.Jupiter, time, observer, false, true)
    const eqd = Astronomy.Equator(Astronomy.Body.Jupiter, time, observer, true, true)
    const expected = Astronomy.Horizon(time, observer, eqd.ra, eqd.dec, 'normal')

    const actual = equatorialToHorizontal(eqj.ra, eqj.dec, date, INDORE, 'normal')
    expect(actual.altitude).toBeCloseTo(expected.altitude, 4)
    expect(actual.azimuth).toBeCloseTo(expected.azimuth, 4)
  })

  it('keeps Polaris near the pole altitude for the observer latitude', () => {
    const date = new Date('2026-08-29T20:00:00Z')
    const { altitude } = equatorialToHorizontal(POLARIS.ra, POLARIS.dec, date, GREENWICH, null)
    // Polaris sits within about a degree of the pole, so its altitude tracks latitude.
    expect(Math.abs(altitude - GREENWICH.latitude)).toBeLessThan(1.5)
  })

  it('never lifts a southern star above the horizon from a northern site', () => {
    // Alpha Centauri, declination -60.8, cannot rise from Greenwich (lat +51.5).
    const { altitude } = equatorialToHorizontal(14.66076, -60.83398, new Date('2026-05-01T00:00:00Z'), GREENWICH, null)
    expect(altitude).toBeLessThan(0)
  })
})

describe('angularSeparation', () => {
  it('is zero for identical positions', () => {
    expect(angularSeparation(SIRIUS.ra, SIRIUS.dec, SIRIUS.ra, SIRIUS.dec)).toBeCloseTo(0, 9)
  })

  it('measures 90 degrees between the pole and the equator', () => {
    expect(angularSeparation(0, 90, 6, 0)).toBeCloseTo(90, 9)
  })

  it('measures the known separation of the Big Dipper pointers', () => {
    // Dubhe and Merak, J2000, are about 5.4 degrees apart.
    const separation = angularSeparation(11.06213, 61.75103, 11.03069, 56.38243)
    expect(separation).toBeGreaterThan(5.2)
    expect(separation).toBeLessThan(5.6)
  })
})

describe('formatting', () => {
  it('formats right ascension in hours, minutes and seconds', () => {
    expect(formatRa(0)).toBe('00h 00m 00s')
    expect(formatRa(6.75248)).toBe('06h 45m 09s')
    expect(formatRa(-1)).toBe('23h 00m 00s')
  })

  it('formats declination with a sign', () => {
    expect(formatDec(-16.71612)).toBe('-16° 42′ 58″')
    expect(formatDec(89.26411)).toBe('+89° 15′ 51″')
    expect(formatDec(0)).toBe('+00° 00′ 00″')
  })

  it('maps azimuth to compass points', () => {
    expect(azimuthToCardinal(0)).toBe('N')
    expect(azimuthToCardinal(90)).toBe('E')
    expect(azimuthToCardinal(180)).toBe('S')
    expect(azimuthToCardinal(270)).toBe('W')
    expect(azimuthToCardinal(359)).toBe('N')
    expect(azimuthToCardinal(112.5)).toBe('ESE')
  })
})
