/**
 * Sky imagery.
 *
 * Two kinds, kept clearly apart because they have different provenance:
 *
 *  - The all-sky panorama that ships with the app (ESO GigaGalaxy Zoom, CC BY 4.0).
 *    Local, always available, `origin: 'catalog'`.
 *  - Per-object survey cutouts fetched on demand from CDS, with NASA SkyView as a
 *    fallback. Network-dependent, cached locally, `origin: 'live' | 'cached'`.
 *
 * Both are *imagery*, not measurements, and the UI labels them that way. Nothing here
 * is ever used to derive a position, a magnitude or a time.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ObjectImage } from '../shared/types'
import { catalogDirectory } from './catalog'
import type { Store } from './store'

const SKY_IMAGE_FILE = 'milkyway.jpg'
const FETCH_TIMEOUT_MS = 25000
/** Cutout resolution. 512 is a good balance of detail against download size. */
const CUTOUT_PIXELS = 512

let skyImageCache: Buffer | null = null

/** The bundled all-sky panorama, or null when the data build has not been run. */
export function readSkyImage(): Buffer | null {
  if (skyImageCache) return skyImageCache
  const file = path.join(catalogDirectory(), SKY_IMAGE_FILE)
  if (!existsSync(file)) return null
  skyImageCache = readFileSync(file)
  return skyImageCache
}

export interface ObjectImageRequest {
  objectId: string
  /** J2000 position, degrees. */
  raDegrees: number
  decDegrees: number
  /** Field of view of the cutout, degrees. */
  fovDegrees: number
}

/**
 * CDS hips2fits, serving the DSS2 colour HiPS. Gnomonic (TAN) projection, north up and
 * east left, which is the orientation the renderer's mesh assumes.
 */
function cdsUrl({ raDegrees, decDegrees, fovDegrees }: ObjectImageRequest): string {
  const params = new URLSearchParams({
    hips: 'CDS/P/DSS2/color',
    width: String(CUTOUT_PIXELS),
    height: String(CUTOUT_PIXELS),
    fov: fovDegrees.toFixed(4),
    projection: 'TAN',
    coordsys: 'icrs',
    ra: raDegrees.toFixed(6),
    dec: decDegrees.toFixed(6),
    format: 'jpg'
  })
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params.toString()}`
}

/** NASA SkyView, used only if CDS is unreachable. Same orientation convention. */
function skyViewUrl({ raDegrees, decDegrees, fovDegrees }: ObjectImageRequest): string {
  const params = new URLSearchParams({
    position: `${raDegrees.toFixed(6)},${decDegrees.toFixed(6)}`,
    survey: 'DSS',
    size: fovDegrees.toFixed(4),
    pixels: String(CUTOUT_PIXELS),
    return: 'JPEG'
  })
  return `https://skyview.gsfc.nasa.gov/current/cgi/pskcall?${params.toString()}`
}

/** Cutouts are cached per object and per field of view, rounded to keep keys stable. */
function cacheKey(request: ObjectImageRequest): string {
  return `image:${request.objectId}:${request.fovDegrees.toFixed(2)}`
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    // A few hundred bytes means an error page rendered as an image, not a sky cutout.
    return buffer.byteLength > 2000 ? buffer : null
  } catch {
    return null
  }
}

/**
 * A survey cutout for one object, preferring the local cache and falling back to it
 * when the network is unavailable. Never throws: an absent image is a normal outcome
 * and the sky map simply keeps its computed rendering.
 */
export async function getObjectImage(
  store: Store,
  request: ObjectImageRequest,
  options: { allowNetwork: boolean }
): Promise<ObjectImage> {
  const key = cacheKey(request)
  const cached = store.getCache(key)

  if (cached) {
    return {
      objectId: request.objectId,
      fovDegrees: request.fovDegrees,
      data: cached.value,
      origin: 'cached',
      fetchedAt: cached.fetchedAt,
      source: 'DSS2 colour (cached)',
      warning: null
    }
  }

  if (!options.allowNetwork) {
    return {
      objectId: request.objectId,
      fovDegrees: request.fovDegrees,
      data: null,
      origin: 'cached',
      fetchedAt: null,
      source: null,
      warning: 'Network access is turned off in Settings, so survey imagery cannot be downloaded.'
    }
  }

  let buffer = await download(cdsUrl(request))
  let source = 'DSS2 colour, CDS/Aladin'
  if (!buffer) {
    buffer = await download(skyViewUrl(request))
    source = 'DSS, NASA SkyView'
  }

  if (!buffer) {
    return {
      objectId: request.objectId,
      fovDegrees: request.fovDegrees,
      data: null,
      origin: 'cached',
      fetchedAt: null,
      source: null,
      warning: 'Could not reach the sky survey services. The computed rendering is being shown instead.'
    }
  }

  const encoded = buffer.toString('base64')
  store.putCache(key, encoded)
  return {
    objectId: request.objectId,
    fovDegrees: request.fovDegrees,
    data: encoded,
    origin: 'live',
    fetchedAt: new Date().toISOString(),
    source,
    warning: null
  }
}
