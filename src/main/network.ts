/**
 * The only part of NovaSky that touches the network.
 *
 * Satellite positions are the one thing that genuinely cannot be computed offline,
 * because orbital elements decay and have to be refreshed. Everything else in the app works
 * from the bundled catalogues. Fetching is skipped entirely when the user turns
 * `allowNetwork` off in Settings.
 */
import type { NetworkStatus, TleBundle } from '../shared/types'
import { parseTle, tleWarning } from '../shared/astro/satellites'
import type { Store } from './store'

/** CelesTrak's "visual" group: the satellites bright enough to see with the eye. */
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle'
const CACHE_KEY = 'tle:visual'
const FETCH_TIMEOUT_MS = 12000
/** Do not re-download more than once an hour; TLEs are not updated faster than that. */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000

let lastStatus: NetworkStatus = { online: false, lastCheckedAt: new Date(0).toISOString() }

export function getNetworkStatus(): NetworkStatus {
  return lastStatus
}

function setStatus(online: boolean): NetworkStatus {
  lastStatus = { online, lastCheckedAt: new Date().toISOString() }
  return lastStatus
}

function bundleFromCache(store: Store): TleBundle | null {
  const entry = store.getCache(CACHE_KEY)
  if (!entry) return null
  const records = parseTle(entry.value)
  if (records.length === 0) return null
  const bundle: TleBundle = {
    records,
    fetchedAt: entry.fetchedAt,
    origin: 'cached',
    warning: null
  }
  bundle.warning = tleWarning(bundle)
  return bundle
}

/**
 * Returns orbital elements, preferring a fresh download and falling back to the cache.
 * The result always says which one it is, so the UI can label live vs cached vs absent.
 */
export async function getTleBundle(
  store: Store,
  options: { allowNetwork: boolean; force?: boolean } = { allowNetwork: true }
): Promise<TleBundle> {
  const cached = bundleFromCache(store)

  if (!options.allowNetwork) {
    return (
      cached ?? {
        records: [],
        fetchedAt: new Date(0).toISOString(),
        origin: 'cached',
        warning: 'Network access is turned off in Settings, so satellite positions are unavailable.'
      }
    )
  }

  const cacheAge = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Infinity
  if (cached && !options.force && cacheAge < REFRESH_INTERVAL_MS) return cached

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const response = await fetch(TLE_URL, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`CelesTrak responded ${response.status}`)

    const text = await response.text()
    const records = parseTle(text)
    if (records.length === 0) throw new Error('CelesTrak returned no usable elements')

    store.putCache(CACHE_KEY, text)
    setStatus(true)
    return { records, fetchedAt: new Date().toISOString(), origin: 'live', warning: null }
  } catch (error) {
    setStatus(false)
    if (cached) {
      return {
        ...cached,
        warning:
          tleWarning(cached) ??
          'Could not reach CelesTrak, so satellite positions come from the last download.'
      }
    }
    return {
      records: [],
      fetchedAt: new Date(0).toISOString(),
      origin: 'cached',
      warning: `Satellite tracking is unavailable offline and no elements have been downloaded yet (${
        error instanceof Error ? error.message : 'unknown error'
      }).`
    }
  }
}
