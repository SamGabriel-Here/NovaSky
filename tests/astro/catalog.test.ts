import { describe, expect, it } from 'vitest'
import { parseBayer, searchCatalog } from '@shared/astro/catalog'
import { CONSTELLATION_LORE } from '@shared/astro/lore'
import { testCatalog } from '../fixtures'

const catalog = testCatalog()

describe('catalogue integrity', () => {
  it('loads every shipped dataset', () => {
    expect(catalog.stars.length).toBeGreaterThan(8000)
    expect(catalog.constellations).toHaveLength(88)
    expect(catalog.deepSky.length).toBeGreaterThan(1000)
    expect(catalog.blackHoles.length).toBeGreaterThan(10)
    expect(catalog.places.length).toBeGreaterThan(300)
    // Four numbers per faint star: ra, dec, magnitude, colour index.
    expect(catalog.faintStars.length % 4).toBe(0)
    expect(catalog.faintStars.length / 4).toBeGreaterThan(50000)
  })

  it('gives every constellation a figure and a piece of cultural background', () => {
    for (const constellation of catalog.constellations) {
      expect(constellation.lines.length, `${constellation.id} has no figure`).toBeGreaterThan(0)
      expect(CONSTELLATION_LORE[constellation.id], `${constellation.id} has no lore`).toBeDefined()
    }
  })

  it('keeps every coordinate inside its valid range', () => {
    const check = (ra: number, dec: number, label: string): void => {
      expect(ra, label).toBeGreaterThanOrEqual(0)
      expect(ra, label).toBeLessThan(24)
      expect(dec, label).toBeGreaterThanOrEqual(-90)
      expect(dec, label).toBeLessThanOrEqual(90)
    }
    for (const star of catalog.stars) check(star.r, star.d, `star ${star.i}`)
    for (const dso of catalog.deepSky) check(dso.r, dso.d, `dso ${dso.id}`)
    for (const hole of catalog.blackHoles) check(hole.r, hole.d, `bh ${hole.id}`)
  })

  it('contains 109 of the 110 Messier objects', () => {
    const messier = new Set(catalog.deepSky.map((d) => d.m).filter((m): m is number => m !== null))
    // M102 is the one genuine gap: it is a disputed entry that OpenNGC does not assign.
    expect(messier.size).toBe(109)
    expect(messier.has(102)).toBe(false)
    expect(messier.has(45)).toBe(true)
  })

  it('never invents a magnitude', () => {
    // Every catalogued magnitude has to be a real number or explicitly absent.
    for (const dso of catalog.deepSky) {
      if (dso.v !== null) expect(Number.isFinite(dso.v)).toBe(true)
    }
  })
})

describe('parseBayer', () => {
  it('maps Greek letter codes to symbols and names', () => {
    expect(parseBayer('Alp')).toEqual({ symbol: 'α', name: 'Alpha' })
    expect(parseBayer('Ome')).toEqual({ symbol: 'ω', name: 'Omega' })
    expect(parseBayer('Alp-1')).toEqual({ symbol: 'α1', name: 'Alpha-1' })
    expect(parseBayer(null)).toBeNull()
    expect(parseBayer('Zzz')).toBeNull()
  })
})

describe('searchCatalog', () => {
  const first = (query: string): string | undefined =>
    searchCatalog(catalog, query, { limit: 1 })[0]?.name

  it('finds objects by proper name', () => {
    expect(first('betelgeuse')).toBe('Betelgeuse')
    expect(first('Pleiades')).toBe('Pleiades')
    expect(first('polaris')).toBe('Polaris')
  })

  it('finds Messier and NGC objects with or without spaces', () => {
    expect(first('M31')).toBe('Andromeda Galaxy')
    expect(first('m 31')).toBe('Andromeda Galaxy')
    expect(first('messier 31')).toBe('Andromeda Galaxy')
    expect(first('NGC 224')).toBe('Andromeda Galaxy')
    expect(first('ngc224')).toBe('Andromeda Galaxy')
  })

  it('finds stars by Bayer designation, spelled out or as a Greek letter', () => {
    expect(first('alpha centauri')).toBe('Rigil Kentaurus')
    expect(first('α ori')).toBe('Betelgeuse')
    expect(first('beta cen')).toBe('Hadar')
  })

  it('finds Solar-System bodies and prefers them over similarly named objects', () => {
    expect(first('jupiter')).toBe('Jupiter')
    expect(first('moon')).toBe('Moon')
  })

  it('finds black holes', () => {
    expect(first('cygnus x-1')).toBe('Cygnus X-1')
    expect(first('sagittarius a')).toBe('Sagittarius A*')
    const holes = searchCatalog(catalog, 'black hole', { limit: 20 })
    expect(holes.length).toBeGreaterThan(10)
    expect(holes.every((o) => o.kind === 'black-hole')).toBe(true)
  })

  it('ignores accents and punctuation', () => {
    expect(first('bootes')).toBe('Boötes')
  })

  it('returns nothing for an empty or unmatched query', () => {
    expect(searchCatalog(catalog, '')).toHaveLength(0)
    expect(searchCatalog(catalog, '   ')).toHaveLength(0)
    expect(searchCatalog(catalog, 'zzzzqqq')).toHaveLength(0)
  })

  it('respects the kind filter', () => {
    const results = searchCatalog(catalog, 'andromeda', { kinds: ['constellation'] })
    expect(results.every((o) => o.kind === 'constellation')).toBe(true)
    expect(results[0]?.name).toBe('Andromeda')
  })

  it('restricts to the beginner set when asked', () => {
    // A limit well above the number of matches, so the counts compare honestly.
    const all = searchCatalog(catalog, 'ngc', { limit: 2000 })
    const beginner = searchCatalog(catalog, 'ngc', { limit: 2000, beginnerOnly: true })
    expect(beginner.length).toBeLessThan(all.length)
    expect(beginner.every((o) => o.beginner)).toBe(true)
  })

  it('honours the result limit', () => {
    expect(searchCatalog(catalog, 'a', { limit: 5 })).toHaveLength(5)
  })
})
