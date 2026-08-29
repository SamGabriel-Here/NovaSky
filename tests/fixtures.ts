import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCatalog, type Catalog } from '@shared/astro/catalog'
import type { GeoLocation } from '@shared/types'

const DATA_DIR = resolve(__dirname, '..', 'resources', 'data')
const read = (name: string): string => readFileSync(resolve(DATA_DIR, name), 'utf8')

let cached: Catalog | null = null

/** The real shipped catalogue. Parsed once and shared across the suite. */
export function testCatalog(): Catalog {
  cached ??= buildCatalog({
    stars: read('stars.json'),
    faintStars: read('stars-faint.json'),
    constellations: read('constellations.json'),
    deepSky: read('deepsky.json'),
    blackHoles: read('blackholes.json'),
    places: read('places.json'),
    manifest: read('manifest.json')
  })
  return cached
}

export const GREENWICH: GeoLocation = {
  latitude: 51.4779,
  longitude: -0.0015,
  elevation: 0,
  label: 'Royal Observatory, Greenwich',
  timeZone: 'Europe/London',
  source: 'manual'
}

export const INDORE: GeoLocation = {
  latitude: 22.7196,
  longitude: 75.8577,
  elevation: 550,
  label: 'Indore, India',
  timeZone: 'Asia/Kolkata',
  source: 'manual'
}

export const SYDNEY: GeoLocation = {
  latitude: -33.8688,
  longitude: 151.2093,
  elevation: 3,
  label: 'Sydney, Australia',
  timeZone: 'Australia/Sydney',
  source: 'manual'
}

export const TROMSO: GeoLocation = {
  latitude: 69.6496,
  longitude: 18.9560,
  elevation: 10,
  label: 'Tromsø, Norway',
  timeZone: 'Europe/Oslo',
  source: 'manual'
}
