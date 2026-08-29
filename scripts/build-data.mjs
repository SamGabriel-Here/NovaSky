/**
 * NovaSky offline data builder.
 *
 * Downloads the upstream astronomy catalogues once and reduces them to the compact
 * JSON files that ship inside the app (resources/data). Run with `npm run data:build`.
 *
 * Sources (all open data, see docs/DATA_SOURCES.md):
 *   - HYG v4.1  (Hipparcos/Yale/Gliese merge)  -> stars
 *   - d3-celestial constellation figures + names -> constellations
 *   - OpenNGC (Messier + NGC/IC)               -> deep-sky objects
 *
 * Nothing here invents values: every number written out is copied from a source
 * catalogue, and rows without a usable value are written as null.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// astronomy-engine's "exports" map points ESM consumers at a directory that has no
// own package.json, so a plain `import` fails from this .mjs script. The CommonJS
// build is identical and loads cleanly.
const Astronomy = createRequire(import.meta.url)('astronomy-engine')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, '.data-cache')
const OUT = path.join(ROOT, 'resources', 'data')

const SOURCES = {
  hyg: 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
  conLines: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json',
  conNames: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.json',
  ngc: 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv',
  // Non-NGC objects that the Messier catalogue still needs (M45 Pleiades, M40, ...).
  ngcAddendum: 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/addendum.csv',
  // IANA time-zone reference points: used to guess the observer's location from the
  // system time zone, and to back the "nearest city" location picker.
  tzMeta: 'https://raw.githubusercontent.com/moment/moment-timezone/develop/data/meta/latest.json',
  // Positions for the black-hole systems are queried live from SIMBAD's TAP service.
  simbadTap: 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
  // ESO GigaGalaxy Zoom all-sky panorama by Serge Brunier: a photographic mosaic of the
  // whole sky, equirectangular in galactic coordinates. CC BY 4.0.
  milkyWay: 'https://cdn.eso.org/images/publicationjpg/eso0932a.jpg'
}

/** Magnitude cut for the shipped star catalogue. 6.5 ~ naked-eye limit in dark skies. */
const STAR_MAG_LIMIT = 6.5
/**
 * Second, lighter catalogue of telescopic stars. These are never labelled, searched or
 * clicked. They exist so the Milky Way appears in the sky map as what it actually
 * is: the combined glow of tens of thousands of real stars along the galactic plane.
 */
const FAINT_STAR_MAG_LIMIT = 9.0
/** Deep-sky objects fainter than this are dropped unless they are Messier or named. */
const DSO_MAG_LIMIT = 11.5

