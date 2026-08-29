/**
 * Hooks that run the astronomy calculations for the UI.
 *
 * Rise/set searches are not free, so results are memoised on the object, the observer
 * and the sky time rounded to the minute. That is fine enough that nothing visibly
 * lags behind the clock, coarse enough that a one-second tick does not redo the work.
 */
import { useMemo } from 'react'
import type { GeoLocation, ObjectSnapshot } from '@shared/types'
import { buildSnapshot, getDarkWindow, type DarkWindow } from '@shared/astro/ephemeris'
import { buildTonightPlan, type TonightPlan } from '@shared/astro/tonight'
import { useAppStore } from './useAppStore'

const minuteKey = (date: Date): number => Math.floor(date.getTime() / 60000)
const locationKey = (location: GeoLocation): string =>
  `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)},${location.elevation}`

export function useSnapshot(objectId: string | null): ObjectSnapshot | null {
  const catalog = useAppStore((s) => s.catalog)
  const time = useAppStore((s) => s.time)
  const location = useAppStore((s) => s.settings.location)

  const key = `${objectId}|${minuteKey(time)}|${locationKey(location)}`
  return useMemo(() => {
    if (!catalog || !objectId) return null
    const object = catalog.objects.get(objectId)
    if (!object) return null
    try {
      return buildSnapshot(object, time, location, catalog)
    } catch {
      return null
    }
    // The key captures every input; `time` itself changes every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalog])
}

export function useDarkWindow(): DarkWindow | null {
  const time = useAppStore((s) => s.time)
  const location = useAppStore((s) => s.settings.location)
  const key = `${Math.floor(time.getTime() / 3600000)}|${locationKey(location)}`
  return useMemo(() => {
    try {
      return getDarkWindow(time, location)
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

export function useTonightPlan(): TonightPlan | null {
  const catalog = useAppStore((s) => s.catalog)
  const time = useAppStore((s) => s.time)
  const location = useAppStore((s) => s.settings.location)
  const beginnerMode = useAppStore((s) => s.settings.beginnerMode)

  // The plan describes a whole night, so it only needs rebuilding every 15 minutes.
  const key = `${Math.floor(time.getTime() / 900000)}|${locationKey(location)}|${beginnerMode}`
  return useMemo(() => {
    if (!catalog) return null
    try {
      return buildTonightPlan(catalog, time, location, { beginnerMode })
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalog])
}
