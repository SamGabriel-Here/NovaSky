import { describe, expect, it } from 'vitest'
import {
  METEOR_SHOWERS,
  getConjunctions,
  getEclipses,
  getEvents,
  getMeteorShowers,
  getMoonPhases,
  getSeasons
} from '@shared/astro/events'
import { GREENWICH, INDORE } from '../fixtures'

const YEAR_START = new Date('2027-01-01T00:00:00Z')
const YEAR_END = new Date('2028-01-01T00:00:00Z')

describe('getSeasons', () => {
  it('places the 2027 equinoxes and solstices on their published dates', () => {
    const seasons = getSeasons(YEAR_START, YEAR_END)
    expect(seasons).toHaveLength(4)
    const dates = Object.fromEntries(seasons.map((s) => [s.title, s.time.slice(0, 10)]))
    expect(dates['March equinox']).toBe('2027-03-20')
    expect(dates['June solstice']).toBe('2027-06-21')
    expect(dates['September equinox']).toBe('2027-09-23')
    expect(dates['December solstice']).toBe('2027-12-22')
  })

  it('tags equinoxes and solstices with the right kind', () => {
    const seasons = getSeasons(YEAR_START, YEAR_END)
    expect(seasons.filter((s) => s.kind === 'equinox')).toHaveLength(2)
    expect(seasons.filter((s) => s.kind === 'solstice')).toHaveLength(2)
  })
})

describe('getMoonPhases', () => {
  it('produces roughly four phases per lunar month, in order', () => {
    const phases = getMoonPhases(YEAR_START, YEAR_END)
    // Twelve or thirteen lunations a year, four quarters each.
    expect(phases.length).toBeGreaterThanOrEqual(48)
    expect(phases.length).toBeLessThanOrEqual(53)
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i].time > phases[i - 1].time).toBe(true)
    }
  })

  it('cycles New, First Quarter, Full, Last Quarter', () => {
    const titles = getMoonPhases(YEAR_START, new Date('2027-03-01T00:00:00Z')).map((p) => p.title)
    const order = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter']
    const startIndex = order.indexOf(titles[0])
    expect(startIndex).toBeGreaterThanOrEqual(0)
    titles.forEach((title, i) => {
      expect(title).toBe(order[(startIndex + i) % 4])
    })
  })
})

describe('getMeteorShowers', () => {
  it('places each shower peak inside the dates the IMO publishes for it', () => {
    const showers = getMeteorShowers(YEAR_START, YEAR_END, GREENWICH)
    const byName = new Map(showers.map((s) => [s.title, s.time]))

    // Well-known peaks, checked to within a day.
    const expected: [string, string][] = [
      ['Quadrantids peak', '2027-01-03'],
      ['Lyrids peak', '2027-04-22'],
      ['Eta Aquariids peak', '2027-05-06'],
      ['Perseids peak', '2027-08-13'],
      ['Orionids peak', '2027-10-21'],
      ['Leonids peak', '2027-11-17'],
      ['Geminids peak', '2027-12-14']
    ]
    for (const [title, day] of expected) {
      const actual = byName.get(title)
      expect(actual, `${title} missing`).toBeDefined()
      const delta = Math.abs(new Date(actual as string).getTime() - new Date(`${day}T00:00:00Z`).getTime())
      expect(delta / 86400000, `${title} was ${actual}`).toBeLessThan(1.5)
    }
  })

  it('describes local radiant visibility', () => {
    const showers = getMeteorShowers(YEAR_START, YEAR_END, INDORE)
    for (const shower of showers) {
      expect(shower.localVisibility).toContain(INDORE.label)
      expect(shower.origin).toBe('calculated')
    }
  })

  it('covers every shower in the working list', () => {
    const showers = getMeteorShowers(YEAR_START, YEAR_END, GREENWICH)
    for (const shower of METEOR_SHOWERS) {
      expect(showers.some((s) => s.title.startsWith(shower.name)), shower.name).toBe(true)
    }
  })
})

