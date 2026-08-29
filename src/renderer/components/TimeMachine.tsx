/**
 * The Time Machine.
 *
 * Sets the moment the sky map draws. Everything downstream — positions, rise and set
 * times, visibility, the Tonight plan — is a pure function of this time and the
 * observer, so changing it here updates the whole app.
 */
import { useMemo, type JSX } from 'react'
import { Icon } from './Icon'
import { Tooltip } from './ui'
import { PLAYBACK_RATES, useAppStore } from '../state/useAppStore'
import { useDarkWindow } from '../state/useSnapshot'
import { formatDate, formatTime, fromLocalInputValue, toLocalInputValue } from '../lib/format'

const HOUR = 3600000
const DAY = 24 * HOUR

export function TimeMachine(): JSX.Element | null {
  const open = useAppStore((s) => s.timeMachineOpen)
  const setOpen = useAppStore((s) => s.setTimeMachineOpen)
  const time = useAppStore((s) => s.time)
  const live = useAppStore((s) => s.live)
  const playing = useAppStore((s) => s.playing)
  const playbackRate = useAppStore((s) => s.playbackRate)
  const setTime = useAppStore((s) => s.setTime)
  const setLive = useAppStore((s) => s.setLive)
  const setPlaying = useAppStore((s) => s.setPlaying)
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate)
  const location = useAppStore((s) => s.settings.location)
  const darkWindow = useDarkWindow()

  const inputValue = useMemo(() => toLocalInputValue(time, location), [time, location])

  if (!open) return null

  const shift = (ms: number): void => setTime(new Date(time.getTime() + ms))

  const jumpTo = (iso: string | null): void => {
    if (iso) setTime(new Date(iso))
  }

  return (
    <section
      aria-label="Time Machine"
      className="panel absolute bottom-4 left-1/2 z-30 w-[min(880px,calc(100%-2rem))] -translate-x-1/2 px-4 py-3 shadow-2xl"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="clock" size={16} className="text-nova-400" />
          <h2 className="text-sm font-semibold text-slate-100">Time Machine</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              live
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            {live ? 'Live' : 'Time travel'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close Time Machine"
          className="btn-ghost !px-2 !py-1"
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="time-machine-input">
          Date and time
        </label>
        <input
          id="time-machine-input"
          type="datetime-local"
          value={inputValue}
          onChange={(event) => {
            const parsed = fromLocalInputValue(event.target.value, location)
            if (parsed) setTime(parsed)
          }}
          className="field w-[230px] [color-scheme:dark]"
        />

        <div className="flex items-center gap-1">
          <Tooltip label="Back one day">
            <button type="button" onClick={() => shift(-DAY)} className="btn-ghost !px-2.5">
              −1d
            </button>
          </Tooltip>
          <Tooltip label="Back one hour">
            <button type="button" onClick={() => shift(-HOUR)} className="btn-ghost !px-2.5">
              −1h
            </button>
          </Tooltip>
          <Tooltip label="Forward one hour">
            <button type="button" onClick={() => shift(HOUR)} className="btn-ghost !px-2.5">
              +1h
            </button>
          </Tooltip>
          <Tooltip label="Forward one day">
            <button type="button" onClick={() => shift(DAY)} className="btn-ghost !px-2.5">
              +1d
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className={playing ? 'btn-primary !px-2.5' : 'btn-ghost !px-2.5'}
            aria-label={playing ? 'Pause sky playback' : 'Play sky forward'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={15} />
          </button>
          <label className="sr-only" htmlFor="playback-rate">
            Playback speed
          </label>
          <select
            id="playback-rate"
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
            className="field w-[120px] !py-1.5"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate.value} value={rate.value}>
                {rate.label}
              </option>
            ))}
          </select>
        </div>

        <button type="button" onClick={() => setLive(true)} className="btn-ghost ml-auto">
          <Icon name="reset" size={14} />
          Now
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-space-700/60 pt-3">
        <span className="panel-heading">Jump to</span>
        <button type="button" onClick={() => jumpTo(darkWindow?.sunset ?? null)} className="chip hover:border-nova-500" disabled={!darkWindow?.sunset}>
          Sunset {darkWindow?.sunset ? formatTime(darkWindow.sunset, location) : '—'}
        </button>
        <button type="button" onClick={() => jumpTo(darkWindow?.darkStart ?? null)} className="chip hover:border-nova-500" disabled={!darkWindow?.darkStart}>
          Full dark {darkWindow?.darkStart ? formatTime(darkWindow.darkStart, location) : '—'}
        </button>
        <button type="button" onClick={() => jumpTo(darkWindow?.darkEnd ?? null)} className="chip hover:border-nova-500" disabled={!darkWindow?.darkEnd}>
          Dawn {darkWindow?.darkEnd ? formatTime(darkWindow.darkEnd, location) : '—'}
        </button>
        <button type="button" onClick={() => shift(365.25 * DAY)} className="chip hover:border-nova-500">
          +1 year
        </button>
        <button type="button" onClick={() => shift(-365.25 * DAY)} className="chip hover:border-nova-500">
          −1 year
        </button>
        <span className="ml-auto text-xs text-slate-400">
          Showing {formatDate(time, location)} at {formatTime(time, location)}
        </span>
      </div>
    </section>
  )
}
