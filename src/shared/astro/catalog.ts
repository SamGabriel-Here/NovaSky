/**
 * Catalogue loading, normalisation and search.
 *
 * The raw JSON in `resources/data` is deliberately terse (single-letter keys) to keep
 * the shipped files small. This module turns it into the {@link SkyObject} model the
 * rest of the app works with, and builds the search index behind the global search bar.
 */
import type { DeepSkyType, Distance, ObjectKind, SkyObject } from '../types'
import { BEGINNER_CONSTELLATIONS } from './lore'

/** One row of `stars.json`. */
export interface RawStar {
  i: number
  h: number | null
  n: string | null
  b: string | null
  f: number | null
  k: string | null
  r: number
  d: number
  m: number
  c: number | null
  p: number | null
  s: string | null
}

/** One row of `constellations.json`. */
export interface RawConstellation {
  id: string
  name: string
  genitive: string | null
  rank: number
  center: [number, number]
  lines: [number, number][][]
}

/** One row of `deepsky.json`. */
export interface RawDeepSky {
  id: string
  m: number | null
  names: string[]
  t: DeepSkyType
  rawType: string
  k: string | null
  r: number
  d: number
  v: number | null
  /** Major axis, arcminutes. */
  size: number | null
  /** Minor axis, arcminutes. */
  minor: number | null
  /** Position angle of the major axis, degrees east of north. */
  angle: number | null
}

/** One row of `blackholes.json`. Positions come from SIMBAD (see scripts/build-data.mjs). */
export interface RawBlackHole {
  id: string
  name: string
  aliases: string[]
  category: 'stellar' | 'supermassive'
  simbadId: string
  otype: string
  k: string | null
  r: number
  d: number
  /** Optical magnitude of the *system*; a black hole itself emits no light. */
  v: number | null
}

export interface RawPlace {
  tz: string
  city: string
  country: string | null
  lat: number
  lon: number
}

export interface CatalogManifest {
  generatedAt: string
  starMagnitudeLimit: number
  faintStarMagnitudeLimit: number
  dsoMagnitudeLimit: number
  counts: Record<string, number>
  sources: Record<string, string>
}

const GREEK: Record<string, string> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ',
  Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π',
  Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω'
}

const GREEK_NAME: Record<string, string> = {
  Alp: 'Alpha', Bet: 'Beta', Gam: 'Gamma', Del: 'Delta', Eps: 'Epsilon', Zet: 'Zeta',
  Eta: 'Eta', The: 'Theta', Iot: 'Iota', Kap: 'Kappa', Lam: 'Lambda', Mu: 'Mu',
  Nu: 'Nu', Xi: 'Xi', Omi: 'Omicron', Pi: 'Pi', Rho: 'Rho', Sig: 'Sigma',
  Tau: 'Tau', Ups: 'Upsilon', Phi: 'Phi', Chi: 'Chi', Psi: 'Psi', Ome: 'Omega'
}

/** Parses HYG Bayer codes such as "Alp" or "Tau-3" into a symbol and a spelled-out name. */
export function parseBayer(code: string | null): { symbol: string; name: string } | null {
  if (!code) return null
  const [letter, index] = code.split('-')
  const symbol = GREEK[letter]
  if (!symbol) return null
  const suffix = index ? `${index}` : ''
  return {
    symbol: suffix ? `${symbol}${suffix}` : symbol,
    name: suffix ? `${GREEK_NAME[letter]}-${suffix}` : GREEK_NAME[letter]
  }
}

/** Parsecs to a display-ready light-year distance. */
function parsecsToDistance(pc: number | null): Distance | null {
  if (pc === null || !Number.isFinite(pc) || pc <= 0) return null
  const ly = pc * 3.2615637769
  return { value: Number(ly.toFixed(ly < 100 ? 2 : 0)), unit: 'ly', origin: 'catalog' }
}

