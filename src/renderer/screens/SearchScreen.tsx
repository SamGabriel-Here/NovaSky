/** Full search screen with filters, alongside the quick palette on the S key. */
import { useMemo, useState, type JSX } from 'react'
import type { ObjectKind } from '@shared/types'
import { searchCatalog } from '@shared/astro/catalog'
import { ObjectDetails } from '../components/ObjectDetails'
import { EmptyState, SectionHeading } from '../components/ui'
import { Icon } from '../components/Icon'
import { useAppStore } from '../state/useAppStore'
import { useSnapshot } from '../state/useSnapshot'

const FILTERS: { id: ObjectKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'star', label: 'Stars' },
  { id: 'constellation', label: 'Constellations' },
  { id: 'planet', label: 'Planets' },
  { id: 'moon', label: 'Moon' },
  { id: 'deep-sky', label: 'Deep sky' },
  { id: 'black-hole', label: 'Black holes' }
]

export function SearchScreen(): JSX.Element {
  const catalog = useAppStore((s) => s.catalog)
  const beginnerMode = useAppStore((s) => s.settings.beginnerMode)
  const selectedId = useAppStore((s) => s.selectedId)
  const select = useAppStore((s) => s.select)
  const setScreen = useAppStore((s) => s.setScreen)
  const snapshot = useSnapshot(selectedId)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ObjectKind | 'all'>('all')

  const results = useMemo(() => {
    if (!catalog || query.trim().length === 0) return []
    return searchCatalog(catalog, query, {
      limit: 60,
      beginnerOnly: beginnerMode,
      kinds: filter === 'all' ? undefined : [filter]
    })
  }, [catalog, query, filter, beginnerMode])

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <SectionHeading
          title="Search"
          subtitle={
            catalog
              ? `${catalog.objects.size.toLocaleString()} objects available offline — every star to magnitude ${catalog.manifest.starMagnitudeLimit}, all 88 constellations, the Solar System and ${catalog.deepSky.length.toLocaleString()} deep-sky objects.`
              : undefined
          }
        />

        <div className="mb-4 flex items-center gap-2">
          <Icon name="search" size={16} className="text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, Bayer letter, Messier or NGC number…"
            className="field"
            aria-label="Search the catalogue"
            autoFocus
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              aria-pressed={filter === entry.id}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === entry.id
                  ? 'border-nova-500/50 bg-nova-500/15 text-nova-200'
                  : 'border-space-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {query.trim().length === 0 ? (
          <EmptyState
            icon="search"
            title="Search the whole catalogue"
            description="Try a name (Betelgeuse), a designation (α Ori), a catalogue number (M42, NGC 7000) or a constellation (Cassiopeia)."
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon="search"
            title={`No matches for “${query}”`}
            description={
              beginnerMode
                ? 'Beginner mode limits search to the brightest objects. Press B to search everything.'
                : 'Check the spelling, or try a catalogue designation instead.'
            }
          />
        ) : (
          <ul className="space-y-1">
            {results.map((object) => (
              <li key={object.id}>
                <button
                  type="button"
                  onClick={() => select(object.id)}
                  onDoubleClick={() => {
                    select(object.id, { focus: true })
                    setScreen('sky')
                  }}
                  aria-current={object.id === selectedId ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    object.id === selectedId
                      ? 'border-nova-500/50 bg-nova-500/10'
                      : 'border-transparent hover:border-space-700 hover:bg-space-850/60'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-100">{object.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {object.subtype ?? ''}
                      {object.aliases.length > 0 && ` · ${object.aliases.filter((a) => a !== object.name).slice(0, 2).join(' · ')}`}
                    </span>
                  </span>
                  {object.magnitude !== null && (
                    <span className="shrink-0 font-mono text-xs text-slate-400">
                      mag {object.magnitude.toFixed(1)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {snapshot && (
        <aside className="w-[380px] shrink-0 border-l border-space-800 bg-space-900/60">
          <ObjectDetails
            snapshot={snapshot}
            onClose={() => select(null)}
            onShowInSky={() => {
              select(snapshot.object.id, { focus: true })
              setScreen('sky')
            }}
          />
        </aside>
      )}
    </div>
  )
}
