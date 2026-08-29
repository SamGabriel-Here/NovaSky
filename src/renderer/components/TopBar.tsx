/** Location, clock and data-status strip above the active screen. */
import { useEffect, useState, type JSX } from 'react'
import { Icon } from './Icon'
import { Tooltip } from './ui'
import { useAppStore } from '../state/useAppStore'
import { formatDate, formatTime, timeZoneLabel } from '../lib/format'

export function TopBar(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const time = useAppStore((s) => s.time)
  const live = useAppStore((s) => s.live)
  const setLive = useAppStore((s) => s.setLive)
  const setScreen = useAppStore((s) => s.setScreen)
  const setTimeMachineOpen = useAppStore((s) => s.setTimeMachineOpen)
  const setSearchOpen = useAppStore((s) => s.setSearchOpen)
  const tle = useAppStore((s) => s.tle)
  const storeBackend = useAppStore((s) => s.storeBackend)

  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = (): void => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return (
    <header className="flex items-center gap-3 border-b border-space-800 bg-space-950/80 px-4 py-2.5 backdrop-blur">
      <Tooltip label="Change your observing location in Settings">
        <button
          type="button"
          onClick={() => setScreen('settings')}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-200 hover:bg-space-800"
        >
          <Icon name="location" size={16} className="text-nova-400" />
          <span className="max-w-[240px] truncate">{settings.location.label}</span>
          {settings.location.source === 'default' && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              Not set
            </span>
          )}
        </button>
      </Tooltip>

      <Tooltip label="Open the Time Machine (T)">
        <button
          type="button"
          onClick={() => setTimeMachineOpen(true)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-space-800"
        >
          <Icon name="clock" size={16} className={live ? 'text-emerald-400' : 'text-amber-300'} />
          <span className="tabular-nums text-slate-100">{formatTime(time, settings.location)}</span>
          <span className="text-slate-400">{formatDate(time, settings.location)}</span>
          <span className="text-xs text-slate-500">{timeZoneLabel(settings.location, time)}</span>
        </button>
      </Tooltip>

      {!live && (
        <button type="button" onClick={() => setLive(true)} className="btn-ghost !py-1 !text-xs">
          <Icon name="reset" size={14} />
          Back to now
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-space-700 bg-space-900/70 px-3 py-1.5 text-xs text-slate-400 hover:border-space-600 hover:text-slate-200"
        >
          <Icon name="search" size={14} />
          Search the sky
          <kbd className="rounded border border-space-600 px-1 font-mono text-[10px]">S</kbd>
        </button>

        <Tooltip
          label={
            online
              ? `Online. Catalogues are local; only satellite elements use the network.${
                  tle ? ` Elements: ${tle.origin}.` : ''
                }`
              : 'Offline. The sky map, search and Tonight all keep working from local data; satellite positions do not.'
          }
        >
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
              online
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            <Icon name={online ? 'online' : 'offline'} size={13} />
            {online ? 'Online' : 'Offline'}
          </span>
        </Tooltip>

        {storeBackend === 'json' && (
          <Tooltip label="SQLite could not be loaded on this machine, so NovaSky is saving your data to a JSON file instead. Everything still works.">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
              File store
            </span>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