async function download(url, file) {
  const dest = path.join(CACHE, file)
  try {
    const s = await stat(dest)
    if (s.size > 0) {
      console.log(`  cached  ${file} (${(s.size / 1e6).toFixed(1)} MB)`)
      return dest
    }
  } catch {
    /* not cached yet */
  }
  console.log(`  fetch   ${file} <- ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  await pipeline(res.body, createWriteStream(dest))
  return dest
}

/** Minimal RFC-4180 splitter: handles quoted fields containing commas. */
function splitCsvLine(line, sep = ',') {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const num = (v) => {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Round to `p` decimals, preserving null. */
const r = (v, p) => (v === null ? null : Number(v.toFixed(p)))

// ---------------------------------------------------------------- stars

async function buildStars() {
  const file = await download(SOURCES.hyg, 'hygdata_v41.csv')
  const text = await readFile(file, 'utf8')
  const lines = text.split('\n')
  const header = splitCsvLine(lines[0]).map((h) => h.replace(/"/g, ''))
  const col = Object.fromEntries(header.map((h, i) => [h, i]))

  const stars = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const f = splitCsvLine(line)
    const mag = num(f[col.mag])
    if (mag === null || mag > STAR_MAG_LIMIT) continue
    const id = num(f[col.id])
    if (id === 0) continue // Sol
    const ra = num(f[col.ra]) // hours, J2000
    const dec = num(f[col.dec]) // degrees, J2000
    if (ra === null || dec === null) continue

    // HYG stores "unknown parallax" as the sentinel distance 100000 pc.
    const distPc = num(f[col.dist])
    const dist = distPc !== null && distPc > 0 && distPc < 100000 ? distPc : null

    const proper = (f[col.proper] || '').trim()
    const bayer = (f[col.bayer] || '').trim()
    const flam = (f[col.flam] || '').trim()
    const con = (f[col.con] || '').trim()

    stars.push({
      i: id,
      h: num(f[col.hip]),
      n: proper || null,
      b: bayer || null,
      f: flam ? Number(flam) : null,
      k: con || null,
      r: r(ra, 5),
      d: r(dec, 5),
      m: r(mag, 2),
      c: r(num(f[col.ci]), 3),
      p: r(dist, 2),
      s: (f[col.spect] || '').trim() || null
    })
  }
  stars.sort((a, b) => a.m - b.m)
  await writeFile(path.join(OUT, 'stars.json'), JSON.stringify(stars))
  console.log(`  stars   ${stars.length} (mag <= ${STAR_MAG_LIMIT})`)
  return stars
}

/**
 * Faint stars, written as a flat number array `[ra, dec, mag, colourIndex, ...]`.
 * Keeping them out of the object model saves both file size and 75 000 pointless
 * JavaScript objects at start-up.
 */
async function buildFaintStars() {
  const file = await download(SOURCES.hyg, 'hygdata_v41.csv')
  const text = await readFile(file, 'utf8')
  const lines = text.split('\n')
  const header = splitCsvLine(lines[0]).map((h) => h.replace(/"/g, ''))
  const col = Object.fromEntries(header.map((h, i) => [h, i]))

  const flat = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue
    const f = splitCsvLine(lines[i])
    const mag = num(f[col.mag])
    if (mag === null || mag <= STAR_MAG_LIMIT || mag > FAINT_STAR_MAG_LIMIT) continue
    const ra = num(f[col.ra])
    const dec = num(f[col.dec])
    if (ra === null || dec === null) continue
    flat.push(r(ra, 4), r(dec, 4), r(mag, 2), r(num(f[col.ci]) ?? 0.65, 2))
  }
  await writeFile(path.join(OUT, 'stars-faint.json'), JSON.stringify(flat))
  console.log(`  faint   ${flat.length / 4} telescopic stars (mag ${STAR_MAG_LIMIT}-${FAINT_STAR_MAG_LIMIT})`)
  return flat.length / 4
}

// -------------------------------------------------------- constellations

/** d3-celestial stores RA in degrees on -180..180; NovaSky uses hours on 0..24. */
const raDegToHours = (deg) => {
  let d = deg % 360
  if (d < 0) d += 360
  return d / 15
}

async function buildConstellations() {
  const linesFile = await download(SOURCES.conLines, 'constellations.lines.json')
  const namesFile = await download(SOURCES.conNames, 'constellations.json')
  const lineFc = JSON.parse(await readFile(linesFile, 'utf8'))
  const nameFc = JSON.parse(await readFile(namesFile, 'utf8'))

  const byId = new Map()
  for (const feat of nameFc.features) {
    const p = feat.properties || {}
    const [raDeg, dec] = feat.geometry?.coordinates ?? [0, 0]
    byId.set(feat.id, {
      id: feat.id,
      name: p.name || feat.id,
      genitive: p.gen || null,
      rank: Number(p.rank || 3),
      center: [r(raDegToHours(raDeg), 4), r(dec, 3)],
      lines: []
    })
  }
  for (const feat of lineFc.features) {
    const entry = byId.get(feat.id)
    if (!entry) continue
    const segs = feat.geometry?.coordinates ?? []
    entry.lines = segs.map((seg) => seg.map(([raDeg, dec]) => [r(raDegToHours(raDeg), 4), r(dec, 3)]))
  }
  const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  await writeFile(path.join(OUT, 'constellations.json'), JSON.stringify(list))
  const withLines = list.filter((c) => c.lines.length).length
  console.log(`  const.  ${list.length} (${withLines} with figures)`)
  return list
}

// ------------------------------------------------------------ deep sky

/** OpenNGC object-type codes -> NovaSky categories. */
const DSO_TYPE = {
  G: 'galaxy', GPair: 'galaxy', GTrpl: 'galaxy', GGroup: 'galaxy',
  PN: 'planetary-nebula', OCl: 'open-cluster', GCl: 'globular-cluster',
  'Cl+N': 'cluster-nebula', HII: 'nebula', DrkN: 'dark-nebula',
  EmN: 'nebula', Neb: 'nebula', RfN: 'nebula', SNR: 'supernova-remnant',
  Star: 'star', '**': 'double-star', '*Ass': 'association', Other: 'asterism'
}

/** "HH:MM:SS.s" -> decimal hours. */
function parseRa(s) {
  const m = /^(\d+):(\d+):([\d.]+)$/.exec((s || '').trim())
  if (!m) return null
  return Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600
}
/** "+DD:MM:SS.s" -> decimal degrees. */
function parseDec(s) {
  const m = /^([+-])(\d+):(\d+):([\d.]+)$/.exec((s || '').trim())
  if (!m) return null
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600
  return m[1] === '-' ? -v : v
}

async function buildDeepSky() {
  const file = await download(SOURCES.ngc, 'NGC.csv')
  const addFile = await download(SOURCES.ngcAddendum, 'addendum.csv')
  const text = await readFile(file, 'utf8')
  const addText = await readFile(addFile, 'utf8')
  const header = text.split('\n')[0].split(';')
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
  // Both files share the same column layout; drop the addendum's header row.
  const rows = text.split('\n').concat(addText.split('\n').slice(1))

  const out = []
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue
    const f = splitCsvLine(rows[i], ';')
    const rawType = (f[col.Type] || '').trim()
    if (rawType === 'Dup' || rawType === 'NonEx') continue
    const type = DSO_TYPE[rawType]
    if (!type) continue

    const ra = parseRa(f[col.RA])
    const dec = parseDec(f[col.Dec])
    if (ra === null || dec === null) continue

    const vmag = num(f[col['V-Mag']])
    const bmag = num(f[col['B-Mag']])
    const mag = vmag ?? bmag
    const messier = num(f[col.M])
    const common = (f[col['Common names']] || '').trim()

    // Keep everything Messier or named; otherwise apply the brightness cut.
    if (messier === null && !common && (mag === null || mag > DSO_MAG_LIMIT)) continue

    const name = (f[col.Name] || '').trim()
    out.push({
      id: name,
      m: messier === null ? null : messier,
      names: common ? common.split(',').map((s) => s.trim()).filter(Boolean) : [],
      t: type,
      rawType,
      k: (f[col.Const] || '').trim() || null,
      r: r(ra, 5),
      d: r(dec, 5),
      v: r(mag, 2),
      size: r(num(f[col.MajAx]), 2), // major axis, arcminutes
      minor: r(num(f[col.MinAx]), 2), // minor axis, arcminutes
      angle: r(num(f[col.PosAng]), 1) // position angle of the major axis, degrees
    })
  }
  // Messier objects first, then by brightness, which keeps the search list sensible.
  out.sort((a, b) => {
    if ((a.m === null) !== (b.m === null)) return a.m === null ? 1 : -1
    if (a.m !== null && b.m !== null) return a.m - b.m
    return (a.v ?? 99) - (b.v ?? 99)
  })
  await writeFile(path.join(OUT, 'deepsky.json'), JSON.stringify(out))
  const messierCount = out.filter((o) => o.m !== null).length
  console.log(`  dso     ${out.length} (${messierCount} Messier entries)`)
  return out
}

// ------------------------------------------------------------- imagery

/**
 * The all-sky photograph used as the sky-map background.
 *
 * This is the one bundled asset that is imagery rather than measurements, so the app
 * labels it as such. It is 4000x2000, equirectangular, in galactic coordinates:
 * longitude across, latitude down, with the galactic centre in the middle. The renderer
 * converts each view direction to galactic coordinates with astronomy-engine and
 * samples it directly, so no assumption about alignment is baked into the file.
 */
async function buildSkyImage() {
  const file = await download(SOURCES.milkyWay, 'eso0932a.jpg')
  const bytes = await readFile(file)
  await writeFile(path.join(OUT, 'milkyway.jpg'), bytes)
  console.log(`  imagery ESO all-sky panorama (${(bytes.length / 1e6).toFixed(1)} MB)`)
  return bytes.length
}

// --------------------------------------------------------- black holes

/**
 * Black holes are not a catalogue you can download whole. The confirmed ones are a
 * short, well-studied list. NovaSky ships that list, with every position and magnitude
 * queried from SIMBAD at build time so no coordinate is ever hand-entered.
 *
 * `id` is the SIMBAD identifier used for the lookup; `name` is what NovaSky displays.
 */
const BLACK_HOLES = [
  // --- stellar-mass, in the Milky Way and its satellites ---
  { query: 'X Cyg X-1', name: 'Cygnus X-1', aliases: ['HDE 226868', 'V1357 Cygni'], category: 'stellar' },
  { query: 'V* V404 Cyg', name: 'V404 Cygni', aliases: ['GS 2023+338'], category: 'stellar' },
  { query: 'GRO J1655-40', name: 'GRO J1655-40', aliases: ['V1033 Scorpii'], category: 'stellar' },
  { query: 'V* V616 Mon', name: 'A0620-00', aliases: ['V616 Monocerotis'], category: 'stellar' },
  { query: 'Granat 1915+105', name: 'GRS 1915+105', aliases: ['V1487 Aquilae'], category: 'stellar' },
  { query: 'XTE J1118+480', name: 'XTE J1118+480', aliases: ['KV Ursae Majoris'], category: 'stellar' },
  { query: 'GX 339-04', name: 'GX 339-4', aliases: ['V821 Arae'], category: 'stellar' },
  { query: 'MAXI J1820+070', name: 'MAXI J1820+070', aliases: ['ASASSN-18ey'], category: 'stellar' },
  { query: 'X LMC X-1', name: 'LMC X-1', aliases: [], category: 'stellar' },
  { query: 'X LMC X-3', name: 'LMC X-3', aliases: [], category: 'stellar' },
  { query: 'SS 433', name: 'SS 433', aliases: ['V1343 Aquilae'], category: 'stellar' },
  { query: 'Gaia DR3 4373465352415301632', name: 'Gaia BH1', aliases: [], category: 'stellar' },
  // --- supermassive ---
  { query: 'NAME Sgr A*', name: 'Sagittarius A*', aliases: ['Sgr A*'], category: 'supermassive' },
  { query: 'M 87', name: 'M87*', aliases: ['Messier 87 black hole', 'Virgo A'], category: 'supermassive' },
  { query: '3C 273', name: '3C 273', aliases: [], category: 'supermassive' },
  { query: 'OHIO J 287', name: 'OJ 287', aliases: [], category: 'supermassive' },
  { query: 'Ton  618', name: 'TON 618', aliases: [], category: 'supermassive' }
]

async function querySimbad(identifiers) {
  const list = identifiers.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ')
  const query = `SELECT b.main_id, b.ra, b.dec, b.otype_txt, f.V, i.id AS query_id
                 FROM basic b
                 JOIN ident i ON i.oidref = b.oid
                 LEFT JOIN allfluxes f ON f.oidref = b.oid
                 WHERE i.id IN (${list})`
  const body = new URLSearchParams({
    request: 'doQuery',
    lang: 'adql',
    format: 'csv',
    maxrec: '500',
    query
  })
  const res = await fetch(SOURCES.simbadTap, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  if (!res.ok) throw new Error(`SIMBAD TAP responded ${res.status}`)
  const text = await res.text()
  const rows = text.split(/\r?\n/).filter(Boolean)
  const header = splitCsvLine(rows[0]).map((h) => h.trim())
  const col = Object.fromEntries(header.map((h, i) => [h, i]))
  return rows.slice(1).map((line) => {
    const f = splitCsvLine(line).map((v) => v.replace(/^"|"$/g, ''))
    return {
      mainId: f[col.main_id],
      ra: num(f[col.ra]),
      dec: num(f[col.dec]),
      otype: f[col.otype_txt],
      v: num(f[col.V]),
      queryId: f[col.query_id]
    }
  })
}

async function buildBlackHoles() {
  const cacheFile = path.join(CACHE, 'blackholes-simbad.json')
  let rows
  try {
    rows = JSON.parse(await readFile(cacheFile, 'utf8'))
    console.log(`  cached  blackholes-simbad.json`)
  } catch {
    console.log('  query   SIMBAD TAP for black-hole positions')
    rows = await querySimbad(BLACK_HOLES.map((b) => b.query))
    await writeFile(cacheFile, JSON.stringify(rows, null, 2))
  }

  // SIMBAD normalises whitespace in identifiers, so match on a squashed form.
  const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const byQuery = new Map(rows.map((r) => [squash(r.queryId), r]))

  const out = []
  const missing = []
  for (const entry of BLACK_HOLES) {
    const row = byQuery.get(squash(entry.query))
    if (!row || row.ra === null || row.dec === null) {
      missing.push(entry.name)
      continue
    }
    const raHours = row.ra / 15
    out.push({
      id: entry.name.replace(/[^A-Za-z0-9+-]/g, '_'),
      name: entry.name,
      aliases: [...new Set([...entry.aliases, row.mainId].filter(Boolean))],
      category: entry.category,
      simbadId: row.mainId,
      otype: row.otype,
      k: Astronomy.Constellation(raHours, row.dec).symbol,
      r: r(raHours, 5),
      d: r(row.dec, 5),
      // Optical magnitude of the *system*, since a black hole itself emits no light.
      v: r(row.v, 2)
    })
  }
  if (missing.length > 0) console.log(`  note    no SIMBAD match for: ${missing.join(', ')}`)
  out.sort((a, b) => a.name.localeCompare(b.name))
  await writeFile(path.join(OUT, 'blackholes.json'), JSON.stringify(out))
  console.log(`  holes   ${out.length} black-hole systems (positions from SIMBAD)`)
  return out
}

// -------------------------------------------------------------- places

async function buildPlaces() {
  const file = await download(SOURCES.tzMeta, 'tz-meta.json')
  const meta = JSON.parse(await readFile(file, 'utf8'))
  const countryName = Object.fromEntries(
    Object.values(meta.countries).map((c) => [c.abbr, c.name])
  )
  const places = Object.values(meta.zones)
    .map((z) => ({
      tz: z.name,
      // Zone ids are "Area/City"; the last segment is the reference city.
      city: z.name.split('/').pop().replace(/_/g, ' '),
      country: countryName[z.countries?.[0]] ?? null,
      lat: r(z.lat, 4),
      lon: r(z.long, 4)
    }))
    .sort((a, b) => a.city.localeCompare(b.city))
  await writeFile(path.join(OUT, 'places.json'), JSON.stringify(places))
  console.log(`  places  ${places.length} time-zone reference cities`)
  return places
}

// ---------------------------------------------------------------- main

async function main() {
  await mkdir(CACHE, { recursive: true })
  await mkdir(OUT, { recursive: true })
  console.log('NovaSky data build')
  const stars = await buildStars()
  const faintStarCount = await buildFaintStars()
  const cons = await buildConstellations()
  const dso = await buildDeepSky()
  const blackHoles = await buildBlackHoles()
  const skyImageBytes = await buildSkyImage()
  const places = await buildPlaces()
  const manifest = {
    generatedAt: new Date().toISOString(),
    starMagnitudeLimit: STAR_MAG_LIMIT,
    faintStarMagnitudeLimit: FAINT_STAR_MAG_LIMIT,
    dsoMagnitudeLimit: DSO_MAG_LIMIT,
    counts: {
      stars: stars.length,
      faintStars: faintStarCount,
      constellations: cons.length,
      deepSky: dso.length,
      blackHoles: blackHoles.length,
      skyImageBytes,
      places: places.length
    },
    sources: SOURCES
  }
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(
    '  wrote   resources/data/{stars,stars-faint,constellations,deepsky,blackholes,places,manifest}.json + milkyway.jpg'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
