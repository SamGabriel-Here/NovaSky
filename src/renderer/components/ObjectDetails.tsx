/**
 * The object details panel.
 *
 * Every figure shown here is labelled with where it came from: positions and rise/set
 * times are calculated for the displayed moment, magnitudes and sizes are catalogue
 * values, and satellite data is live or cached.
 */
import type { JSX } from 'react'
import type { ObjectSnapshot } from '@shared/types'
import { formatAzimuth, formatDec, formatDegrees, formatRa } from '@shared/astro/coords'
import { formatDistance } from '@shared/astro/ephemeris'
import { CONSTELLATION_LORE } from '@shared/astro/lore'
import { Icon } from './Icon'
import { DataRow, OriginBadge, Tooltip } from './ui'
import { useAppStore } from '../state/useAppStore'
import { formatDateTime, formatTime, VISIBILITY_LABEL, VISIBILITY_TONE } from '../lib/format'

interface Props {
  snapshot: ObjectSnapshot
  onClose?: () => void
  onShowInSky?: () => void
  compact?: boolean
}

export function ObjectDetails({ snapshot, onClose, onShowInSky, compact }: Props): JSX.Element {
  const location = useAppStore((s) => s.settings.location)
  const catalog = useAppStore((s) => s.catalog)
  const { object, position, riseSet, visibility } = snapshot

  const constellationName = object.constellation
    ? (catalog?.constellationNames.get(object.constellation) ?? object.constellation)
    : null
  const lore = object.kind === 'constellation' ? CONSTELLATION_LORE[object.constellation ?? ''] : null

  const openLink = (url: string): void => {
    void window.novasky.openExternal(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-space-700/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-slate-50">{object.name}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {object.subtype ?? 'Sky object'}
            {constellationName && object.kind !== 'constellation' && ` · in ${constellationName}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onShowInSky && (
            <Tooltip label="Centre the sky map on this object">
              <button type="button" onClick={onShowInSky} className="btn-ghost !px-2 !py-1.5">
                <Icon name="sky" size={16} />
              </button>
            </Tooltip>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="btn-ghost !px-2 !py-1.5"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${VISIBILITY_TONE[visibility.state]}`}
          role="status"
        >
          <p className="font-medium">{VISIBILITY_LABEL[visibility.state]}</p>
          <p className="mt-0.5 text-xs opacity-90">{visibility.summary}</p>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-slate-300">{snapshot.description}</p>

        <dl className="mb-4">
          <DataRow
            label="Altitude"
            value={formatDegrees(position.altitude)}
            hint="Angle above the horizon right now, including atmospheric refraction. 0° is the horizon, 90° is straight up."
            badge={<OriginBadge origin="calculated" />}
          />
          <DataRow
            label="Azimuth"
            value={formatAzimuth(position.azimuth)}
            hint="Compass direction, measured clockwise from due north."
            badge={<OriginBadge origin="calculated" />}
          />
          <DataRow
            label="Magnitude"
            value={snapshot.magnitude === null ? 'Not catalogued' : snapshot.magnitude.toFixed(2)}
            hint="Apparent brightness. Lower is brighter; the unaided eye reaches about 6 under dark skies."
            badge={<OriginBadge origin={snapshot.magnitudeOrigin} />}
          />
          <DataRow
            label="Distance"
            value={snapshot.distance ? formatDistance(snapshot.distance) : 'Not catalogued'}
            badge={snapshot.distance ? <OriginBadge origin={snapshot.distance.origin} /> : undefined}
          />
          {snapshot.illumination !== null && (
            <DataRow
              label="Illuminated"
              value={`${Math.round(snapshot.illumination * 100)}%`}
              hint="Fraction of the disc lit by the Sun as seen from Earth."
              badge={<OriginBadge origin="calculated" />}
            />
          )}
          {object.sizeArcmin !== null && (
            <DataRow
              label="Apparent size"
              value={`${object.sizeArcmin.toFixed(1)}′`}
              hint="Major axis in arcminutes. The full Moon is about 31′ across."
              badge={<OriginBadge origin="catalog" />}
            />
          )}
          <DataRow
            label="Right ascension"
            value={<span className="font-mono text-xs">{formatRa(position.ra)}</span>}
            hint="Celestial longitude, for the equinox of date."
            badge={<OriginBadge origin="calculated" />}
          />
          <DataRow
            label="Declination"
            value={<span className="font-mono text-xs">{formatDec(position.dec)}</span>}
            hint="Celestial latitude, for the equinox of date."
            badge={<OriginBadge origin="calculated" />}
          />
        </dl>

        <h3 className="panel-heading mb-1">Tonight</h3>
        <dl className="mb-4">
          {riseSet.circumpolar ? (
            <DataRow label="Rise / set" value="Circumpolar — never sets from here" />
          ) : riseSet.neverRises ? (
            <DataRow label="Rise / set" value="Never rises from your location" />
          ) : (
            <>
              <DataRow label="Rises" value={formatTime(riseSet.rise, location)} />
              <DataRow
                label="Transits"
                value={
                  riseSet.transit
                    ? `${formatTime(riseSet.transit, location)}${
                        riseSet.transitAltitude !== null
                          ? ` · ${formatDegrees(riseSet.transitAltitude)}`
                          : ''
                      }`
                    : '—'
                }
                hint="Highest point of the day, when the object crosses your meridian."
              />
              <DataRow label="Sets" value={formatTime(riseSet.set, location)} />
            </>
          )}
          <DataRow
            label="Best viewing"
            value={
              visibility.bestViewing
                ? formatDateTime(visibility.bestViewing, location)
                : 'Not up during tonight’s dark hours'
            }
            hint="Moment of greatest altitude while the sky is astronomically dark."
            badge={<OriginBadge origin="calculated" />}
          />
        </dl>
        {visibility.bestViewingNote && (
          <p className="-mt-2 mb-4 text-xs text-slate-400">{visibility.bestViewingNote}</p>
        )}

        {(snapshot.mythology || lore?.findIt) && (
          <section className="mb-4">
            <h3 className="panel-heading mb-1">Background</h3>
            {snapshot.mythology && (
              <p className="text-sm leading-relaxed text-slate-300">{snapshot.mythology}</p>
            )}
            {lore?.findIt && (
              <p className="mt-2 rounded-lg border border-nova-500/25 bg-nova-500/10 px-3 py-2 text-sm text-nova-200">
                <span className="font-medium">How to find it: </span>
                {lore.findIt}
              </p>
            )}
          </section>
        )}

        {!compact && (
          <section>
            <h3 className="panel-heading mb-1">Learn more</h3>
            <ul className="space-y-1">
              {snapshot.links.map((link) => (
                <li key={link.url}>
                  <button
                    type="button"
                    onClick={() => openLink(link.url)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm text-nova-300 hover:bg-space-800 hover:text-nova-200"
                  >
                    <Icon name="external" size={13} />
                    <span className="truncate">{link.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Positions and times are calculated with astronomy-engine for the moment shown.
              Star data comes from the HYG catalogue, deep-sky data from OpenNGC.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
