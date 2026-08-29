/** Date, time and value formatting. Everything is rendered in the observer's time zone. */
import type { GeoLocation, VisibilityState } from '@shared/types'

export function formatTime(iso: string | Date | null, location: GeoLocation): string {
  if (!iso) return '—'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: location.timeZone
  }).format(date)
}

export function formatDate(iso: string | Date | null, location: GeoLocation): string {
  if (!iso) return '—'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: location.timeZone
  }).format(date)
}

export function formatDateTime(iso: string | Date | null, location: GeoLocation): string {
  if (!iso) return '—'
  return `${formatDate(iso, location)}, ${formatTime(iso, location)}`
}

/** "in 3 days" / "2 hours ago" */
export function formatRelative(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const seconds = (date.getTime() - now.getTime()) / 1000
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(Math.round(seconds), 'second')
}

/** The offset label shown next to the clock, e.g. "GMT+5:30". */
export function timeZoneLabel(location: GeoLocation, date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: location.timeZone,
      timeZoneName: 'shortOffset'
    }).formatToParts(date)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? location.timeZone
  } catch {
    return location.timeZone
  }
}

export function formatMagnitude(magnitude: number | null): string {
  return magnitude === null ? 'Not catalogued' : magnitude.toFixed(2)
}

export const VISIBILITY_LABEL: Record<VisibilityState, string> = {
  visible: 'Visible now',
  daylight: 'Up, but in daylight',
  twilight: 'Up in twilight',
  'below-horizon': 'Below the horizon',
  'too-faint': 'Up, but too faint for the eye',
  unknown: 'Unknown'
}

export const VISIBILITY_TONE: Record<VisibilityState, string> = {
  visible: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  daylight: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  twilight: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  'below-horizon': 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  'too-faint': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/30'
}

/** ISO string suitable for `<input type="datetime-local">` in the observer's zone. */
export function toLocalInputValue(date: Date, location: GeoLocation): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: location.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00'
  // Some locales' hourCycle renders midnight as "24"; normalise it.
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const hour = get('hour') === 24 ? 0 : get('hour')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return asUtc - date.getTime()
}

/**
 * Inverse of {@link toLocalInputValue}: interprets "YYYY-MM-DDTHH:mm" as wall-clock
 * time in the observer's zone and returns the corresponding instant.
 */
export function fromLocalInputValue(value: string, location: GeoLocation): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)
  // Correct by the zone offset, then refine once in case the first guess landed on
  // the far side of a daylight-saving transition.
  const firstPass = new Date(utcGuess - zoneOffsetMs(new Date(utcGuess), location.timeZone))
  const refined = new Date(utcGuess - zoneOffsetMs(firstPass, location.timeZone))
  return Number.isNaN(refined.getTime()) ? null : refined
}
