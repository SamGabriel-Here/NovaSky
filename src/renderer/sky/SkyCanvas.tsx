/**
 * React wrapper around {@link SkyRenderer}.
 *
 * The renderer owns the WebGL context and the label DOM; this component only feeds it
 * state changes and forwards user intent back into the store.
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
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
  const zenMode = useAppStore((s) => s.zenMode)
  const setAimed = useAppStore((s) => s.setAimed)
  const [camera, setCamera] = useState<CameraState>({ altitude: 35, azimuth: 180, fov: 65 })

  /**
   * The live camera, and a React copy of it that lags by at most one frame.
   *
   * The renderer reports a new camera on every pointer move and every frame of an
   * animation. Pushing each of those straight into React state re-rendered the whole
   * canvas tree faster than the screen refreshes, which is what made dragging and the
   * arrow keys feel heavy. Everything that needs the camera right now reads the ref;
   * React hears about it once per frame, and not at all in zen mode, where nothing on
   * screen shows the readout.
   */
  const cameraRef = useRef<CameraState>(camera)
  const zenModeRef = useRef(false)
  const cameraFlush = useRef(0)
  const publishCamera = useCallback((next: CameraState): void => {
    cameraRef.current = next
    if (zenModeRef.current || cameraFlush.current) return
    cameraFlush.current = requestAnimationFrame(() => {
      cameraFlush.current = 0
      setCamera(cameraRef.current)
    })
  }, [])

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
        onCameraChange: publishCamera,
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
      if (cameraFlush.current) cancelAnimationFrame(cameraFlush.current)
      cameraFlush.current = 0
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

  /**
   * The crosshair reads whatever is at the centre of the view.
   *
   * This used to run off a timer, which meant the name under the reticle arrived up to
   * a tenth of a second after the sky had already moved. It now re-picks on the frame
   * the view changes, and skips the work entirely while the view is still. The sky also
   * turns on its own as time runs, so a slow heartbeat catches an object drifting into
   * the crosshair while nothing is being touched.
   */
  useEffect(() => {
    zenModeRef.current = zenMode
    if (!zenMode) {
      rendererRef.current?.setCrosshairMode(false)
      setAimed(null)
      setCamera(cameraRef.current)
      return
    }
    rendererRef.current?.setCrosshairMode(true)

    let frame = 0
    let lastView = ''
    let lastId: string | null = null
    let lastPickAt = 0
    let first = true

    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      const renderer = rendererRef.current
      if (!renderer) return
      const { altitude, azimuth, fov } = cameraRef.current
      const view = `${altitude.toFixed(3)}|${azimuth.toFixed(3)}|${fov.toFixed(3)}`
      if (!first && view === lastView && now - lastPickAt < 500) return
      lastView = view
      lastPickAt = now
      const id = renderer.pickCentre()
      // Only touch the store when the answer changes, so a drag does not re-render the
      // overlay sixty times a second to write the same name.
      if (first || id !== lastId) {
        lastId = id
        setAimed(id)
      }
      first = false
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      rendererRef.current?.setCrosshairMode(false)
      setAimed(null)
    }
  }, [zenMode, setAimed])

  // Surface maps for the Solar System, fetched once each. A body without one keeps its
  // plain marker, so a missing texture degrades quietly.
  useEffect(() => {
    let cancelled = false
    const bodies = [
      'sun', 'moon', 'mercury', 'venus', 'mars',
      'jupiter', 'saturn', 'saturn-ring', 'uranus', 'neptune'
    ]
    for (const id of bodies) {
      void window.novasky
        .getBodyTexture(id)
        .then((bytes) => {
          if (!cancelled && bytes) rendererRef.current?.setBodyTexture(id, bytes)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [])

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

  // The camera reports a new field of view on every animation frame. Depending on the
  // raw value would re-run this effect sixty times a second, disposing and rebuilding
  // GPU resources each time; depending on the quantised request size instead means it
  // runs only when the answer could actually change.
  const zoomedIn = camera.fov <= OBJECT_IMAGERY_FOV
  const cutoutSize = cutoutSizeFor(camera.fov)

  useEffect(() => {
    /** Only touches the renderer when there is actually an image to remove. */
    const clearImage = (): void => {
      if (rendererRef.current?.getObjectImageId()) {
        rendererRef.current.setObjectImage(null, null, 0, 0, 0)
      }
      setImageryNote(null)
    }

    if (!settings.showObjectImagery || !catalog || !selectedId) {
      clearImage()
      return
    }
    const object = catalog.objects.get(selectedId)
    // Fixed objects only. Planets and satellites move, so a survey plate would show
    // empty sky where they are now; a single star is a point and gains nothing.
    // Black holes qualify, and are worth it: the cutout shows the real field, which is
    // the clearest way to make the point that there is nothing there to see.
    const eligible = object?.kind === 'deep-sky' || object?.kind === 'black-hole'
    if (!object || !eligible || object.ra === null || object.dec === null) {
      clearImage()
      return
    }
    if (!zoomedIn) {
      clearImage()
      return
    }

    const size = cutoutSize
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
            clearImage()
            setImageryNote(image.warning)
          }
        })
        .catch(() => undefined)
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selectedId, zoomedIn, cutoutSize, settings.showObjectImagery, catalog])

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

  /**
   * Keyboard navigation for the map itself.
   *
   * Held keys glide rather than step. Panning used to jump five degrees per keydown and
   * lean on the operating system's key repeat, so a tap lurched and a hold sat still for
   * half a second before machine-gunning. Now a key going down starts a loop that moves
   * the sky a distance proportional to the frame it just drew, and lifting it stops.
   *
   * The rate scales with the field of view, so the sky travels roughly the same fraction
   * of the screen per second whether you are looking at a constellation or at Saturn's
   * rings, and holding shift roughly triples it.
   */
  useEffect(() => {
    /** Degrees per second at a given field of view, and zoom factors per second. */
    const PAN_RATE = 0.85
    const FAST_MULTIPLIER = 3
    const ZOOM_RATE = 1.9

    const held = new Set<string>()
    let frame = 0
    let previous = 0
    let fast = false

    const stop = (): void => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      held.clear()
    }

    const tick = (now: number): void => {
      const renderer = rendererRef.current
      if (!renderer || held.size === 0) {
        frame = 0
        return
      }
      frame = requestAnimationFrame(tick)
      // Clamped so a backgrounded window does not resume with one enormous jump.
      const seconds = Math.min(0.05, (now - previous) / 1000)
      previous = now

      const rate = cameraRef.current.fov * PAN_RATE * (fast ? FAST_MULTIPLIER : 1) * seconds
      let azimuth = 0
      let altitude = 0
      if (held.has('ArrowLeft')) azimuth -= rate
      if (held.has('ArrowRight')) azimuth += rate
      if (held.has('ArrowUp')) altitude += rate
      if (held.has('ArrowDown')) altitude -= rate
      if (azimuth !== 0 || altitude !== 0) renderer.pan(azimuth, altitude)

      if (held.has('in')) renderer.zoomBy(Math.pow(1 / ZOOM_RATE, seconds))
      if (held.has('out')) renderer.zoomBy(Math.pow(ZOOM_RATE, seconds))
    }

    const start = (): void => {
      if (frame) return
      previous = performance.now()
      frame = requestAnimationFrame(tick)
    }

    /** The keys that glide, mapped to what the loop looks for. */
    const glideKey = (key: string): string | null => {
      if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
        return key
      }
      if (key === '+' || key === '=') return 'in'
      if (key === '-' || key === '_') return 'out'
      return null
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (!rendererRef.current) return
      fast = event.shiftKey

      if (event.key === '0') {
        rendererRef.current.resetView()
        event.preventDefault()
        return
      }

      const key = glideKey(event.key)
      if (!key) return
      event.preventDefault()
      // The operating system's own repeat would only fight the loop.
      if (event.repeat) return
      held.add(key)
      start()
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      fast = event.shiftKey
      const key = glideKey(event.key)
      if (key) held.delete(key)
    }

    // A key held while the window loses focus never sends its keyup, so the sky would
    // otherwise drift forever.
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', stop)
      stop()
    }
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

      {imageryNote && !zenMode && (
        <div
          className={`pointer-events-none absolute left-1/2 max-w-[60%] -translate-x-1/2 truncate rounded-lg border border-space-700/70 bg-space-950/80 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur transition-[bottom] duration-200 ${
            timeMachineOpen ? 'bottom-[10.5rem]' : 'bottom-3'
          }`}
        >
          {imageryNote}
        </div>
      )}

      {/*
        Lifted clear of the Time Machine panel while it is open. Zen mode drops both of
        these blocks rather than setting `hidden` on them: `hidden` is only a UA rule, so
        a Tailwind display utility on the same element outranks it and the controls stay
        on screen.
      */}
      {!zenMode && (
        <>
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
        </>
      )}
    </div>
  )
}