export const DEEP_SKY_LABEL: Record<DeepSkyType, string> = {
  galaxy: 'Galaxy',
  'planetary-nebula': 'Planetary nebula',
  'open-cluster': 'Open cluster',
  'globular-cluster': 'Globular cluster',
  'cluster-nebula': 'Cluster with nebulosity',
  nebula: 'Nebula',
  'dark-nebula': 'Dark nebula',
  'supernova-remnant': 'Supernova remnant',
  star: 'Star',
  'double-star': 'Double star',
  association: 'Stellar association',
  asterism: 'Asterism'
}

/** Solar-System bodies NovaSky tracks, in order of distance from the Sun. */
export const SOLAR_SYSTEM: { id: string; name: string; body: string; kind: ObjectKind }[] = [
  { id: 'sun', name: 'Sun', body: 'Sun', kind: 'sun' },
  { id: 'moon', name: 'Moon', body: 'Moon', kind: 'moon' },
  { id: 'mercury', name: 'Mercury', body: 'Mercury', kind: 'planet' },
  { id: 'venus', name: 'Venus', body: 'Venus', kind: 'planet' },
  { id: 'mars', name: 'Mars', body: 'Mars', kind: 'planet' },
  { id: 'jupiter', name: 'Jupiter', body: 'Jupiter', kind: 'planet' },
  { id: 'saturn', name: 'Saturn', body: 'Saturn', kind: 'planet' },
  { id: 'uranus', name: 'Uranus', body: 'Uranus', kind: 'planet' },
  { id: 'neptune', name: 'Neptune', body: 'Neptune', kind: 'planet' },
  { id: 'pluto', name: 'Pluto', body: 'Pluto', kind: 'planet' }
]

/** Beginner mode keeps naked-eye stars only. */
const BEGINNER_STAR_MAGNITUDE = 3.0

export function starToSkyObject(raw: RawStar, constellationName?: string): SkyObject {
  const bayer = parseBayer(raw.b)
  const genitive = constellationName ?? raw.k ?? ''
  const designation = bayer && genitive ? `${bayer.symbol} ${genitive}` : null
  const flamsteed = raw.f && genitive ? `${raw.f} ${genitive}` : null

  const aliases: string[] = []
  if (designation) aliases.push(designation)
  if (bayer && genitive) {
    aliases.push(`${bayer.name} ${genitive}`)
    // Components are catalogued as "Alp-1"/"Alp-2"; people search for "Alpha Centauri".
    const base = bayer.name.split('-')[0]
    if (base !== bayer.name) {
      aliases.push(`${base} ${genitive}`, `${bayer.symbol.replace(/[0-9]+$/, '')} ${genitive}`)
    }
  }
  if (flamsteed) aliases.push(flamsteed)
  if (raw.h) aliases.push(`HIP ${raw.h}`)

  return {
    id: `star:${raw.i}`,
    name: raw.n ?? designation ?? flamsteed ?? (raw.h ? `HIP ${raw.h}` : `HYG ${raw.i}`),
    kind: 'star',
    aliases: [...new Set(aliases)],
    magnitude: raw.m,
    ra: raw.r,
    dec: raw.d,
    constellation: raw.k,
    distance: parsecsToDistance(raw.p),
    subtype: raw.s,
    sizeArcmin: null,
    beginner: raw.m <= BEGINNER_STAR_MAGNITUDE
  }
}

export function deepSkyToSkyObject(raw: RawDeepSky): SkyObject {
  const messier = raw.m !== null ? `M${raw.m}` : null
  const primary = messier ?? raw.id
  const aliases = [raw.id, ...raw.names]
  if (messier) aliases.push(`Messier ${raw.m}`, messier)
  // "NGC1952" also reads naturally as "NGC 1952".
  // OpenNGC zero-pads its ids ("NGC0224"); people type "NGC 224" or "ngc224".
  const parts = /^(NGC|IC|Mel|Cr)(\d+)([A-Za-z]*)$/i.exec(raw.id)
  if (parts) {
    const prefix = parts[1].toUpperCase()
    const number = String(Number(parts[2]))
    const suffix = parts[3] ?? ''
    aliases.push(`${prefix} ${number}${suffix}`, `${prefix}${number}${suffix}`)
  }

  return {
    id: `dso:${raw.id}`,
    name: raw.names[0] ?? primary,
    kind: 'deep-sky',
    aliases: [...new Set(aliases.filter(Boolean))],
    magnitude: raw.v,
    ra: raw.r,
    dec: raw.d,
    constellation: raw.k,
    distance: null, // OpenNGC has no distance column; shown as "not catalogued".
    subtype: DEEP_SKY_LABEL[raw.t] ?? raw.rawType,
    sizeArcmin: raw.size,
    // Messier objects are the classic beginner list.
    beginner: raw.m !== null
  }
}

