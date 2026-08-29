/**
 * React wrapper around {@link SkyRenderer}.
 *
 * The renderer owns the WebGL context and the label DOM; this component only feeds it
 * state changes and forwards user intent back into the store.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import { SkyRenderer, type CameraState, type SkyOptions } from './SkyRenderer'
import { getSatelliteState, type SatelliteState } from '@shared/astro/satellites'
import { azimuthToCardinal } from '@shared/astro/coords'
import { useAppStore, useEffectiveSettings } from '../state/useAppStore'
import { Icon } from '../components/Icon'
import { Tooltip } from '../components/ui'

/** Below this field of view a selected object is worth a real survey image. */
const OBJECT_IMAGERY_FOV = 6

/**
 * Cutouts are requested at one of a few fixed sizes rather than at whatever the field
 * of view happens to be. Two reasons: zooming reuses an already-cached image instead of
 * downloading a slightly different one at every step, and the local cache cannot grow
 * without bound as someone explores.
 */
const CUTOUT_SIZES: number[] = [0.25, 0.5, 1, 2, 4]

function cutoutSizeFor(fov: number): number {
  const wanted = fov * 0.8
  let best = CUTOUT_SIZES[0]
  for (const size of CUTOUT_SIZES) {
    if (Math.abs(size - wanted) < Math.abs(best - wanted)) best = size
  }
  return best
}

