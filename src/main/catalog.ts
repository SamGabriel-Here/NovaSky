/**
 * Reads the offline catalogues from disk.
 *
 * In development the files sit in `resources/data` next to the source. In a packaged
 * build electron-builder copies them to `process.resourcesPath/data` (see
 * electron-builder.yml). Either way they are on the local disk, which is what makes
 * the sky map, search and Visible Tonight work with no network at all.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { CatalogPayload } from '../shared/types'

const FILES = {
  stars: 'stars.json',
  faintStars: 'stars-faint.json',
  constellations: 'constellations.json',
  deepSky: 'deepsky.json',
  blackHoles: 'blackholes.json',
  places: 'places.json',
  manifest: 'manifest.json'
} as const

export function catalogDirectory(): string {
  // Escape hatch for tooling and for pointing a build at a custom catalogue.
  const override = process.env.NOVASKY_DATA_DIR
  if (override) return override
  const packaged = path.join(process.resourcesPath, 'data')
  if (app.isPackaged || existsSync(packaged)) return packaged
  return path.join(app.getAppPath(), 'resources', 'data')
}

let cached: CatalogPayload | null = null

/**
 * Loads the catalogues as raw JSON text. Parsing happens in the renderer so the main
 * process never holds a second copy of the 8 900-star array.
 */
export function loadCatalog(): CatalogPayload {
  if (cached) return cached
  const directory = catalogDirectory()
  const missing = Object.values(FILES).filter((f) => !existsSync(path.join(directory, f)))
  if (missing.length > 0) {
    throw new Error(
      `Missing catalogue files in ${directory}: ${missing.join(', ')}. Run "npm run data:build" to download them.`
    )
  }
  cached = {
    stars: readFileSync(path.join(directory, FILES.stars), 'utf8'),
    faintStars: readFileSync(path.join(directory, FILES.faintStars), 'utf8'),
    constellations: readFileSync(path.join(directory, FILES.constellations), 'utf8'),
    deepSky: readFileSync(path.join(directory, FILES.deepSky), 'utf8'),
    blackHoles: readFileSync(path.join(directory, FILES.blackHoles), 'utf8'),
    places: readFileSync(path.join(directory, FILES.places), 'utf8'),
    manifest: readFileSync(path.join(directory, FILES.manifest), 'utf8')
  }
  return cached
}
