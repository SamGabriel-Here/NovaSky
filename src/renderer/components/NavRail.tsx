/** Primary navigation. Fixed to the left edge on every screen. */
import type { JSX } from 'react'
import { Icon, type IconName } from './Icon'
import { Tooltip } from './ui'
import { SCREENS, useAppStore, type Screen } from '../state/useAppStore'

const ICONS: Record<Screen, IconName> = {
  sky: 'sky',
  search: 'search',
  tonight: 'tonight',
  learn: 'learn',
  events: 'events',
  settings: 'settings'
}

export function NavRail(): JSX.Element {
  const screen = useAppStore((s) => s.screen)
  const setScreen = useAppStore((s) => s.setScreen)
  const beginnerMode = useAppStore((s) => s.settings.beginnerMode)

  return (
    <nav
      aria-label="Main"
      className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-space-800 bg-space-950/90 py-3"
    >
      <div className="mb-3 flex flex-col items-center gap-1" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" className="text-nova-400">
          <path
            d="M12 2.5 13.9 9l6.6 1.9-6.6 1.9L12 19.5 10.1 12.8 3.5 10.9 10.1 9z"
            fill="currentColor"
          />
          <circle cx="18.5" cy="5" r="1.3" fill="#ffd9a0" />
          <circle cx="5.5" cy="17.5" r="1" fill="#cfe3ff" />
        </svg>
        <span className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">NOVA</span>
      </div>

      {SCREENS.map((entry) => {
        const active = screen === entry.id
        return (
          <Tooltip key={entry.id} label={entry.hint} side="right">
            <button
              type="button"
              onClick={() => setScreen(entry.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex w-[60px] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] transition-colors duration-150 ${
                active
                  ? 'bg-nova-500/15 text-nova-300'
                  : 'text-slate-400 hover:bg-space-800 hover:text-slate-200'
              }`}
            >
              <Icon name={ICONS[entry.id]} size={20} />
              {entry.label}
            </button>
          </Tooltip>
        )
      })}

      <div className="mt-auto flex flex-col items-center gap-2 pb-1">
        {beginnerMode && (
          <Tooltip label="Beginner mode is on. Press B to switch back to the full sky." side="right">
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              Beginner
            </span>
          </Tooltip>
        )}
      </div>
    </nav>
  )
}