/** Decodes the base64 JPEG the main process sends back. */
function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function SkyCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<SkyRenderer | null>(null)

  const catalog = useAppStore((s) => s.catalog)
  const time = useAppStore((s) => s.time)
  const settings = useEffectiveSettings()
  const selectedId = useAppStore((s) => s.selectedId)
  const focusRequest = useAppStore((s) => s.focusRequest)
  const select = useAppStore((s) => s.select)
  const tle = useAppStore((s) => s.tle)

  const timeMachineOpen = useAppStore((s) => s.timeMachineOpen)
  const [camera, setCamera] = useState<CameraState>({ altitude: 35, azimuth: 180, fov: 65 })

  const options: SkyOptions = {
    starMagnitudeLimit: settings.starMagnitudeLimit,
    showConstellationLines: settings.showConstellationLines,
    showConstellationLabels: settings.showConstellationLabels,
    showStarLabels: settings.showStarLabels,
    showHorizon: settings.showHorizon,
    showGrid: settings.showGrid,
    showDeepSky: settings.showDeepSky,
    showBlackHoles: settings.showBlackHoles,
    showMilkyWay: settings.showMilkyWay,
    showSkyImagery: settings.showSkyImagery,
    showObjectImagery: settings.showObjectImagery,
    showSatellites: settings.showSatellites,
    beginnerMode: settings.beginnerMode
  }

  // Create the renderer once, then keep it in sync through the effects below.
  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return
    const renderer = new SkyRenderer(
      canvasRef.current,
      overlayRef.current,
      settings.location,
      options,
      {
        onCameraChange: setCamera,
        onSelect: (id) => select(id)
      }
    )
    rendererRef.current = renderer

    const observer = new ResizeObserver(() => renderer.resize())
    observer.observe(canvasRef.current)

    return () => {
      observer.disconnect()
      renderer.dispose()
      rendererRef.current = null
    }
    // Deliberately mounts once; subsequent updates flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (catalog) rendererRef.current?.setCatalog(catalog)
  }, [catalog])

  useEffect(() => {
    rendererRef.current?.setTime(time)
  }, [time])

  useEffect(() => {
    rendererRef.current?.setLocation(settings.location)
  }, [settings.location])

  useEffect(() => {
    rendererRef.current?.setOptions(options)
    // `options` is rebuilt each render; the individual settings are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.starMagnitudeLimit,
    settings.showConstellationLines,
    settings.showConstellationLabels,
    settings.showStarLabels,
    settings.showHorizon,
    settings.showGrid,
    settings.showDeepSky,
    settings.showBlackHoles,
    settings.showMilkyWay,
    settings.showSkyImagery,
    settings.showObjectImagery,
    settings.showSatellites,
    settings.beginnerMode
  ])

  useEffect(() => {
    rendererRef.current?.setSelected(selectedId)
  }, [selectedId])

  // Recentre when something asks to be shown in the sky.
  useEffect(() => {
    if (!focusRequest || !catalog) return
    const object = catalog.objects.get(focusRequest.id)
    if (object) rendererRef.current?.focusOnObject(object)
  }, [focusRequest, catalog])

  // The bundled all-sky photograph: fetched once, over IPC, as raw bytes.
  useEffect(() => {
    let cancelled = false
    void window.novasky
      .getSkyImage()
      .then((bytes) => {
        if (!cancelled && bytes) rendererRef.current?.setSkyImage(bytes)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Survey cutouts.
   *
   * Zooming past the threshold on a selected deep-sky object asks the main process for
   * a real image of it, sized to the current field of view. The request is debounced so
   * that a continuous zoom produces one download rather than dozens, and the result is
   * cached locally, so returning to the same object is instant and works offline.
   */
  const [imageryNote, setImageryNote] = useState<string | null>(null)
  useEffect(() => {
    if (!settings.showObjectImagery || !catalog || !selectedId) {
      rendererRef.current?.setObjectImage(null, null, 0, 0, 0)
      setImageryNote(null)
      return
    }
    const object = catalog.objects.get(selectedId)
    // Fixed objects only. Planets and satellites move, so a survey plate would show
    // empty sky where they are now; a single star is a point and gains nothing.
    // Black holes qualify, and are worth it: the cutout shows the real field, which is
    // the clearest way to make the point that there is nothing there to see.
    const eligible = object?.kind === 'deep-sky' || object?.kind === 'black-hole'
    if (!object || !eligible || object.ra === null || object.dec === null) {
      rendererRef.current?.setObjectImage(null, null, 0, 0, 0)
      setImageryNote(null)
      return
    }
    if (camera.fov > OBJECT_IMAGERY_FOV) {
      rendererRef.current?.setObjectImage(null, null, 0, 0, 0)
      setImageryNote(null)
      return
    }

    const size = cutoutSizeFor(camera.fov)
    let cancelled = false
    const timer = setTimeout(() => {
      void window.novasky
        .getObjectImage({
          objectId: object.id,
          raDegrees: (object.ra as number) * 15,
          decDegrees: object.dec as number,
          fovDegrees: size
        })
        .then((image) => {
          if (cancelled) return
          if (image.data) {
            const bytes = base64ToBytes(image.data)
            rendererRef.current?.setObjectImage(
              object.id,
              bytes,
              object.ra as number,
              object.dec as number,
              size
            )
            setImageryNote(
              `${object.name}: ${image.source ?? 'survey image'} · ${image.origin}`
            )
          } else {
            rendererRef.current?.setObjectImage(null, null, 0, 0, 0)
            setImageryNote(image.warning)
          }
        })
        .catch(() => undefined)
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selectedId, camera.fov, settings.showObjectImagery, catalog])

  // Satellite positions move fast enough to need their own refresh loop.
  useEffect(() => {
    if (!settings.showSatellites || !tle || tle.records.length === 0) {
      rendererRef.current?.setSatellites([])
      return
    }
    const update = (): void => {
      const now = new Date()
      const states: SatelliteState[] = []
      // Only the brightest handful are drawn; the full visual set would be noise.
      for (const record of tle.records.slice(0, 60)) {
        const state = getSatelliteState(record, now, settings.location, tle.origin)
        if (state && state.altitude > 0) states.push(state)
      }
      rendererRef.current?.setSatellites(states)
    }
    update()
    const timer = setInterval(update, 2000)
    return () => clearInterval(timer)
  }, [settings.showSatellites, tle, settings.location])

  // Keyboard navigation for the map itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const renderer = rendererRef.current
      if (!renderer) return
      const step = event.shiftKey ? 15 : 5
      switch (event.key) {
        case 'ArrowLeft':
          renderer.pan(-step, 0)
          break
        case 'ArrowRight':
          renderer.pan(step, 0)
          break
        case 'ArrowUp':
          renderer.pan(0, step)
          break
        case 'ArrowDown':
          renderer.pan(0, -step)
          break
        case '+':
        case '=':
          renderer.zoomBy(0.8)
          break
        case '-':
        case '_':
          renderer.zoomBy(1.25)
          break
        case '0':
          renderer.resetView()
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        aria-label="Interactive sky map. Use the arrow keys to look around, plus and minus to zoom, and the Search screen to find objects by name."
        role="application"
        tabIndex={0}
      />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />

      {imageryNote && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[60%] -translate-x-1/2 truncate rounded-lg border border-space-700/70 bg-space-950/80 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur">
          {imageryNote}
        </div>
      )}

      {/* Lifted clear of the Time Machine panel while it is open. */}
      <div
        className={`pointer-events-none absolute left-3 rounded-lg border border-space-700/70 bg-space-950/70 px-2.5 py-1.5 font-mono text-[11px] text-slate-400 backdrop-blur transition-[bottom] duration-200 ${
          timeMachineOpen ? 'bottom-[10.5rem]' : 'bottom-3'
        }`}
      >
        Looking {azimuthToCardinal(camera.azimuth)} · alt {camera.altitude.toFixed(0)}° · field{' '}
        {camera.fov.toFixed(0)}°
      </div>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <Tooltip label="Zoom in (+)" side="right">
          <button
            type="button"
            onClick={() => rendererRef.current?.zoomBy(0.75)}
            aria-label="Zoom in"
            className="btn-ghost !px-2 !py-2"
          >
            <Icon name="zoom-in" size={16} />
          </button>
        </Tooltip>
        <Tooltip label="Zoom out (−)" side="right">
          <button
            type="button"
            onClick={() => rendererRef.current?.zoomBy(1.33)}
            aria-label="Zoom out"
            className="btn-ghost !px-2 !py-2"
          >
            <Icon name="zoom-out" size={16} />
          </button>
        </Tooltip>
        <Tooltip label="Reset the view to south, 35° up (0)" side="right">
          <button
            type="button"
            onClick={() => rendererRef.current?.resetView()}
            aria-label="Reset view"
            className="btn-ghost !px-2 !py-2"
          >
            <Icon name="reset" size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
