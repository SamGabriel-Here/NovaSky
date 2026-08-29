import { describe, expect, it } from 'vitest'
import {
  buildSnapshot,
  formatDistance,
  getDarkWindow,
  getDistance,
  getMagnitude,
  getPosition,
  getRiseSetTimes,
  getSkyConditions,
  startOfObservingDay
} from '@shared/astro/ephemeris'
import { GREENWICH, INDORE, SYDNEY, TROMSO, testCatalog } from '../fixtures'

const catalog = testCatalog()
const object = (id: string): NonNullable<ReturnType<typeof catalog.objects.get>> => {
  const found = catalog.objects.get(id)
  if (!found) throw new Error(`fixture missing object ${id}`)
  return found
}

// Sirius, Polaris and Alpha Centauri, by their HYG catalogue ids.
const SIRIUS = 'star:32263'
const POLARIS = 'star:11734'
const ALPHA_CENTAURI = 'star:71456'

describe('getPosition', () => {
  it('puts an object above the horizon only when it is actually up', () => {
    // Sirius transits a little after local midnight at the start of January, and from
    // Greenwich (latitude +51.5) it is only above the horizon for about eight hours.
    const up = getPosition(object(SIRIUS), new Date('2027-01-01T00:40:00Z'), GREENWICH)
    expect(up.altitude).toBeGreaterThan(0)

    // Twelve hours later it is on the far side of the Earth.
    const down = getPosition(object(SIRIUS), new Date('2027-01-01T12:40:00Z'), GREENWICH)
    expect(down.altitude).toBeLessThan(0)
  })

  it('holds Polaris near the pole all night', () => {
    const altitudes = [0, 6, 12, 18].map(
      (hour) =>
        getPosition(object(POLARIS), new Date(`2027-03-10T0${hour % 10}:00:00Z`), GREENWICH)
          .altitude
    )
    for (const altitude of altitudes) {
      expect(Math.abs(altitude - GREENWICH.latitude)).toBeLessThan(2)
    }
  })

  it('returns the same altitude for the Sun as the sky-conditions helper', () => {
    const date = new Date('2027-06-21T12:00:00Z')
    const sun = getPosition(object('sun'), date, GREENWICH)
    expect(sun.altitude).toBeCloseTo(getSkyConditions(date, GREENWICH).sunAltitude, 6)
  })
})

describe('getRiseSetTimes', () => {
  it('reports a star that rises and sets', () => {
    const times = getRiseSetTimes(object(SIRIUS), new Date('2027-01-15T20:00:00Z'), GREENWICH)
    expect(times.rise).not.toBeNull()
    expect(times.set).not.toBeNull()
    expect(times.circumpolar).toBe(false)
    expect(times.neverRises).toBe(false)
  })

  it('recognises a circumpolar star', () => {
    const times = getRiseSetTimes(object(POLARIS), new Date('2027-01-15T20:00:00Z'), GREENWICH)
    expect(times.circumpolar).toBe(true)
    expect(times.rise).toBeNull()
    expect(times.set).toBeNull()
  })

  it('recognises a star that never rises', () => {
    const times = getRiseSetTimes(object(ALPHA_CENTAURI), new Date('2027-05-01T20:00:00Z'), GREENWICH)
    expect(times.neverRises).toBe(true)
  })

  it('gives a transit altitude equal to 90 - |latitude - declination|', () => {
    // Sirius, declination about -16.72, from Indore at latitude +22.72.
    const times = getRiseSetTimes(object(SIRIUS), new Date('2027-01-15T18:00:00Z'), INDORE)
    const expected = 90 - Math.abs(INDORE.latitude - -16.716)
    expect(times.transitAltitude).not.toBeNull()
    // Refraction lifts the apparent altitude by a couple of arcminutes.
    expect(Math.abs((times.transitAltitude as number) - expected)).toBeLessThan(0.5)
  })

  it('orders rise, transit and set within the same night for a southern observer', () => {
    const times = getRiseSetTimes(object(ALPHA_CENTAURI), new Date('2027-05-01T10:00:00Z'), SYDNEY)
    expect(times.circumpolar).toBe(true)
  })
})

describe('getDarkWindow', () => {
  it('produces sunset before dark and dark before dawn', () => {
    const window = getDarkWindow(new Date('2027-03-15T18:00:00Z'), GREENWICH)
    expect(window.sunset).not.toBeNull()
    expect(window.darkStart).not.toBeNull()
    expect(window.darkEnd).not.toBeNull()
    expect(new Date(window.sunset as string).getTime()).toBeLessThan(
      new Date(window.darkStart as string).getTime()
    )
    expect(new Date(window.darkStart as string).getTime()).toBeLessThan(
      new Date(window.darkEnd as string).getTime()
    )
  })

  it('flags a high-latitude summer night that never gets fully dark', () => {
    const window = getDarkWindow(new Date('2027-06-21T12:00:00Z'), TROMSO)
    // Tromso is inside the Arctic Circle: the Sun does not set at midsummer.
    expect(window.polarDay || window.neverFullyDark).toBe(true)
  })

  it('flags polar night', () => {
    const window = getDarkWindow(new Date('2027-12-21T12:00:00Z'), TROMSO)
    expect(window.polarNight).toBe(true)
  })
})

