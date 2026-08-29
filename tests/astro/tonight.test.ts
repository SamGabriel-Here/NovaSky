import { describe, expect, it } from 'vitest'
import { buildTonightPlan, getMoonSummary, peakInWindow } from '@shared/astro/tonight'
import { getDarkWindow } from '@shared/astro/ephemeris'
import { GREENWICH, INDORE, SYDNEY, TROMSO, testCatalog } from '../fixtures'

const catalog = testCatalog()
const WINTER_EVENING = new Date('2027-01-15T20:00:00Z')

describe('buildTonightPlan', () => {
  const plan = buildTonightPlan(catalog, WINTER_EVENING, GREENWICH)

  it('describes the night', () => {
    expect(plan.window.sunset).not.toBeNull()
    expect(plan.window.darkStart).not.toBeNull()
    expect(plan.moonNote.length).toBeGreaterThan(10)
    expect(plan.warning).toBeNull()
  })

  it('only recommends objects that clear the horizon during the dark window', () => {
    for (const section of [plan.planets, plan.stars, plan.constellations, plan.deepSky]) {
      for (const entry of section) {
        expect(entry.bestAltitude, entry.object.name).toBeGreaterThan(0)
        const best = new Date(entry.bestTime).getTime()
        expect(best).toBeGreaterThanOrEqual(new Date(plan.window.darkStart as string).getTime() - 1000)
        expect(best).toBeLessThanOrEqual(new Date(plan.window.darkEnd as string).getTime() + 1000)
      }
    }
  })

  it('names every bright star it recommends', () => {
    for (const entry of plan.stars) {
      // No bare catalogue numbers: an unnamed component star is no use to an observer.
      expect(entry.object.name).not.toMatch(/^(HYG|HIP) \d+$/)
      expect(entry.magnitude).not.toBeNull()
    }
  })

  it('sorts bright stars so the brightest are near the top', () => {
    const magnitudes = plan.stars.map((s) => s.magnitude ?? 99)
    expect(Math.min(...magnitudes)).toBeLessThan(1.5)
  })

  it('gives every entry a human-readable note and rise/set information', () => {
    for (const entry of [...plan.planets, ...plan.deepSky]) {
      expect(entry.note.length).toBeGreaterThan(5)
      expect(entry.riseSet).toBeDefined()
    }
  })

  it('includes upcoming events', () => {
    expect(plan.events.length).toBeGreaterThan(0)
    for (const event of plan.events) {
      expect(new Date(event.time).getTime()).toBeGreaterThanOrEqual(WINTER_EVENING.getTime())
    }
  })

  it('shows the southern sky from a southern location', () => {
    const southern = buildTonightPlan(catalog, WINTER_EVENING, SYDNEY)
    const names = southern.constellations.map((c) => c.object.name)
    // Nothing north-circumpolar can be well placed from Sydney.
    expect(names).not.toContain('Ursa Minor')
    expect(southern.constellations.length).toBeGreaterThan(0)
  })

  it('restricts itself to the beginner set in beginner mode', () => {
    const beginner = buildTonightPlan(catalog, WINTER_EVENING, GREENWICH, { beginnerMode: true })
    expect(beginner.deepSky.every((d) => d.object.beginner)).toBe(true)
    expect(beginner.constellations.every((c) => c.object.beginner)).toBe(true)
  })

  it('honours the section limit', () => {
    const small = buildTonightPlan(catalog, WINTER_EVENING, GREENWICH, { limit: 3 })
    expect(small.stars.length).toBeLessThanOrEqual(3)
    expect(small.deepSky.length).toBeLessThanOrEqual(3)
  })

  it('warns rather than failing during polar night', () => {
    const polar = buildTonightPlan(catalog, new Date('2027-12-21T12:00:00Z'), TROMSO)
    expect(polar.warning).toContain('does not rise')
  })

  it('warns when a summer night never gets fully dark', () => {
    const midsummer = buildTonightPlan(catalog, new Date('2027-06-21T12:00:00Z'), TROMSO)
    expect(midsummer.warning).not.toBeNull()
  })
})

describe('peakInWindow', () => {
  it('finds the transit when it falls inside the dark window', () => {
    const window = getDarkWindow(WINTER_EVENING, INDORE)
    const sirius = catalog.objects.get('star:32263')
    expect(sirius).toBeDefined()
    const peak = peakInWindow(sirius!, window, INDORE)
    expect(peak).not.toBeNull()
    // Sirius culminates at 90 - |22.72 - (-16.72)| = 50.6 degrees from Indore.
    expect(peak!.altitude).toBeGreaterThan(49)
    expect(peak!.altitude).toBeLessThan(52)
  })
})

describe('getMoonSummary', () => {
  it('names the phase and reports illumination between 0 and 1', () => {
    for (const iso of ['2027-01-01T00:00:00Z', '2027-04-11T00:00:00Z', '2027-08-02T00:00:00Z']) {
      const summary = getMoonSummary(new Date(iso), GREENWICH)
      expect(summary.illumination).toBeGreaterThanOrEqual(0)
      expect(summary.illumination).toBeLessThanOrEqual(1)
      expect(summary.name.length).toBeGreaterThan(3)
      expect(summary.note).toContain('%')
    }
  })

  it('calls the 2 August 2027 new Moon a new Moon', () => {
    // The same new Moon that produces that day's total solar eclipse.
    const summary = getMoonSummary(new Date('2027-08-02T10:00:00Z'), GREENWICH)
    expect(summary.name).toBe('New Moon')
    expect(summary.illumination).toBeLessThan(0.02)
  })
})
