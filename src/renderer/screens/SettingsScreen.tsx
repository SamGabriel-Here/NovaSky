/** Location, display, notifications, offline data and privacy controls. */
import { useEffect, useState, type JSX } from 'react'
import type { AstroEventKind } from '@shared/types'
import { LocationPicker } from '../components/LocationPicker'
import { Icon } from '../components/Icon'
import { SectionHeading, Toggle, Tooltip } from '../components/ui'
import { useAppStore } from '../state/useAppStore'
import { formatRelative } from '../lib/format'

const NOTIFICATION_KINDS: { id: AstroEventKind; label: string }[] = [
  { id: 'meteor-shower', label: 'Meteor showers' },
  { id: 'lunar-eclipse', label: 'Lunar eclipses' },
  { id: 'solar-eclipse', label: 'Solar eclipses' },
  { id: 'opposition', label: 'Planetary oppositions' },
  { id: 'elongation', label: 'Mercury and Venus elongations' },
  { id: 'conjunction', label: 'Conjunctions' },
  { id: 'moon-phase', label: 'Moon phases' },
  { id: 'solstice', label: 'Solstices and equinoxes' }
]

export function SettingsScreen(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const clearData = useAppStore((s) => s.clearData)
  const catalog = useAppStore((s) => s.catalog)
  const storeBackend = useAppStore((s) => s.storeBackend)
  const appVersion = useAppStore((s) => s.appVersion)
  const platform = useAppStore((s) => s.platform)
  const tle = useAppStore((s) => s.tle)
  const refreshTle = useAppStore((s) => s.refreshTle)
  const reopenOnboarding = useAppStore((s) => s.reopenOnboarding)
  const showToast = useAppStore((s) => s.showToast)

  const [confirmClear, setConfirmClear] = useState(false)
  const [scheduledCount, setScheduledCount] = useState<number | null>(null)

  useEffect(() => {
    if (!settings.notificationsEnabled) {
      setScheduledCount(null)
      return
    }
    void window.novasky.scheduledNotifications().then((events) => setScheduledCount(events.length))
  }, [settings.notificationsEnabled, settings.notificationKinds, settings.location])

  const setNotifications = async (enabled: boolean): Promise<void> => {
    const next = await window.novasky.enableNotifications(enabled)
    useAppStore.setState({ settings: next })
  }

  const toggleKind = (kind: AstroEventKind): void => {
    const current = settings.notificationKinds
    void updateSettings({
      notificationKinds: current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind]
    })
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <SectionHeading title="Settings" subtitle="Everything here is stored on this computer." />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-50">Location</h2>
          <p className="mb-3 rounded-lg border border-space-700 bg-space-900/50 px-3 py-2 text-xs text-slate-300">
            Currently observing from <strong className="text-slate-100">{settings.location.label}</strong> ·{' '}
            {settings.location.latitude.toFixed(3)}°, {settings.location.longitude.toFixed(3)}° ·{' '}
            {settings.location.elevation} m · {settings.location.timeZone}
          </p>
          <LocationPicker />
        </section>

        <section className="panel p-4">
          <h2 className="mb-1 text-base font-semibold text-slate-50">Sky map</h2>
          <div className="divide-y divide-space-700/50">
            <Toggle
              checked={settings.beginnerMode}
              onChange={(value) => void updateSettings({ beginnerMode: value })}
              label="Beginner mode"
              description="Major constellations and bright stars only. Overrides the display options below while it is on. Shortcut: B."
            />
            <Toggle
              checked={settings.showConstellationLines}
              onChange={(value) => void updateSettings({ showConstellationLines: value })}
              label="Constellation lines"
            />
            <Toggle
              checked={settings.showConstellationLabels}
              onChange={(value) => void updateSettings({ showConstellationLabels: value })}
              label="Constellation names"
            />
            <Toggle
              checked={settings.showStarLabels}
              onChange={(value) => void updateSettings({ showStarLabels: value })}
              label="Star names"
            />
            <Toggle
              checked={settings.showDeepSky}
              onChange={(value) => void updateSettings({ showDeepSky: value })}
              label="Deep-sky objects"
              description="Nebulae, clusters and galaxies, drawn at their catalogued angular size, shape and orientation."
            />
            <Toggle
              checked={settings.showBlackHoles}
              onChange={(value) => void updateSettings({ showBlackHoles: value })}
              label="Black holes"
              description="Confirmed black holes and strong candidates, with positions from SIMBAD. Nothing is visible at the eyepiece; the marker just shows where they are."
            />
            <Toggle
              checked={settings.showMilkyWay}
              onChange={(value) => void updateSettings({ showMilkyWay: value })}
              label="Milky Way"
              description="Adds 74 000 telescopic stars. The band you see is their real density along the galactic plane, not a painted texture."
            />
            <Toggle
              checked={settings.showSkyImagery}
              onChange={(value) => void updateSettings({ showSkyImagery: value })}
              label="Photographic sky"
              description="The ESO GigaGalaxy Zoom all-sky panorama behind the computed sky. Bundled with the app, so it works offline."
            />
            <Toggle
              checked={settings.showObjectImagery}
              onChange={(value) => void updateSettings({ showObjectImagery: value })}
              label="Deep-sky survey photos"
              description="Zooming in on a selected deep-sky object loads a real image of it from the DSS survey, placed at its true position and orientation. Downloaded once, then cached."
            />
            <Toggle
              checked={settings.showHorizon}
              onChange={(value) => void updateSettings({ showHorizon: value })}
              label="Horizon and compass points"
            />
            <Toggle
              checked={settings.showGrid}
              onChange={(value) => void updateSettings({ showGrid: value })}
              label="Altitude and azimuth grid"
            />
          </div>

          <label className="mt-3 block">
            <span className="flex items-center justify-between text-sm text-slate-200">
              Faintest stars shown
              <span className="font-mono text-xs text-slate-400">
                magnitude {settings.starMagnitudeLimit.toFixed(1)}
              </span>
            </span>
            <input
              type="range"
              min={1}
              max={6.5}
              step={0.5}
              value={settings.starMagnitudeLimit}
              onChange={(event) => void updateSettings({ starMagnitudeLimit: Number(event.target.value) })}
              className="mt-2 w-full accent-nova-500"
              aria-label="Faintest star magnitude to display"
            />
            <span className="mt-1 block text-xs text-slate-500">
              The unaided eye reaches about magnitude 6 under a truly dark sky, and about 4 in a
              suburb. The catalogue goes to {catalog?.manifest.starMagnitudeLimit ?? 6.5}.
            </span>
          </label>
        </section>

        <section className="panel p-4">
          <h2 className="mb-1 text-base font-semibold text-slate-50">Notifications</h2>
          <div className="divide-y divide-space-700/50">
            <Toggle
              checked={settings.notificationsEnabled}
              onChange={(value) => void setNotifications(value)}
              label="Desktop notifications"
              description="NovaSky asks your operating system to show a notification an hour before each selected event. Off by default."
            />
          </div>

          {settings.notificationsEnabled && (
            <>
              <p className="mb-2 mt-3 panel-heading">Notify me about</p>
              <div className="flex flex-wrap gap-1.5">
                {NOTIFICATION_KINDS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    onClick={() => toggleKind(kind.id)}
                    aria-pressed={settings.notificationKinds.includes(kind.id)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      settings.notificationKinds.includes(kind.id)
                        ? 'border-nova-500/50 bg-nova-500/15 text-nova-200'
                        : 'border-space-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
              {scheduledCount !== null && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                  <Icon name="bell" size={13} />
                  {scheduledCount} event{scheduledCount === 1 ? '' : 's'} scheduled over the next week.
                </p>
              )}
            </>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-1 text-base font-semibold text-slate-50">Data and privacy</h2>
          <div className="divide-y divide-space-700/50">
            <Toggle
              checked={settings.allowNetwork}
              onChange={(value) => void updateSettings({ allowNetwork: value })}
              label="Allow network access"
              description="Only used to download satellite orbital elements from CelesTrak. Everything else works offline from the bundled catalogues."
            />
            <Toggle
              checked={settings.showSatellites}
              onChange={(value) => {
                void updateSettings({ showSatellites: value })
                if (value) void refreshTle()
              }}
              label="Track satellites"
              disabled={!settings.allowNetwork}
            />
          </div>

          <div className="mt-3 space-y-1.5 rounded-lg border border-space-700 bg-space-900/50 px-3 py-2.5 text-xs text-slate-400">
            <p className="flex items-center justify-between">
              <span>Offline catalogue</span>
              <span className="text-slate-300">
                {catalog
                  ? `${catalog.stars.length.toLocaleString()} stars · ${catalog.constellations.length} constellations · ${catalog.deepSky.length.toLocaleString()} deep-sky`
                  : '—'}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span>Catalogue built</span>
              <span className="text-slate-300">
                {catalog ? formatRelative(catalog.manifest.generatedAt) : '—'}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span>Satellite elements</span>
              <span className="text-slate-300">
                {tle && tle.records.length > 0
                  ? `${tle.records.length} objects · ${tle.origin} · ${formatRelative(tle.fetchedAt)}`
                  : 'Not downloaded'}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span>Local store</span>
              <span className="text-slate-300">
                {storeBackend === 'sqlite' ? 'SQLite database' : 'JSON file (SQLite unavailable)'}
              </span>
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void clearData('cache')
                showToast('Cached downloads cleared.')
              }}
              className="btn-ghost !py-1.5 !text-xs"
            >
              Clear cached downloads
            </button>
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="btn-ghost !py-1.5 !text-xs !border-rose-500/40 !text-rose-300"
              >
                Erase all local data…
              </button>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-xs text-rose-300">
                  This deletes your location, settings and progress.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void clearData('all')
                    setConfirmClear(false)
                  }}
                  className="btn !bg-rose-500 !py-1.5 !text-xs !text-white"
                >
                  Erase everything
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="btn-ghost !py-1.5 !text-xs"
                >
                  Cancel
                </button>
              </span>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Imagery credits: all-sky panorama © ESO/S. Brunier, CC BY 4.0. Deep-sky
            photographs from the Digitized Sky Survey, served by CDS/Aladin and NASA
            SkyView.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            NovaSky has no account system and no telemetry. Your location, settings and learning
            progress live only in the app's data folder on this machine.
          </p>
        </section>

        <section className="panel p-4 xl:col-span-2">
          <h2 className="mb-2 text-base font-semibold text-slate-50">Keyboard shortcuts</h2>
          <ul className="grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['T', 'Open the Time Machine'],
              ['S', 'Focus search'],
              ['B', 'Toggle beginner mode'],
              ['F', 'Toggle fullscreen'],
              ['Esc', 'Close panels'],
              ['Arrow keys', 'Look around the sky'],
              ['+ / −', 'Zoom in and out'],
              ['0', 'Reset the view']
            ].map(([key, description]) => (
              <li key={key} className="flex items-center gap-2">
                <kbd className="min-w-[64px] rounded border border-space-600 bg-space-900 px-2 py-0.5 text-center font-mono text-xs">
                  {key}
                </kbd>
                <span className="text-slate-400">{description}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-space-700/50 pt-3 text-xs text-slate-500">
            <span>
              NovaSky {appVersion} · {platform}
            </span>
            <button type="button" onClick={reopenOnboarding} className="text-nova-300 hover:text-nova-200">
              Replay the introduction
            </button>
            <Tooltip label="Star positions: HYG v4.1 (Hipparcos/Yale/Gliese). Deep sky: OpenNGC. Constellation figures: d3-celestial. Black holes: SIMBAD. Ephemeris: astronomy-engine. Satellites: CelesTrak. All-sky photograph: ESO/S. Brunier (CC BY 4.0). Deep-sky photographs: Digitized Sky Survey via CDS/Aladin and NASA SkyView.">
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Icon name="info" size={13} />
                Data sources
              </span>
            </Tooltip>
          </div>
        </section>
      </div>
    </div>
  )
}
