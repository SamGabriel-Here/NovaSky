/**
 * "Visible Tonight": what is actually worth going outside for, from this location.
 *
 * Every entry is evaluated inside tonight's dark window, so an object that is up all
 * day but sets before nightfall never makes the list.
 */
import { useEffect, type JSX } from 'react'
import type { TonightEntry } from '@shared/astro/tonight'
import { azimuthToCardinal, formatDegrees } from '@shared/astro/coords'
import { predictPasses } from '@shared/astro/satellites'
import { useMemo } from 'react'
import { EmptyState, LoadingState, SectionHeading, Tooltip } from '../components/ui'
import { Icon } from '../components/Icon'
import { useAppStore } from '../state/useAppStore'
import { useTonightPlan } from '../state/useSnapshot'
import { formatDateTime, formatRelative, formatTime } from '../lib/format'

function EntryRow({ entry }: { entry: TonightEntry }): JSX.Element {
  const location = useAppStore((s) => s.settings.location)
  const select = useAppStore((s) => s.select)
  const setScreen = useAppStore((s) => s.setScreen)

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          select(entry.object.id, { focus: true })
          setScreen('sky')
        }}
        className="flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left hover:border-space-700 hover:bg-space-850/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-100">
            {entry.object.name}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{entry.note}</span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            <span>Best {formatTime(entry.bestTime, location)}</span>
            <span>
              {formatDegrees(entry.bestAltitude)} up in the {azimuthToCardinal(entry.bestAzimuth)}
            </span>
            {entry.riseSet.circumpolar ? (
              <span>Never sets</span>
            ) : (
              <>
                {entry.riseSet.rise && <span>Rises {formatTime(entry.riseSet.rise, location)}</span>}
                {entry.riseSet.set && <span>Sets {formatTime(entry.riseSet.set, location)}</span>}
              </>
            )}
          </span>
        </span>
        <Icon name="chevron-right" size={16} className="mt-1 shrink-0 text-slate-600" />
      </button>
    </li>
  )
}

