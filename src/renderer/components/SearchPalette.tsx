/**
 * Global search overlay (press S).
 *
 * Searches the whole local catalogue: stars, constellations, planets, the Moon, and
 * Messier and NGC objects. No network involved.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ObjectKind, SkyObject } from '@shared/types'
import { searchCatalog } from '@shared/astro/catalog'
import { Icon } from './Icon'
import { useAppStore } from '../state/useAppStore'

const KIND_LABEL: Record<ObjectKind, string> = {
  star: 'Star',
  planet: 'Planet',
  moon: 'Moon',
  sun: 'Sun',
  constellation: 'Constellation',
  'deep-sky': 'Deep sky',
  'black-hole': 'Black hole',
  satellite: 'Satellite'
}

const SUGGESTIONS = ['Orion', 'Jupiter', 'M31', 'Polaris', 'Pleiades', 'Andromeda Galaxy']

export function SearchPalette(): JSX.Element | null {
  const open = useAppStore((s) => s.searchOpen)
  const setOpen = useAppStore((s) => s.setSearchOpen)
  const catalog = useAppStore((s) => s.catalog)
  const beginnerMode = useAppStore((s) => s.settings.beginnerMode)
  const select = useAppStore((s) => s.select)
  const setScreen = useAppStore((s) => s.setScreen)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus after the overlay paints so the caret lands in the field.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo(() => {
    if (!catalog || query.trim().length === 0) return []
    return searchCatalog(catalog, query, { limit: 12, beginnerOnly: beginnerMode })
  }, [catalog, query, beginnerMode])

  if (!open) return null

  const choose = (object: SkyObject): void => {
    select(object.id, { focus: true })
    setScreen('sky')
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      choose(results[active])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-space-950/70 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Search the sky"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div className="panel w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3 border-b border-space-700/60 px-4 py-3">
          <Icon name="search" size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search stars, planets, constellations, Messier and NGC objects…"
            aria-label="Search the sky"
            className="w-full bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded border border-space-600 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            Esc
          </kbd>
        </div>

        {query.trim().length === 0 ? (
          <div className="px-4 py-4">
            <p className="panel-heading mb-2">Try</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className="chip hover:border-nova-500 hover:text-nova-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {beginnerMode && (
              <p className="mt-3 text-xs text-slate-500">
                Beginner mode is on, so search is limited to the brightest and best-known objects.
              </p>
            )}
          </div>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">
            Nothing matches “{query}”. Try a catalogue number such as M42 or NGC 7000.
          </p>
        ) : (
          <ul role="listbox" aria-label="Search results" className="max-h-[50vh] overflow-y-auto py-1">
            {results.map((object, index) => (
              <li key={object.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(object)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                    index === active ? 'bg-nova-500/15' : 'hover:bg-space-800/70'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-100">{object.name}</span>
                    {object.aliases.length > 0 && (
                      <span className="block truncate text-xs text-slate-500">
                        {object.aliases.filter((a) => a !== object.name).slice(0, 3).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{KIND_LABEL[object.kind]}</span>
                  {object.magnitude !== null && (
                    <span className="w-12 shrink-0 text-right font-mono text-xs text-slate-500">
                      {object.magnitude.toFixed(1)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