export function blackHoleToSkyObject(raw: RawBlackHole): SkyObject {
  return {
    id: `bh:${raw.id}`,
    name: raw.name,
    kind: 'black-hole',
    aliases: [...new Set([...raw.aliases, raw.simbadId, 'black hole'])],
    // The magnitude belongs to the companion star or host galaxy, never to the black
    // hole, so it is carried but always presented with that caveat.
    magnitude: raw.v,
    ra: raw.r,
    dec: raw.d,
    constellation: raw.k,
    distance: null,
    subtype:
      raw.category === 'supermassive' ? 'Supermassive black hole' : 'Stellar-mass black hole',
    sizeArcmin: null,
    // Famous enough to be worth keeping in the simplified sky.
    beginner: true
  }
}

export function constellationToSkyObject(raw: RawConstellation): SkyObject {
  return {
    id: `con:${raw.id}`,
    name: raw.name,
    kind: 'constellation',
    aliases: [raw.id, raw.genitive ?? ''].filter(Boolean),
    magnitude: null,
    ra: raw.center[0],
    dec: raw.center[1],
    constellation: raw.id,
    distance: null,
    subtype: 'Constellation',
    sizeArcmin: null,
    beginner: BEGINNER_CONSTELLATIONS.has(raw.id)
  }
}

export function solarSystemToSkyObject(entry: (typeof SOLAR_SYSTEM)[number]): SkyObject {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    aliases: [],
    magnitude: null, // varies; computed per instant
    ra: null,
    dec: null,
    constellation: null,
    distance: null,
    subtype:
      entry.kind === 'planet'
        ? entry.id === 'pluto'
          ? 'Dwarf planet'
          : 'Planet'
        : entry.kind === 'moon'
          ? 'Natural satellite'
          : 'Star (our own)',
    sizeArcmin: null,
    // Beginner mode keeps the bodies you can actually pick out without help.
    beginner: !['uranus', 'neptune', 'pluto'].includes(entry.id),
    body: entry.body
  }
}

export interface Catalog {
  stars: RawStar[]
  /**
   * Flat `[ra, dec, mag, colourIndex, ...]` for the telescopic stars that make up the
   * Milky Way glow. Never searched or selected — purely a rendering layer.
   */
  faintStars: Float32Array
  constellations: RawConstellation[]
  deepSky: RawDeepSky[]
  blackHoles: RawBlackHole[]
  places: RawPlace[]
  manifest: CatalogManifest
  /** Every searchable object, keyed by id. */
  objects: Map<string, SkyObject>
  /** Constellation abbreviation -> full name. */
  constellationNames: Map<string, string>
  constellationById: Map<string, RawConstellation>
}

export interface CatalogSource {
  stars: string
  faintStars: string
  constellations: string
  deepSky: string
  blackHoles: string
  places: string
  manifest: string
}

