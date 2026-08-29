/** Astronomical events across a chosen window, filtered by type and location. */
import { useMemo, useState, type JSX } from 'react'
import type { AstroEvent, AstroEventKind } from '@shared/types'
import { getEvents } from '@shared/astro/events'
import { EmptyState, SectionHeading } from '../components/ui'
import { Icon, type IconName } from '../components/Icon'
import { useAppStore } from '../state/useAppStore'
import { formatDateTime, formatRelative } from '../lib/format'

const KIND_META: Record<AstroEventKind, { label: string; icon: IconName; tone: string }> = {
  'lunar-eclipse': { label: 'Lunar eclipse', icon: 'tonight', tone: 'text-orange-300 border-orange-500/30 bg-orange-500/10' },
  'solar-eclipse': { label: 'Solar eclipse', icon: 'sky', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  'meteor-shower': { label: 'Meteor shower', icon: 'events', tone: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  conjunction: { label: 'Conjunction', icon: 'events', tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  elongation: { label: 'Elongation', icon: 'events', tone: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10' },
  opposition: { label: 'Opposition', icon: 'events', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  'moon-phase': { label: 'Moon phase', icon: 'tonight', tone: 'text-slate-300 border-slate-500/30 bg-slate-500/10' },
  solstice: { label: 'Solstice', icon: 'sky', tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
  equinox: { label: 'Equinox', icon: 'sky', tone: 'text-teal-300 border-teal-500/30 bg-teal-500/10' }
}

const RANGES = [
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 6 months', days: 182 },
  { label: 'Next year', days: 365 },
  { label: 'Next 3 years', days: 1095 }
] as const

const HIGHLIGHT_KINDS: AstroEventKind[] = [
  'meteor-shower',
  'lunar-eclipse',
  'solar-eclipse',
  'opposition',
  'elongation',
  'conjunction',
  'solstice',
  'equinox'
]

export function EventsScreen(): JSX.Element {
  const location = useAppStore((s) => s.settings.location)
  const time = useAppStore((s) => s.time)
  const select = useAppStore((s) => s.select)
  const setScreen = useAppStore((s) => s.setScreen)
  const setTime = useAppStore((s) => s.setTime)

  const [days, setDays] = useState<number>(182)
  const [kinds, setKinds] = useState<AstroEventKind[]>(HIGHLIGHT_KINDS)

  // Events for a whole year take a moment to compute, so anchor the search on the day
  // rather than the second and let the memo hold the result.
  const dayKey = Math.floor(time.getTime() / 86400000)
  const events = useMemo(() => {
    const from = new Date(dayKey * 86400000)
    try {
      return getEvents({
        from,
        to: new Date(from.getTime() + days * 86400000),
        location,
        kinds
      })
    } catch {
      return [] as AstroEvent[]
    }
  }, [dayKey, days, location, kinds])

  const toggleKind = (kind: AstroEventKind): void => {
    setKinds((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <SectionHeading
        title="Events"
        subtitle={`Calculated for ${location.label}. Eclipse visibility, meteor radiant altitude and rise times are all worked out for your coordinates.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="event-range" className="sr-only">
          Time range
        </label>
        <select
          id="event-range"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="field w-[150px] !py-1.5"
        >
          {RANGES.map((range) => (
            <option key={range.days} value={range.days}>
              {range.label}
            </option>
          ))}
        </select>

        {(Object.keys(KIND_META) as AstroEventKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => toggleKind(kind)}
            aria-pressed={kinds.includes(kind)}
            className={`rounded-full border px-3 py-1 text-xs ${
              kinds.includes(kind)
                ? KIND_META[kind].tone
                : 'border-space-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            {KIND_META[kind].label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon="events"
          title="No events in this window"
          description="Widen the range or turn more event types back on."
        />
      ) : (
        <ol className="space-y-2">
          {events.map((event) => {
            const meta = KIND_META[event.kind]
            return (
              <li key={event.id} className="panel p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`chip ${meta.tone}`}>
                    <Icon name={meta.icon} size={12} />
                    {meta.label}
                  </span>
                  <h3 className="text-base font-semibold text-slate-50">{event.title}</h3>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(event.time, location)} · {formatRelative(event.time, time)}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-slate-300">{event.description}</p>

                {event.localVisibility && (
                  <p className="mt-2 rounded-lg border border-space-700 bg-space-900/50 px-3 py-2 text-xs text-slate-300">
                    {event.localVisibility}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTime(new Date(event.time))
                      setScreen('sky')
                    }}
                    className="btn-ghost !py-1 !text-xs"
                  >
                    <Icon name="clock" size={13} />
                    Set the sky to this moment
                  </button>
                  {event.objectIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setTime(new Date(event.time))
                        select(id, { focus: true })
                        setScreen('sky')
                      }}
                      className="btn-ghost !py-1 !text-xs capitalize"
                    >
                      <Icon name="sky" size={13} />
                      Show {id}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        Eclipses, lunar phases, oppositions, elongations and the seasons are computed with
        astronomy-engine. Meteor shower radiants and activity levels come from the
        International Meteor Organization working list; each year's peak is solved from the
        shower's solar longitude, so the dates shift correctly from year to year.
      </p>
    </div>
  )
}
