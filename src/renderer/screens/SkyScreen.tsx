/** The sky map screen: canvas, layer controls, selection panel and Time Machine. */
import type { JSX } from 'react'
import { SkyCanvas } from '../sky/SkyCanvas'
import { ObjectDetails } from '../components/ObjectDetails'
import { TimeMachine } from '../components/TimeMachine'
import { Icon } from '../components/Icon'
import { Tooltip } from '../components/ui'
import { useAppStore, useEffectiveSettings } from '../state/useAppStore'
import { useSnapshot } from '../state/useSnapshot'

interface LayerToggle {
  key:
    | 'showConstellationLines'
    | 'showConstellationLabels'
    | 'showStarLabels'
    | 'showHorizon'
    | 'showGrid'
    | 'showDeepSky'
    | 'showBlackHoles'
    | 'showMilkyWay'
    | 'showSatellites'
  label: string
  hint: string
}

const LAYERS: LayerToggle[] = [
  { key: 'showConstellationLines', label: 'Lines', hint: 'Join the stars of each constellation with its traditional figure' },
  { key: 'showConstellationLabels', label: 'Names', hint: 'Show constellation names' },
  { key: 'showStarLabels', label: 'Stars', hint: 'Label the brightest named stars' },
  { key: 'showDeepSky', label: 'Deep sky', hint: 'Nebulae, clusters and galaxies, drawn at their real catalogued size and shape' },
  { key: 'showBlackHoles', label: 'Black holes', hint: 'Seventeen confirmed black holes and black-hole candidates, from Cygnus X-1 to the one at the centre of the galaxy' },
  { key: 'showMilkyWay', label: 'Milky Way', hint: 'Adds 74 000 telescopic stars from the HYG catalogue; their density along the galactic plane is the Milky Way itself' },
  { key: 'showHorizon', label: 'Horizon', hint: 'Draw the ground, the horizon line and the compass points' },
  { key: 'showGrid', label: 'Grid', hint: 'Overlay an altitude and azimuth grid' },
  { key: 'showSatellites', label: 'Satellites', hint: 'Plot satellites from downloaded orbital elements. Needs a network connection to stay accurate.' }
]

export function SkyScreen(): JSX.Element {
  const selectedId = useAppStore((s) => s.selectedId)
  const select = useAppStore((s) => s.select)
  const settings = useAppStore((s) => s.settings)
  const effective = useEffectiveSettings()
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshTle = useAppStore((s) => s.refreshTle)
  const tle = useAppStore((s) => s.tle)
  const snapshot = useSnapshot(selectedId)

  const toggleLayer = (key: LayerToggle['key']): void => {
    const next = !effective[key]
    void updateSettings({ [key]: next } as never)
    if (key === 'showSatellites' && next && !tle) void refreshTle()
  }

  return (
    <div className="relative flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <SkyCanvas />

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          {LAYERS.map((layer) => {
            const active = effective[layer.key]
            const overridden = settings.beginnerMode && settings[layer.key] !== effective[layer.key]
            return (
              <Tooltip
                key={layer.key}
                label={overridden ? `${layer.hint}. Beginner mode is controlling this.` : layer.hint}
              >
                <button
                  type="button"
                  onClick={() => toggleLayer(layer.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150 ${
                    active
                      ? 'border-nova-500/50 bg-nova-500/15 text-nova-200'
                      : 'border-space-700 bg-space-950/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {layer.label}
                </button>
              </Tooltip>
            )
          })}
          {effective.showSatellites && tle?.warning && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">
              {tle.warning}
            </span>
          )}
        </div>

        <TimeMachine />
      </div>

      {snapshot && (
        <aside className="w-[360px] shrink-0 border-l border-space-800 bg-space-900/60">
          <ObjectDetails
            snapshot={snapshot}
            onClose={() => select(null)}
            onShowInSky={() => select(snapshot.object.id, { focus: true })}
          />
        </aside>
      )}

      {!snapshot && (
        <aside className="hidden w-[280px] shrink-0 flex-col justify-end border-l border-space-800 bg-space-900/40 p-4 xl:flex">
          <div className="rounded-lg border border-space-700/60 bg-space-850/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-slate-300">
              <Icon name="info" size={15} className="text-nova-400" />
              <span className="text-sm font-medium">Click anything</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Select a star, planet or constellation on the map to see how far away it is,
              how bright it is, when it rises and sets, and what it is.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              <li>
                <kbd className="rounded border border-space-600 px-1 font-mono">S</kbd> search
              </li>
              <li>
                <kbd className="rounded border border-space-600 px-1 font-mono">T</kbd> time machine
              </li>
              <li>
                <kbd className="rounded border border-space-600 px-1 font-mono">B</kbd> beginner mode
              </li>
              <li>
                <kbd className="rounded border border-space-600 px-1 font-mono">F</kbd> fullscreen
              </li>
            </ul>
          </div>
        </aside>
      )}
    </div>
  )
}