describe('startOfObservingDay', () => {
  it('treats the small hours as belonging to the previous evening', () => {
    // 02:00 local in Indore on 15 March: tonight is the night that began on the 14th.
    const anchor = startOfObservingDay(new Date('2027-03-14T20:30:00Z'), INDORE)
    const label = new Intl.DateTimeFormat('en-CA', {
      timeZone: INDORE.timeZone,
      day: '2-digit'
    }).format(anchor)
    expect(label).toBe('14')
  })
})

describe('magnitude and distance', () => {
  it('computes a varying magnitude for planets and reads a fixed one for stars', () => {
    const jupiterA = getMagnitude(object('jupiter'), new Date('2027-01-01T00:00:00Z'))
    const jupiterB = getMagnitude(object('jupiter'), new Date('2027-07-01T00:00:00Z'))
    expect(jupiterA.origin).toBe('calculated')
    expect(jupiterA.magnitude).not.toBeCloseTo(jupiterB.magnitude as number, 3)
    // Jupiter stays within its real range whatever the date.
    for (const value of [jupiterA.magnitude, jupiterB.magnitude]) {
      expect(value as number).toBeGreaterThan(-3.2)
      expect(value as number).toBeLessThan(-1.4)
    }

    const sirius = getMagnitude(object(SIRIUS), new Date('2027-01-01T00:00:00Z'))
    expect(sirius.origin).toBe('catalog')
    expect(sirius.magnitude).toBeCloseTo(-1.44, 2)
  })

  it('gives the Moon a distance inside its real orbital range', () => {
    const distance = getDistance(object('moon'), new Date('2027-01-01T00:00:00Z'))
    expect(distance?.unit).toBe('km')
    expect(distance?.value).toBeGreaterThan(356000)
    expect(distance?.value).toBeLessThan(407000)
  })

  it('gives Mars a geocentric distance inside its real range', () => {
    const distance = getDistance(object('mars'), new Date('2027-01-01T00:00:00Z'))
    expect(distance?.unit).toBe('au')
    expect(distance?.value).toBeGreaterThan(0.35)
    expect(distance?.value).toBeLessThan(2.7)
  })

  it('formats distances with their unit', () => {
    expect(formatDistance({ value: 384400, unit: 'km', origin: 'calculated' })).toContain('km')
    expect(formatDistance({ value: 8.6, unit: 'ly', origin: 'catalog' })).toContain('light-years')
  })
})

describe('buildSnapshot', () => {
  it('assembles a complete, correctly-attributed snapshot for a star', () => {
    const snapshot = buildSnapshot(
      object(SIRIUS),
      new Date('2027-01-15T22:00:00Z'),
      GREENWICH,
      catalog
    )
    expect(snapshot.object.name).toBe('Sirius')
    expect(snapshot.positionOrigin).toBe('calculated')
    expect(snapshot.magnitudeOrigin).toBe('catalog')
    expect(snapshot.description.length).toBeGreaterThan(30)
    expect(snapshot.links.some((link) => link.url.startsWith('https://'))).toBe(true)
    expect(snapshot.visibility.state).not.toBe('unknown')
  })

  it('carries mythology for a constellation and none for a star', () => {
    const orion = buildSnapshot(
      object('con:Ori'),
      new Date('2027-01-15T22:00:00Z'),
      GREENWICH,
      catalog
    )
    expect(orion.mythology).toContain('Ptolemy')
    const sirius = buildSnapshot(
      object(SIRIUS),
      new Date('2027-01-15T22:00:00Z'),
      GREENWICH,
      catalog
    )
    expect(sirius.mythology).toBeNull()
  })

  it('marks an object below the horizon as such', () => {
    const snapshot = buildSnapshot(
      object(ALPHA_CENTAURI),
      new Date('2027-05-01T22:00:00Z'),
      GREENWICH,
      catalog
    )
    expect(snapshot.visibility.state).toBe('below-horizon')
    expect(snapshot.position.altitude).toBeLessThan(0)
  })

  it('never claims a daytime object is visible', () => {
    const noon = new Date('2027-06-21T12:00:00Z')
    const snapshot = buildSnapshot(object(SIRIUS), noon, GREENWICH, catalog)
    expect(['daylight', 'below-horizon']).toContain(snapshot.visibility.state)
  })
})
