/**
 * Zen mode: the window is the sky, and you aim with a crosshair instead of a cursor.
 *
 * Nothing here is a panel over the map. The reticle sits at the centre, the name of
 * whatever it is pointing at appears just beneath it, and committing to a target opens
 * one compact card. Everything else fades out of the way.
 */
import { useEffect, useState, type JSX } from 'react'
import { azimuthToCardinal, formatDegrees } from '@shared/astro/coords'
import { formatDistance } from '@shared/astro/ephemeris'
import { useAppStore } from '../state/useAppStore'
import { useSnapshot } from '../state/useSnapshot'
import { formatTime, VISIBILITY_LABEL } from '../lib/format'

/** How long the help line stays up before it gets out of the way. */
const HINT_VISIBLE_MS = 6000

function Reticle({ locked }: { locked: boolean }): JSX.Element {
  const colour = locked ? 'rgb(122 169 255)' : 'rgb(226 232 240)'
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      aria-hidden="true"
      className="transition-opacity duration-200"
      style={{ opacity: locked ? 1 : 0.75 }}
    >
      {/* Four ticks and a gap in the middle, so the reticle never hides its target. */}
      <g stroke={colour} strokeWidth="1.25" strokeLinecap="round">
        <line x1="36" y1="10" x2="36" y2="24" />
        <line x1="36" y1="48" x2="36" y2="62" />
        <line x1="10" y1="36" x2="24" y2="36" />
        <line x1="48" y1="36" x2="62" y2="36" />
      </g>
      <circle
        cx="36"
        cy="36"
        r="15"
        fill="none"
        stroke={colour}
        strokeWidth="1"
        strokeDasharray={locked ? '0' : '3 5'}
        opacity={locked ? 0.9 : 0.5}
      />
      <circle cx="36" cy="36" r="1.4" fill={colour} />
    </svg>
  )
}

export function ZenMode(): JSX.Element | null {
  const zenMode = useAppStore((s) => s.zenMode)
  const aimedId = useAppStore((s) => s.aimedId)
  const selectedId = useAppStore((s) => s.selectedId)
  const getObject = useAppStore((s) => s.getObject)
  const location = useAppStore((s) => s.settings.location)
  const time = useAppStore((s) => s.time)
  const snapshot = useSnapshot(selectedId)

  const [hintVisible, setHintVisible] = useState(true)

  useEffect(() => {
    if (!zenMode) return
    setHintVisible(true)
    const timer = setTimeout(() => setHintVisible(false), HINT_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [zenMode])

  if (!zenMode) return null

  const aimed = aimedId ? getObject(aimedId) : null
  const locked = Boolean(selectedId)

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Crosshair, dead centre. */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <Reticle locked={locked} />
        {aimed && !locked && (
          <p className="mt-1 text-center text-[13px] font-medium tracking-wide text-slate-100 [text-shadow:0_0_8px_rgb(4_6_15/90%)]">
            {aimed.name}
            <span className="ml-2 text-[11px] font-normal text-slate-400">{aimed.subtype}</span>
          </p>
        )}
        {!aimed && !locked && (
          <p className="mt-1 text-[11px] text-slate-500 [text-shadow:0_0_8px_rgb(4_6_15/90%)]">
            nothing under the crosshair
          </p>
        )}
      </div>

      {/* One compact card for the object you committed to. */}
      {locked && snapshot && (
        <div className="pointer-events-auto absolute bottom-10 left-1/2 w-[min(520px,calc(100%-4rem))] -translate-x-1/2 rounded-xl border border-space-700/70 bg-space-950/85 px-4 py-3 backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate text-lg font-semibold text-slate-50">
              {snapshot.object.name}
            </h2>
            <span className="shrink-0 text-xs text-slate-400">{snapshot.object.subtype}</span>
          </div>
          <p className="mt-1 text-sm leading-snug text-slate-300">{snapshot.visibility.summary}</p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-slate-400">
            <span>
              <dt className="inline text-slate-500">alt </dt>
              <dd className="inline text-slate-200">{formatDegrees(snapshot.position.altitude)}</dd>
            </span>
            <span>
              <dt className="inline text-slate-500">az </dt>
              <dd className="inline text-slate-200">
                {snapshot.position.azimuth.toFixed(0)}° {azimuthToCardinal(snapshot.position.azimuth)}
              </dd>
            </span>
            {snapshot.magnitude !== null && (
              <span>
                <dt className="inline text-slate-500">mag </dt>
                <dd className="inline text-slate-200">{snapshot.magnitude.toFixed(2)}</dd>
              </span>
            )}
            {snapshot.distance && (
              <span>
                <dt className="inline text-slate-500">dist </dt>
                <dd className="inline text-slate-200">{formatDistance(snapshot.distance)}</dd>
              </span>
            )}
            {snapshot.riseSet.set && (
              <span>
                <dt className="inline text-slate-500">sets </dt>
                <dd className="inline text-slate-200">
                  {formatTime(snapshot.riseSet.set, location)}
                </dd>
              </span>
            )}
            <span className="text-slate-500">{VISIBILITY_LABEL[snapshot.visibility.state]}</span>
          </dl>
          <p className="mt-2 text-[11px] text-slate-500">
            Esc to let go. Enter on a new target to swap.
          </p>
        </div>
      )}

      {/* Where you are pointing, and when. Quiet, in the corner. */}
      <div className="absolute bottom-4 left-5 font-mono text-[11px] text-slate-500">
        {formatTime(time, location)} · {location.label}
      </div>

      <div
        className={`absolute bottom-4 right-5 text-right font-mono text-[11px] text-slate-500 transition-opacity duration-700 ${
          hintVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        drag or arrows to look · scroll or +/− to zoom
        <br />
        Enter to lock on · Z or Esc to leave
      </div>
    </div>
  )
}