export function buildCatalog(source: CatalogSource): Catalog {
  const stars = JSON.parse(source.stars) as RawStar[]
  const faintStars = Float32Array.from(JSON.parse(source.faintStars) as number[])
  const constellations = JSON.parse(source.constellations) as RawConstellation[]
  const deepSky = JSON.parse(source.deepSky) as RawDeepSky[]
  const blackHoles = JSON.parse(source.blackHoles) as RawBlackHole[]
  const places = JSON.parse(source.places) as RawPlace[]
  const manifest = JSON.parse(source.manifest) as CatalogManifest

  const constellationNames = new Map(constellations.map((c) => [c.id, c.name]))
  const constellationById = new Map(constellations.map((c) => [c.id, c]))
  const genitives = new Map(constellations.map((c) => [c.id, c.genitive ?? c.name]))

  const objects = new Map<string, SkyObject>()
  for (const entry of SOLAR_SYSTEM) {
    const obj = solarSystemToSkyObject(entry)
    objects.set(obj.id, obj)
  }
  for (const c of constellations) {
    const obj = constellationToSkyObject(c)
    objects.set(obj.id, obj)
  }
  for (const s of stars) {
    const obj = starToSkyObject(s, s.k ? genitives.get(s.k) : undefined)
    objects.set(obj.id, obj)
  }
  for (const d of deepSky) {
    const obj = deepSkyToSkyObject(d)
    objects.set(obj.id, obj)
  }
  for (const b of blackHoles) {
    const obj = blackHoleToSkyObject(b)
    objects.set(obj.id, obj)
  }

  return {
    stars,
    faintStars,
    constellations,
    deepSky,
    blackHoles,
    places,
    manifest,
    objects,
    constellationNames,
    constellationById
  }
}

// ------------------------------------------------------------------ search

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    // Strip combining diacritics so "Bo\u00f6tes" matches "bootes".
    .replace(/[\u0300-\u036f]/g, '')
    // Keep latin letters, digits, spaces and the Greek letters used by Bayer names.
    .replace(/[^a-z0-9\u03b1-\u03c9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** "m31" and "ngc224" should match "M 31" / "NGC 224" and vice versa. */
const collapse = (s: string): string => normalize(s).replace(/ /g, '')

export interface SearchOptions {
  limit?: number
  kinds?: ObjectKind[]
  /** Restrict to the reduced beginner set. */
  beginnerOnly?: boolean
}

interface Scored {
  object: SkyObject
  score: number
}

/** Higher is better. Prefix and exact matches beat substring matches; bright beats faint. */
function scoreObject(object: SkyObject, query: string, collapsedQuery: string): number {
  const haystack = [object.name, ...object.aliases]
  let best = 0
  for (const raw of haystack) {
    const value = normalize(raw)
    if (!value) continue
    let score = 0
    if (value === query) score = 1000
    else if (value.startsWith(query)) score = 700 - Math.min(value.length - query.length, 40)
    else if (value.includes(` ${query}`)) score = 500
    else if (value.includes(query)) score = 300
    else if (collapse(raw) === collapsedQuery) score = 900
    else if (collapse(raw).startsWith(collapsedQuery)) score = 600
    if (score > best) best = score
  }
  if (best === 0) return 0

  // Tie-breakers: named objects and bright objects first.
  let bonus = 0
  if (object.kind === 'planet' || object.kind === 'moon' || object.kind === 'sun') bonus += 120
  if (object.kind === 'constellation') bonus += 60
  if (object.kind === 'black-hole') bonus += 100
  if (object.magnitude !== null) bonus += Math.max(0, 40 - object.magnitude * 4)
  if (object.kind === 'deep-sky' && object.id.startsWith('dso:M')) bonus += 20
  return best + bonus
}

export function searchCatalog(
  catalog: Catalog,
  rawQuery: string,
  options: SearchOptions = {}
): SkyObject[] {
  const query = normalize(rawQuery)
  if (query.length === 0) return []
  const collapsedQuery = collapse(rawQuery)
  const limit = options.limit ?? 30
  const kinds = options.kinds ? new Set(options.kinds) : null

  const results: Scored[] = []
  for (const object of catalog.objects.values()) {
    if (kinds && !kinds.has(object.kind)) continue
    if (options.beginnerOnly && !object.beginner) continue
    const score = scoreObject(object, query, collapsedQuery)
    if (score > 0) results.push({ object, score })
  }
  results.sort((a, b) => b.score - a.score || a.object.name.localeCompare(b.object.name))
  return results.slice(0, limit).map((r) => r.object)
}
