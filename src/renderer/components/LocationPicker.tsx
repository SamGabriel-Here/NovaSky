/**
 * Location entry.
 *
 * NovaSky never asks the operating system for GPS. The starting guess comes from the
 * system time zone, which the app already knows, and the user can search a bundled
 * list of time-zone reference cities or type coordinates directly. The chosen location
 * is stored locally and never leaves the machine.
 */
import { useMemo, useState, type JSX } from 'react'
import type { GeoLocation } from '@shared/types'
import type { RawPlace } from '@shared/astro/catalog'
import { Icon } from './Icon'
import { useAppStore } from '../state/useAppStore'

/** Closest bundled reference city to a time zone, used for the first-run guess. */
export function placeForTimeZone(places: RawPlace[], timeZone: string): RawPlace | null {
  return places.find((p) => p.tz === timeZone) ?? null
}

export function locationFromPlace(place: RawPlace, elevation = 0): GeoLocation {
  return {
    latitude: place.lat,
    longitude: place.lon,
    elevation,
    label: place.country ? `${place.city}, ${place.country}` : place.city,
    timeZone: place.tz,
    source: 'manual'
  }
}

export function LocationPicker(): JSX.Element {
  const catalog = useAppStore((s) => s.catalog)
  const location = useAppStore((s) => s.settings.location)
  const systemTimeZone = useAppStore((s) => s.systemTimeZone)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const showToast = useAppStore((s) => s.showToast)

  const [query, setQuery] = useState('')
  const [latitude, setLatitude] = useState(String(location.latitude))
  const [longitude, setLongitude] = useState(String(location.longitude))
  const [elevation, setElevation] = useState(String(location.elevation))
  const [manualError, setManualError] = useState<string | null>(null)

  const places = catalog?.places ?? []

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return places
      .filter(
        (p) =>
          p.city.toLowerCase().includes(needle) ||
          (p.country?.toLowerCase().includes(needle) ?? false) ||
          p.tz.toLowerCase().includes(needle)
      )
      .slice(0, 8)
  }, [places, query])

  const systemPlace = useMemo(() => placeForTimeZone(places, systemTimeZone), [places, systemTimeZone])

  const applyManual = (): void => {
    const lat = Number(latitude)
    const lon = Number(longitude)
    const alt = Number(elevation)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setManualError('Latitude must be a number between -90 and 90.')
      return
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setManualError('Longitude must be a number between -180 and 180.')
      return
    }
    if (!Number.isFinite(alt)) {
      setManualError('Elevation must be a number, in metres.')
      return
    }
    setManualError(null)
    void updateSettings({
      location: {
        latitude: lat,
        longitude: lon,
        elevation: alt,
        label: `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`,
        timeZone: location.timeZone,
        source: 'manual'
      }
    })
    showToast('Location updated.')
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="location-search" className="panel-heading mb-1 block">
          Find your nearest city
        </label>
        <input
          id="location-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing a city, country or time zone…"
          className="field"
        />
        {matches.length > 0 && (
          <ul className="mt-2 space-y-1">
            {matches.map((place) => (
              <li key={place.tz}>
                <button
                  type="button"
                  onClick={() => {
                    void updateSettings({ location: locationFromPlace(place, location.elevation) })
                    setQuery('')
                    setLatitude(String(place.lat))
                    setLongitude(String(place.lon))
                    showToast(`Observing from ${place.city}.`)
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-space-700 bg-space-900/60 px-3 py-2 text-left text-sm hover:border-nova-500"
                >
                  <span>
                    <span className="text-slate-100">{place.city}</span>
                    {place.country && <span className="text-slate-500"> · {place.country}</span>}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {place.lat.toFixed(2)}, {place.lon.toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {systemPlace && (
        <button
          type="button"
          onClick={() => {
            void updateSettings({
              location: { ...locationFromPlace(systemPlace), source: 'system' }
            })
            showToast(`Using your system time zone: ${systemTimeZone}.`)
          }}
          className="btn-ghost w-full justify-start"
        >
          <Icon name="location" size={15} className="text-nova-400" />
          Use my system time zone ({systemTimeZone})
        </button>
      )}

      <div>
        <p className="panel-heading mb-2">Or enter coordinates</p>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-xs text-slate-400">
            Latitude
            <input
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              inputMode="decimal"
              className="field mt-1"
              aria-label="Latitude in degrees"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Longitude
            <input
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              inputMode="decimal"
              className="field mt-1"
              aria-label="Longitude in degrees"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Elevation (m)
            <input
              value={elevation}
              onChange={(event) => setElevation(event.target.value)}
              inputMode="decimal"
              className="field mt-1"
              aria-label="Elevation in metres"
            />
          </label>
        </div>
        {manualError && (
          <p role="alert" className="mt-2 text-xs text-rose-300">
            {manualError}
          </p>
        )}
        <button type="button" onClick={applyManual} className="btn-primary mt-2">
          Use these coordinates
        </button>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Your location is stored on this computer only. NovaSky has no account system and
        never uploads it. Positive latitude is north, positive longitude is east.
      </p>
    </div>
  )
}