function Section({
  title,
  hint,
  entries,
  empty
}: {
  title: string
  hint: string
  entries: TonightEntry[]
  empty: string
}): JSX.Element {
  return (
    <section className="panel p-3">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <h3 className="panel-heading">{title}</h3>
        <Tooltip label={hint}>
          <Icon name="info" size={12} className="text-slate-600" />
        </Tooltip>
      </div>
      {entries.length === 0 ? (
        <p className="px-1 py-3 text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((entry) => (
            <EntryRow key={entry.object.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  )
}

function SatellitePasses(): JSX.Element {
  const tle = useAppStore((s) => s.tle)
  const tleLoading = useAppStore((s) => s.tleLoading)
  const refreshTle = useAppStore((s) => s.refreshTle)
  const location = useAppStore((s) => s.settings.location)
  const time = useAppStore((s) => s.time)

  useEffect(() => {
    if (!tle && !tleLoading) void refreshTle()
  }, [tle, tleLoading, refreshTle])

  const passes = useMemo(() => {
    if (!tle || tle.records.length === 0) return []
    // The station is the one satellite almost everyone can pick out by eye.
    const iss = tle.records.find((r) => r.noradId === 25544)
    if (!iss) return []
    return predictPasses(iss, time, location, tle.origin, {
      hours: 24,
      visibleOnly: true,
      minAltitude: 15
    }).slice(0, 5)
  }, [tle, location, time])

  return (
    <section className="panel p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="panel-heading">ISS passes</h3>
        <button
          type="button"
          onClick={() => void refreshTle(true)}
          className="text-[11px] text-nova-300 hover:text-nova-200"
        >
          Refresh elements
        </button>
      </div>

      {tleLoading && <LoadingState label="Downloading orbital elements…" />}

      {!tleLoading && tle?.warning && (
        <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {tle.warning}
        </p>
      )}

      {!tleLoading && tle && tle.records.length > 0 && (
        <p className="mb-2 px-1 text-[11px] text-slate-500">
          Elements {tle.origin === 'live' ? 'downloaded' : 'cached'} {formatRelative(tle.fetchedAt)} from
          CelesTrak.
        </p>
      )}

      {!tleLoading && passes.length === 0 ? (
        <p className="px-1 py-2 text-xs text-slate-500">
          No sunlit passes above 15° in the next 24 hours from this location.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {passes.map((pass) => (
            <li
              key={pass.rise}
              className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-space-850/60"
            >
              <p className="text-sm text-slate-100">{formatDateTime(pass.rise, location)}</p>
              <p className="mt-0.5 text-slate-400">
                Rises in the {azimuthToCardinal(pass.riseAzimuth)}, peaks at{' '}
                {formatDegrees(pass.maxAltitude)} at {formatTime(pass.culminate, location)}, sets in the{' '}
                {azimuthToCardinal(pass.setAzimuth)} at {formatTime(pass.set, location)}.
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function TonightScreen(): JSX.Element {
  const plan = useTonightPlan()
  const location = useAppStore((s) => s.settings.location)
  const time = useAppStore((s) => s.time)
  const showSatellites = useAppStore((s) => s.settings.showSatellites)
  const setScreen = useAppStore((s) => s.setScreen)

  if (!plan) return <LoadingState label="Working out tonight's sky…" />

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <SectionHeading
        title="Visible tonight"
        subtitle={`From ${location.label}. Everything below is checked against tonight's dark window.`}
      />

      {plan.warning && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {plan.warning}
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel px-3 py-2.5">
          <p className="panel-heading">Sunset</p>
          <p className="mt-1 text-lg text-slate-100">{formatTime(plan.window.sunset, location)}</p>
        </div>
        <div className="panel px-3 py-2.5">
          <p className="panel-heading">Full dark</p>
          <p className="mt-1 text-lg text-slate-100">{formatTime(plan.window.darkStart, location)}</p>
        </div>
        <div className="panel px-3 py-2.5">
          <p className="panel-heading">Dawn</p>
          <p className="mt-1 text-lg text-slate-100">{formatTime(plan.window.darkEnd, location)}</p>
        </div>
        <div className="panel px-3 py-2.5">
          <p className="panel-heading">Moon</p>
          <p className="mt-1 text-sm leading-snug text-slate-200">{plan.moonNote}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Planets"
          hint="Planets above 5° at their best moment tonight, brightest first."
          entries={plan.planets}
          empty="No planets are above the horizon during tonight's dark hours."
        />
        <Section
          title="Bright stars"
          hint="Stars brighter than magnitude 2.2 that climb at least 15° above the horizon."
          entries={plan.stars}
          empty="No bright stars clear the horizon tonight."
        />
        <Section
          title="Constellations"
          hint="Constellations whose centre reaches at least 25° — high enough to trace the whole figure."
          entries={plan.constellations}
          empty="Nothing is well placed tonight."
        />
        <Section
          title="Deep sky"
          hint="Clusters, nebulae and galaxies reaching 30° or more. Most need binoculars or a small telescope."
          entries={plan.deepSky}
          empty="No recommended deep-sky targets clear 30° tonight."
        />

        {showSatellites ? (
          <SatellitePasses />
        ) : (
          <section className="panel p-3">
            <h3 className="panel-heading mb-2 px-1">ISS passes</h3>
            <p className="px-1 text-xs text-slate-500">
              Satellite tracking is turned off. Enable the Satellites layer on the Sky screen
              or in Settings to download orbital elements and see pass predictions.
            </p>
          </section>
        )}

        <section className="panel p-3">
          <h3 className="panel-heading mb-2 px-1">Coming up</h3>
          {plan.events.length === 0 ? (
            <EmptyState title="Nothing notable in the next month" />
          ) : (
            <ul className="space-y-0.5">
              {plan.events.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setScreen('events')}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-space-850/60"
                  >
                    <p className="text-sm text-slate-100">{event.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(event.time, location)} · {formatRelative(event.time, time)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