describe('getEclipses', () => {
  it('finds the 2 August 2027 total solar eclipse and reports it as partial from London', () => {
    const eclipses = getEclipses(
      new Date('2027-07-01T00:00:00Z'),
      new Date('2027-09-01T00:00:00Z'),
      GREENWICH
    )
    const solar = eclipses.find((e) => e.kind === 'solar-eclipse')
    expect(solar).toBeDefined()
    expect(solar?.time.slice(0, 10)).toBe('2027-08-02')
    expect(solar?.title).toBe('Total solar eclipse')
    // The path of totality crosses North Africa, not London.
    expect(solar?.localVisibility).toContain('partial')
  })

  it('reports the same eclipse as not visible from a location it misses entirely', () => {
    const eclipses = getEclipses(
      new Date('2027-01-01T00:00:00Z'),
      new Date('2027-03-01T00:00:00Z'),
      GREENWICH
    )
    const solar = eclipses.find((e) => e.kind === 'solar-eclipse')
    // The 6 February 2027 annular eclipse is a South American event.
    expect(solar?.time.slice(0, 10)).toBe('2027-02-06')
    expect(solar?.localVisibility).toContain('Not visible')
  })

  it('always warns about eye safety on solar eclipses', () => {
    const eclipses = getEclipses(YEAR_START, YEAR_END, GREENWICH)
    for (const eclipse of eclipses.filter((e) => e.kind === 'solar-eclipse')) {
      expect(eclipse.description.toLowerCase()).toContain('filter')
    }
  })

  it('says whether a lunar eclipse is above the horizon locally', () => {
    const eclipses = getEclipses(YEAR_START, YEAR_END, INDORE)
    const lunar = eclipses.filter((e) => e.kind === 'lunar-eclipse')
    expect(lunar.length).toBeGreaterThan(0)
    for (const eclipse of lunar) {
      expect(eclipse.localVisibility).toMatch(/visible|not visible/i)
    }
  })
})

describe('getConjunctions', () => {
  it('only reports genuinely close, observable pairings', () => {
    const conjunctions = getConjunctions(YEAR_START, new Date('2027-04-01T00:00:00Z'), 3)
    expect(conjunctions.length).toBeGreaterThan(0)
    for (const event of conjunctions) {
      expect(event.kind).toBe('conjunction')
      expect(event.objectIds).toHaveLength(2)
      // The separation is quoted in the description; it must be under the threshold.
      const match = /within ([\d.]+)°/.exec(event.description)
      expect(match).not.toBeNull()
      expect(Number(match?.[1])).toBeLessThanOrEqual(3)
    }
  })
})

describe('getEvents', () => {
  it('returns events sorted by time', () => {
    const events = getEvents({ from: YEAR_START, to: YEAR_END, location: GREENWICH })
    expect(events.length).toBeGreaterThan(50)
    for (let i = 1; i < events.length; i++) {
      expect(events[i].time >= events[i - 1].time).toBe(true)
    }
  })

  it('keeps every event inside the requested window', () => {
    const from = new Date('2027-05-01T00:00:00Z')
    const to = new Date('2027-07-01T00:00:00Z')
    for (const event of getEvents({ from, to, location: GREENWICH })) {
      expect(new Date(event.time).getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(new Date(event.time).getTime()).toBeLessThanOrEqual(to.getTime())
    }
  })

  it('honours the kind filter', () => {
    const events = getEvents({
      from: YEAR_START,
      to: YEAR_END,
      location: GREENWICH,
      kinds: ['opposition']
    })
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => e.kind === 'opposition')).toBe(true)
  })

  it('gives every event a stable, unique id', () => {
    const events = getEvents({ from: YEAR_START, to: YEAR_END, location: GREENWICH })
    const ids = new Set(events.map((e) => e.id))
    expect(ids.size).toBe(events.length)
  })
})
