/**
 * The 3D sky map.
 *
 * Design note: every fixed object is stored once in the EQJ frame inside `skyGroup`,
 * and the entire sky is oriented for the current time and place by setting a single
 * rotation matrix on that group (see coords.eqjToWorldMatrix). Changing the time or
 * the observer therefore costs one matrix update rather than 9 000 trigonometric
 * conversions, which is what makes scrubbing the Time Machine smooth.
 *
 * The horizon, the ground and the compass points live in the world frame instead, so
 * they stay put while the sky turns above them.
 */
import * as THREE from 'three'
import * as Astronomy from 'astronomy-engine'
import type { GeoLocation, ObjectKind, SkyObject } from '@shared/types'
import {
  DEG,
  type Vec3,
  applyMatrix3,
  azimuthToCardinal,
  eqjToWorldMatrix,
  eqjUnitVector,
  horizontalToWorld
} from '@shared/astro/coords'
import type { Catalog } from '@shared/astro/catalog'
import { blackHoleToSkyObject, deepSkyToSkyObject, SOLAR_SYSTEM } from '@shared/astro/catalog'
import { getIllumination, getPosition } from '@shared/astro/ephemeris'
import type { SatelliteState } from '@shared/astro/satellites'
import { BEGINNER_CONSTELLATIONS } from '@shared/astro/lore'

export interface SkyOptions {
  starMagnitudeLimit: number
  showConstellationLines: boolean
  showConstellationLabels: boolean
  showStarLabels: boolean
  showHorizon: boolean
  showGrid: boolean
  showDeepSky: boolean
  showBlackHoles: boolean
  showMilkyWay: boolean
  showSkyImagery: boolean
  showObjectImagery: boolean
  showSatellites: boolean
  beginnerMode: boolean
}

export interface CameraState {
  /** Direction the camera looks, in the horizontal frame. */
  altitude: number
  azimuth: number
  /** Vertical field of view in degrees — the zoom level. */
  fov: number
}

const DEFAULT_CAMERA: CameraState = { altitude: 35, azimuth: 180, fov: 65 }
const MIN_FOV = 4
const MAX_FOV = 110
/** Radius of the celestial sphere in world units. Everything sits on it. */
const SKY_RADIUS = 100

/** Label kinds get different colours and priorities. */
interface LabelTarget {
  id: string
  text: string
  kind: ObjectKind | 'cardinal'
  /** Position in EQJ (fixed objects) or world space (cardinals). */
  local: Vec3
  frame: 'sky' | 'world'
  priority: number
}

interface PickTarget {
  id: string
  local: Vec3
  frame: 'sky' | 'world'
  /** Larger objects are easier to hit. */
  weight: number
}

/**
 * Approximate RGB for a star from its B-V colour index.
 * Uses the standard Ballesteros colour-temperature relation followed by a blackbody
 * approximation, then lifts saturation so the colours read on screen.
 */
export function colorFromBv(bv: number | null): THREE.Color {
  const index = bv === null ? 0.65 : Math.min(2.0, Math.max(-0.4, bv))
  const kelvin = 4600 * (1 / (0.92 * index + 1.7) + 1 / (0.92 * index + 0.62))
  const t = kelvin / 100
  let r: number
  let g: number
  let b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    b = 255
  }
  const clamp = (v: number): number => Math.min(1, Math.max(0, v / 255))
  const color = new THREE.Color(clamp(r), clamp(g), clamp(b))
  // Stars are close to white to the eye; pull the tint back toward neutral.
  return color.lerp(new THREE.Color(1, 1, 1), 0.45)
}

/**
 * Shared GLSL: screen-space directions of celestial north and east at a point on the
 * sphere. Used to orient elliptical nebulae by their catalogued position angle, which
 * is defined as an angle from north toward east.
 */
const SKY_ORIENTATION = /* glsl */ `
  void skyAxes(vec3 localPosition, float aspect, out vec2 northScreen, out vec2 eastScreen) {
    vec3 p = normalize(localPosition);
    // North: the component of the celestial pole perpendicular to the line of sight.
    vec3 north = vec3(0.0, 0.0, 1.0) - p * p.z;
    float nl = length(north);
    north = nl > 1e-5 ? north / nl : vec3(1.0, 0.0, 0.0);
    // East: increasing right ascension.
    vec3 east = normalize(cross(vec3(0.0, 0.0, 1.0), p));

    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(localPosition, 1.0);
    vec4 cN = projectionMatrix * modelViewMatrix * vec4(localPosition + north * 0.4, 1.0);
    vec4 cE = projectionMatrix * modelViewMatrix * vec4(localPosition + east * 0.4, 1.0);
    vec2 s0 = c0.xy / c0.w;
    northScreen = normalize((cN.xy / cN.w - s0) * vec2(aspect, 1.0));
    eastScreen = normalize((cE.xy / cE.w - s0) * vec2(aspect, 1.0));
  }
`

/**
 * The all-sky photograph.
 *
 * Drawn on a large inverted sphere inside the sky group, so it is already in the J2000
 * equatorial frame and follows the sky as it turns. The panorama itself is stored in
 * galactic coordinates, so the fragment shader rotates each view direction into that
 * frame with a matrix supplied by astronomy-engine and samples the equirectangular
 * image directly. Nothing about the alignment is guessed.
 */
const SKY_IMAGE_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_IMAGE_FRAGMENT = /* glsl */ `
  uniform sampler2D panorama;
  uniform mat3 equatorialToGalactic;
  uniform float intensity;
  varying vec3 vDirection;

  const float PI = 3.14159265358979;

  void main() {
    vec3 galactic = normalize(equatorialToGalactic * normalize(vDirection));
    float latitude = asin(clamp(galactic.z, -1.0, 1.0));
    float longitude = atan(galactic.y, galactic.x);

    // Galactic longitude increases to the left in the panorama, and latitude runs from
    // +90 at the top down to -90 at the bottom.
    vec2 uv = vec2(0.5 - longitude / (2.0 * PI), 0.5 - latitude / PI);

    vec3 colour = texture2D(panorama, uv).rgb;
    // The photograph is a backdrop, not the subject: hold it well below the computed
    // stars so labels and markers stay legible on top of it.
    gl_FragColor = vec4(colour * intensity, 1.0);
  }
`

/** A survey cutout, drawn on a mesh whose vertices carry the real sky positions. */
const OBJECT_IMAGE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const OBJECT_IMAGE_FRAGMENT = /* glsl */ `
  uniform sampler2D cutout;
  uniform float opacity;
  varying vec2 vUv;

  void main() {
    vec3 colour = texture2D(cutout, vUv).rgb;
    // Feather the border so the cutout blends into the surrounding sky instead of
    // ending at a hard square edge.
    vec2 edge = min(vUv, 1.0 - vUv);
    float fade = smoothstep(0.0, 0.06, min(edge.x, edge.y));
    gl_FragColor = vec4(colour, opacity * fade);
  }
`

const STAR_VERTEX = /* glsl */ `
  attribute float magnitude;
  attribute float seed;
  attribute vec3 tint;
  uniform float magnitudeLimit;
  uniform float zoom;
  uniform float pixelRatio;
  uniform float elapsed;
  uniform float twinkle;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vSpike;

  void main() {
    vTint = tint;
    // Fade a star out over the last magnitude before the limit instead of popping it off.
    vAlpha = clamp(magnitudeLimit + 0.6 - magnitude, 0.0, 1.0);

    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;

    // Scintillation is an atmospheric effect, so it is strongest near the horizon and
    // almost absent at the zenith. sin(altitude) is just the normalised world height.
    float sinAltitude = clamp(world.y / 100.0, -1.0, 1.0);
    float airmass = 1.0 - smoothstep(0.02, 0.7, sinAltitude);
    // Two incommensurate frequencies per star give an irregular flicker rather than a pulse.
    float phase = seed * 6.2831853;
    float flicker =
      sin(elapsed * 2.7 + phase) * 0.6 + sin(elapsed * 6.1 + phase * 2.3) * 0.4;
    float amplitude = twinkle * mix(0.03, 0.32, airmass);
    float modulation = 1.0 + flicker * amplitude;

    vAlpha *= clamp(modulation, 0.35, 1.6);

    // Brighter stars get bigger points; zoom scales everything so the sky feels
    // magnified rather than merely cropped.
    float size = max(1.1, (magnitudeLimit + 1.2 - magnitude) * 1.35) * zoom * pixelRatio;
    // Only genuinely bright stars earn diffraction spikes, and they need the extra
    // point area to draw them into.
    vSpike = smoothstep(2.2, -0.5, magnitude);
    size *= 1.0 + vSpike * 2.2;
    gl_PointSize = size * clamp(modulation, 0.85, 1.15);
    if (vAlpha <= 0.0) gl_PointSize = 0.0;
  }
`

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vTint;
  varying float vAlpha;
  varying float vSpike;

  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float distance = length(offset);
    if (distance > 0.5) discard;

    // Core: a bright centre with a short falloff, which reads as a star rather than a
    // square dot and hides how few pixels a small point actually has.
    float core = smoothstep(0.5, 0.06, distance);
    float intensity = core;

    // Diffraction spikes, as a telescope or a camera lens would produce them. Only the
    // brightest stars get them, which is also how the eye perceives real brightness.
    if (vSpike > 0.01) {
      float horizontal = pow(max(0.0, 1.0 - abs(offset.y) * 26.0), 2.0);
      float vertical = pow(max(0.0, 1.0 - abs(offset.x) * 26.0), 2.0);
      float falloff = smoothstep(0.5, 0.0, distance);
      intensity += (horizontal + vertical) * falloff * vSpike * 0.55;
      // A soft halo so bright stars bloom the way they do to the naked eye.
      intensity += exp(-distance * 9.0) * vSpike * 0.35;
    }

    gl_FragColor = vec4(vTint, clamp(intensity, 0.0, 1.0) * vAlpha);
  }
`

/**
 * Telescopic stars. Sub-pixel dots, no twinkle, no spikes — they exist collectively,
 * as the Milky Way, rather than individually.
 */
const FAINT_STAR_VERTEX = /* glsl */ `
  attribute float magnitude;
  attribute vec3 tint;
  uniform float zoom;
  uniform float pixelRatio;
  uniform float opacity;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vTint = tint;
    vAlpha = clamp((9.5 - magnitude) * 0.36, 0.08, 0.7) * opacity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, (9.6 - magnitude) * 0.42) * zoom * pixelRatio;
  }
`

const FAINT_STAR_FRAGMENT = /* glsl */ `
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    if (length(offset) > 0.5) discard;
    float core = smoothstep(0.5, 0.1, length(offset));
    gl_FragColor = vec4(vTint, core * vAlpha);
  }
`

/**
 * Extended objects — nebulae, clusters and galaxies — drawn at their real catalogued
 * angular size and shape rather than as uniform dots, so a sprawling nebula looks
 * sprawling and a distant galaxy looks small.
 */
const NEBULA_VERTEX = /* glsl */ `
  attribute float majorAxis;   // degrees
  attribute float axisRatio;   // minor / major, 1.0 when unknown
  attribute float positionAngle; // radians, from north toward east
  attribute float seed;
  attribute vec3 tint;
  uniform float pxPerDegree;
  uniform float pixelRatio;
  uniform float aspect;
  uniform float elapsed;
  uniform float animate;
  varying vec3 vTint;
  varying vec2 vMajorDir;
  varying float vRatio;
  varying float vPulse;

  ${SKY_ORIENTATION}

  void main() {
    vTint = tint;
    vRatio = axisRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    vec2 northScreen;
    vec2 eastScreen;
    skyAxes(position, aspect, northScreen, eastScreen);
    // Position angle is measured from north toward east, by definition.
    vMajorDir = normalize(cos(positionAngle) * northScreen + sin(positionAngle) * eastScreen);

    // A slow, shallow breath. Real nebulae do not pulse; this is a legibility cue that
    // says "this is diffuse, not a star", and it is disabled under reduced motion.
    vPulse = 1.0 + animate * sin(elapsed * 0.6 + seed * 6.2831853) * 0.07;

    // The sprite has to cover the full ellipse plus the soft glow beyond it.
    float sizeDegrees = max(majorAxis, 0.06) * 2.4;
    gl_PointSize = clamp(sizeDegrees * pxPerDegree, 6.0, 900.0) * pixelRatio * vPulse;
  }
`

const NEBULA_FRAGMENT = /* glsl */ `
  varying vec3 vTint;
  varying vec2 vMajorDir;
  varying float vRatio;
  varying float vPulse;

  void main() {
    // gl_PointCoord runs top-down; flip y so the maths is in normal screen orientation.
    vec2 offset = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
    vec2 minorDir = vec2(-vMajorDir.y, vMajorDir.x);
    float along = dot(offset, vMajorDir);
    float across = dot(offset, minorDir) / max(vRatio, 0.12);
    float radius = length(vec2(along, across));

    // Gaussian core with a wider, fainter skirt: diffuse objects have no edge.
    float glow = exp(-radius * radius * 5.5) * 0.8 + exp(-radius * radius * 1.9) * 0.22;
    // The sprite is a square quad. Without this the faint skirt is chopped off at the
    // quad boundary and every nebula gets a visible box around it.
    float quadFade = smoothstep(1.0, 0.62, length(offset));
    glow *= quadFade;
    if (glow < 0.004) discard;
    gl_FragColor = vec4(vTint, glow);
  }
`

const MARKER_VERTEX = /* glsl */ `
  attribute float markerSize;
  attribute float markerOpacity;
  attribute vec3 tint;
  uniform float zoom;
  uniform float pixelRatio;
  varying vec3 vTint;
  varying float vOpacity;
  void main() {
    vTint = tint;
    vOpacity = markerOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = markerSize * zoom * pixelRatio;
  }
`

const MARKER_FRAGMENT = /* glsl */ `
  uniform float ringFade;
  varying vec3 vTint;
  varying float vOpacity;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float distance = length(offset);
    // A hollow ring, so a deep-sky marker never looks like a star.
    float ring = smoothstep(0.5, 0.44, distance) * smoothstep(0.28, 0.36, distance);
    if (ring <= 0.01) discard;
    gl_FragColor = vec4(vTint, ring * vOpacity * ringFade);
  }
`

/**
 * Black holes get their own mark: a dark centre inside a turning accretion ring. It is
 * a symbol, not a picture — nothing about a black hole is visible at these scales — but
 * it makes the one class of object that emits no light impossible to miss.
 */
const BLACK_HOLE_VERTEX = /* glsl */ `
  attribute float markerSize;
  attribute float seed;
  uniform float zoom;
  uniform float pixelRatio;
  varying float vSeed;
  void main() {
    vSeed = seed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = markerSize * zoom * pixelRatio;
  }
`

const BLACK_HOLE_FRAGMENT = /* glsl */ `
  uniform float elapsed;
  uniform float animate;
  varying float vSeed;

  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float radius = length(offset) * 2.0;
    if (radius > 1.0) discard;

    // Event-horizon shadow: a hard dark disc that occludes whatever is behind it.
    float shadow = smoothstep(0.42, 0.30, radius);

    // Accretion ring, brightened on one side and turning slowly.
    float angle = atan(offset.y, offset.x);
    float spin = elapsed * 0.9 * animate + vSeed * 6.2831853;
    float doppler = 0.55 + 0.45 * sin(angle * 1.0 - spin);
    float ring = smoothstep(0.40, 0.52, radius) * smoothstep(0.80, 0.58, radius);
    float halo = exp(-pow((radius - 0.55) * 4.5, 2.0)) * 0.5;

    vec3 hot = vec3(1.0, 0.78, 0.42);
    vec3 cool = vec3(0.62, 0.45, 1.0);
    vec3 colour = mix(cool, hot, doppler);

    float alpha = (ring * (0.45 + 0.75 * doppler) + halo) * (1.0 - shadow);
    // The shadow itself is painted as near-black so the ring reads as surrounding a void.
    gl_FragColor = vec4(colour * (1.0 - shadow), clamp(alpha + shadow * 0.92, 0.0, 1.0));
  }
`

/**
 * The Moon, drawn with its actual phase.
 *
 * The terminator of a sphere lit from the side projects to a half-ellipse: a point
 * (x, y) on the unit disc is lit when `x > -cos(g) * sqrt(1 - y^2)`, with x measured
 * along the direction of the bright limb and g the Sun-Moon-Earth phase angle. The
 * illuminated fraction gives `cos(g) = 2f - 1`, and the bright limb always points at
 * the Sun, whose direction is passed in and projected to screen space here.
 */
const MOON_VERTEX = /* glsl */ `
  uniform vec3 sunDirection;
  uniform float sizePixels;
  uniform float pixelRatio;
  uniform float aspect;
  varying vec2 vBrightDir;

  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip;

    vec3 moon = normalize(position);
    // Component of the Sun direction tangent to the sphere at the Moon's position.
    vec3 toSun = sunDirection - moon * dot(sunDirection, moon);
    float len = length(toSun);
    toSun = len > 1e-5 ? toSun / len : vec3(1.0, 0.0, 0.0);

    vec4 offsetClip = projectionMatrix * modelViewMatrix * vec4(position + toSun * 0.4, 1.0);
    vec2 here = clip.xy / clip.w;
    vec2 there = offsetClip.xy / offsetClip.w;
    vBrightDir = normalize((there - here) * vec2(aspect, 1.0));

    gl_PointSize = sizePixels * pixelRatio;
  }
`

const MOON_FRAGMENT = /* glsl */ `
  uniform float illumination;
  varying vec2 vBrightDir;

  void main() {
    vec2 offset = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
    float radius = length(offset);
    if (radius > 1.0) discard;

    vec2 perpendicular = vec2(-vBrightDir.y, vBrightDir.x);
    float along = dot(offset, vBrightDir);
    float across = dot(offset, perpendicular);

    float cosPhase = 2.0 * illumination - 1.0;
    float terminator = -cosPhase * sqrt(max(0.0, 1.0 - across * across));
    float lit = smoothstep(terminator - 0.07, terminator + 0.07, along);

    vec3 sunlit = vec3(0.99, 0.97, 0.92);
    // Earthshine: the unlit part is faintly visible, most obviously near new Moon.
    vec3 earthshine = vec3(0.09, 0.10, 0.14);
    float edge = smoothstep(1.0, 0.90, radius);
    gl_FragColor = vec4(mix(earthshine, sunlit, lit), edge);
  }
`

const PLANET_VERTEX = /* glsl */ `
  attribute float markerSize;
  attribute vec3 tint;
  uniform float zoom;
  uniform float pixelRatio;
  varying vec3 vTint;
  void main() {
    vTint = tint;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = markerSize * zoom * pixelRatio;
  }
`

const PLANET_FRAGMENT = /* glsl */ `
  varying vec3 vTint;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float distance = length(offset);
    if (distance > 0.5) discard;
    // Planets shine steadily — no twinkle — with a soft glow around a solid disc.
    float core = smoothstep(0.34, 0.12, distance);
    float glow = exp(-distance * 7.0) * 0.55;
    gl_FragColor = vec4(vTint, clamp(core + glow, 0.0, 1.0));
  }
`

export interface SkyRendererCallbacks {
  onCameraChange?: (camera: CameraState) => void
  onSelect?: (objectId: string | null) => void
  onHover?: (objectId: string | null) => void
}

export class SkyRenderer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly skyGroup = new THREE.Group()
  private readonly worldGroup = new THREE.Group()

  private stars: THREE.Points | null = null
  private faintStars: THREE.Points | null = null
  private nebulae: THREE.Points | null = null
  private blackHoles: THREE.Points | null = null
  private moon: THREE.Points | null = null
  private skyImage: THREE.Mesh | null = null
  private objectImage: THREE.Mesh | null = null
  private objectImageId: string | null = null
  private blackHoleObjects: SkyObject[] = []
  private starObjects: SkyObject[] = []
  private constellationLines: THREE.LineSegments | null = null
  private deepSkyPoints: THREE.Points | null = null
  private deepSkyObjects: SkyObject[] = []
  private planetPoints: THREE.Points | null = null
  private planetObjects: SkyObject[] = []
  private satellitePoints: THREE.Points | null = null
  private satelliteStates: SatelliteState[] = []
  private horizon: THREE.Group | null = null
  private grid: THREE.LineSegments | null = null

  private labelTargets: LabelTarget[] = []
  private labelElements = new Map<string, HTMLElement>()
  private pickTargets: PickTarget[] = []

  private catalog: Catalog | null = null
  private options: SkyOptions
  private cameraState: CameraState = { ...DEFAULT_CAMERA }
  private skyMatrix = new THREE.Matrix4()
  private skyMatrixInverse = new THREE.Matrix4()
  private time = new Date()
  private location: GeoLocation
  private selectedId: string | null = null

  private frame = 0
  /** Rendered diameter of the Moon sprite in CSS pixels, used to place its label. */
  private moonSizeCss = 18
  private startedAt = performance.now()
  /** 0 disables every animation, for users who ask for reduced motion. */
  private animate = 1
  private disposed = false
  private animation: { target: CameraState; start: CameraState; startedAt: number; duration: number } | null = null
  private pointerDown: { x: number; y: number; moved: boolean } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLElement,
    location: GeoLocation,
    options: SkyOptions,
    private readonly callbacks: SkyRendererCallbacks = {}
  ) {
    this.location = location
    this.options = options

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setClearColor(0x04060f, 1)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Twinkle, nebula breathing and the turning accretion rings are all motion. Honour
    // the operating system's reduced-motion preference and switch them off.
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    this.animate = reducedMotion?.matches ? 0 : 1
    reducedMotion?.addEventListener?.('change', (event) => {
      this.animate = event.matches ? 0 : 1
    })

    this.camera = new THREE.PerspectiveCamera(this.cameraState.fov, 1, 0.1, 1000)
    this.scene.add(this.skyGroup)
    this.scene.add(this.worldGroup)

    this.buildHorizon()
    this.buildGrid()
    this.buildCardinalLabels()

    this.attachEvents()
    this.resize()
    this.updateSkyMatrix()
    this.loop()
  }

  // ------------------------------------------------------------ public API

  setCatalog(catalog: Catalog): void {
    this.catalog = catalog
    this.buildStars()
    this.buildFaintStars()
    this.buildConstellations()
    this.buildDeepSky()
    this.buildNebulae()
    this.buildBlackHoles()
    this.buildMoon()
    this.buildPlanets()
    this.refreshLabels()
  }

  setTime(time: Date): void {
    this.time = time
    this.updateSkyMatrix()
    this.updatePlanetPositions()
  }

  setLocation(location: GeoLocation): void {
    this.location = location
    this.updateSkyMatrix()
    this.updatePlanetPositions()
  }

  setOptions(options: SkyOptions): void {
    const magnitudeChanged = options.starMagnitudeLimit !== this.options.starMagnitudeLimit
    const beginnerChanged = options.beginnerMode !== this.options.beginnerMode
    this.options = options

    if (this.stars) {
      const material = this.stars.material as THREE.ShaderMaterial
      material.uniforms.magnitudeLimit.value = options.starMagnitudeLimit
    }
    if (this.constellationLines) this.constellationLines.visible = options.showConstellationLines
    if (this.deepSkyPoints) this.deepSkyPoints.visible = options.showDeepSky
    if (this.nebulae) this.nebulae.visible = options.showDeepSky
    if (this.blackHoles) this.blackHoles.visible = options.showBlackHoles
    if (this.faintStars) this.faintStars.visible = options.showMilkyWay
    if (this.skyImage) this.skyImage.visible = options.showSkyImagery
    if (this.objectImage) this.objectImage.visible = options.showObjectImagery
    if (this.horizon) this.horizon.visible = options.showHorizon
    if (this.grid) this.grid.visible = options.showGrid
    if (this.satellitePoints) this.satellitePoints.visible = options.showSatellites

    if (beginnerChanged) this.buildConstellations()
    if (magnitudeChanged || beginnerChanged) this.refreshLabels()
    else this.refreshLabels()
  }

  setSatellites(states: SatelliteState[]): void {
    this.satelliteStates = states
    this.buildSatellites()
  }

  setSelected(objectId: string | null): void {
    this.selectedId = objectId
    this.refreshLabels()
  }

  getCameraState(): CameraState {
    return { ...this.cameraState }
  }

  /** Points the camera at an object, animating over `duration` milliseconds. */
  focusOnObject(object: SkyObject, duration = 700): void {
    const position = getPosition(object, this.time, this.location)
    this.focusOnHorizontal(position.altitude, position.azimuth, duration)
  }

  focusOnHorizontal(altitude: number, azimuth: number, duration = 700): void {
    const target: CameraState = {
      altitude: Math.max(-85, Math.min(85, altitude)),
      azimuth,
      fov: Math.min(this.cameraState.fov, 40)
    }
    if (duration <= 0) {
      this.cameraState = target
      this.callbacks.onCameraChange?.(this.getCameraState())
      return
    }
    this.animation = {
      start: { ...this.cameraState },
      target,
      startedAt: performance.now(),
      duration
    }
  }

  zoomBy(factor: number): void {
    this.setFov(this.cameraState.fov * factor)
  }

  setFov(fov: number): void {
    this.cameraState.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, fov))
    this.callbacks.onCameraChange?.(this.getCameraState())
  }

  /** Nudges the camera, used by the arrow-key handlers. */
  pan(deltaAzimuth: number, deltaAltitude: number): void {
    this.applyPan(deltaAzimuth, deltaAltitude)
  }

  resetView(): void {
    this.animation = null
    this.cameraState = { ...DEFAULT_CAMERA }
    this.callbacks.onCameraChange?.(this.getCameraState())
  }

  resize(): void {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.detachEvents()
    this.scene.traverse((node) => {
      const mesh = node as Partial<THREE.Mesh>
      mesh.geometry?.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose()
    })
    this.renderer.dispose()
    this.overlay.replaceChildren()
  }

  // -------------------------------------------------------------- geometry

  private buildStars(): void {
    if (!this.catalog) return
    if (this.stars) {
      this.skyGroup.remove(this.stars)
      this.stars.geometry.dispose()
    }

    const stars = this.catalog.stars
    const positions = new Float32Array(stars.length * 3)
    const tints = new Float32Array(stars.length * 3)
    const magnitudes = new Float32Array(stars.length)
    // Per-star phase offset, so no two stars twinkle in step.
    const seeds = new Float32Array(stars.length)
    const genitives = new Map(this.catalog.constellations.map((c) => [c.id, c.genitive ?? c.name]))

    this.starObjects = []
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i]
      const v = eqjUnitVector(star.r, star.d)
      positions[i * 3] = v.x * SKY_RADIUS
      positions[i * 3 + 1] = v.y * SKY_RADIUS
      positions[i * 3 + 2] = v.z * SKY_RADIUS
      const color = colorFromBv(star.c)
      tints[i * 3] = color.r
      tints[i * 3 + 1] = color.g
      tints[i * 3 + 2] = color.b
      magnitudes[i] = star.m
      // Deterministic pseudo-random phase derived from the catalogue id, so the sky
      // looks identical every time the app starts.
      seeds[i] = ((star.i * 2654435761) % 1000) / 1000
      this.starObjects.push(
        this.catalog.objects.get(`star:${star.i}`) ??
          ({ id: `star:${star.i}`, name: `HYG ${star.i}` } as SkyObject)
      )
      void genitives
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3))
    geometry.setAttribute('magnitude', new THREE.BufferAttribute(magnitudes, 1))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        magnitudeLimit: { value: this.options.starMagnitudeLimit },
        zoom: { value: 1 },
        pixelRatio: { value: this.renderer.getPixelRatio() },
        elapsed: { value: 0 },
        twinkle: { value: this.animate }
      }
    })

    this.stars = new THREE.Points(geometry, material)
    this.stars.frustumCulled = false
    this.skyGroup.add(this.stars)
  }

  /**
   * Installs the bundled all-sky photograph. Called once, with the JPEG bytes handed
   * over from the main process.
   */
  setSkyImage(bytes: Uint8Array): void {
    if (this.skyImage) {
      this.skyGroup.remove(this.skyImage)
      this.skyImage.geometry.dispose()
      ;(this.skyImage.material as THREE.Material).dispose()
      this.skyImage = null
    }
    if (bytes.byteLength === 0) return

    const { texture, release } = loadJpegTexture(bytes)
    texture.colorSpace = THREE.SRGBColorSpace
    void release
    // No mipmaps: the sampler wraps in longitude, and mipmapped wrapping produces a
    // visible seam down the anti-centre of the galaxy.
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.wrapS = THREE.RepeatWrapping

    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_IMAGE_VERTEX,
      fragmentShader: SKY_IMAGE_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        panorama: { value: texture },
        equatorialToGalactic: { value: equatorialToGalacticMatrix() },
        intensity: { value: SKY_IMAGE_INTENSITY }
      }
    })

    // Just inside the objects, and drawn before everything else.
    this.skyImage = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS * 0.98, 64, 32), material)
    this.skyImage.frustumCulled = false
    this.skyImage.renderOrder = -10
    this.skyImage.visible = this.options.showSkyImagery
    this.skyGroup.add(this.skyImage)
  }

  /**
   * Places a survey cutout on the sky.
   *
   * The mesh is built from the image's own projection: a gnomonic (TAN) cutout with
   * north up and east left. Each vertex is converted from its pixel position to a real
   * J2000 direction, so the image lands at the object's true position, scale and
   * orientation and stays registered with the catalogue stars drawn on top of it.
   */
  setObjectImage(
    objectId: string | null,
    bytes: Uint8Array | null,
    raHours: number,
    decDegrees: number,
    fovDegrees: number
  ): void {
    if (this.objectImage) {
      this.skyGroup.remove(this.objectImage)
      this.objectImage.geometry.dispose()
      ;(this.objectImage.material as THREE.Material).dispose()
      this.objectImage = null
    }
    this.objectImageId = objectId
    if (!objectId || !bytes || bytes.byteLength === 0) return

    const { texture } = loadJpegTexture(bytes)
    texture.colorSpace = THREE.SRGBColorSpace

    const material = new THREE.ShaderMaterial({
      vertexShader: OBJECT_IMAGE_VERTEX,
      fragmentShader: OBJECT_IMAGE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        cutout: { value: texture },
        opacity: { value: 1 }
      }
    })

    this.objectImage = new THREE.Mesh(
      buildCutoutGeometry(raHours, decDegrees, fovDegrees),
      material
    )
    this.objectImage.frustumCulled = false
    // Above the panorama and the nebula glows, below the star points and markers.
    this.objectImage.renderOrder = -3
    this.objectImage.visible = this.options.showObjectImagery
    this.skyGroup.add(this.objectImage)
  }

  /** Which object currently has a cutout on screen, if any. */
  getObjectImageId(): string | null {
    return this.objectImageId
  }

  /**
   * The Milky Way, rendered as what it actually is: 74 000 real telescopic stars from
   * the HYG catalogue. Their density along the galactic plane produces the band without
   * anything being drawn schematically.
   */
  private buildFaintStars(): void {
    if (!this.catalog) return
    if (this.faintStars) {
      this.skyGroup.remove(this.faintStars)
      this.faintStars.geometry.dispose()
    }

    const flat = this.catalog.faintStars
    const count = Math.floor(flat.length / 4)
    if (count === 0) {
      this.faintStars = null
      return
    }

    const positions = new Float32Array(count * 3)
    const tints = new Float32Array(count * 3)
    const magnitudes = new Float32Array(count)
    const colour = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const ra = flat[i * 4]
      const dec = flat[i * 4 + 1]
      const v = eqjUnitVector(ra, dec)
      positions[i * 3] = v.x * SKY_RADIUS
      positions[i * 3 + 1] = v.y * SKY_RADIUS
      positions[i * 3 + 2] = v.z * SKY_RADIUS
      magnitudes[i] = flat[i * 4 + 2]
      colour.copy(colorFromBv(flat[i * 4 + 3]))
      tints[i * 3] = colour.r
      tints[i * 3 + 1] = colour.g
      tints[i * 3 + 2] = colour.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3))
    geometry.setAttribute('magnitude', new THREE.BufferAttribute(magnitudes, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: FAINT_STAR_VERTEX,
      fragmentShader: FAINT_STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        zoom: { value: 1 },
        pixelRatio: { value: this.renderer.getPixelRatio() },
        opacity: { value: 1 }
      }
    })

    this.faintStars = new THREE.Points(geometry, material)
    this.faintStars.frustumCulled = false
    this.faintStars.visible = this.options.showMilkyWay
    // Drawn first, underneath everything else.
    this.faintStars.renderOrder = -2
    this.skyGroup.add(this.faintStars)
  }

  /**
   * Diffuse objects drawn at their catalogued angular size, shape and orientation, so
   * the Andromeda Galaxy really is six full-Moons long and really does lie at a
   * position angle of 35 degrees.
   */
  private buildNebulae(): void {
    if (!this.catalog) return
    if (this.nebulae) {
      this.skyGroup.remove(this.nebulae)
      this.nebulae.geometry.dispose()
    }

    // Only objects with a measured size, and only ones bright enough to be worth
    // showing, get a glow; the rest keep their ring marker alone. Dark nebulae are
    // excluded outright — they are silhouettes, and an additive glow would render them
    // as exactly the opposite of what they are.
    const entries = this.catalog.deepSky.filter(
      (d) =>
        d.size !== null &&
        d.size > 0 &&
        d.t !== 'dark-nebula' &&
        (d.m !== null || (d.v !== null && d.v <= 10))
    )
    const count = entries.length
    const positions = new Float32Array(count * 3)
    const tints = new Float32Array(count * 3)
    const major = new Float32Array(count)
    const ratio = new Float32Array(count)
    const angle = new Float32Array(count)
    const seeds = new Float32Array(count)

    /**
     * Colours follow what the objects actually look like in long-exposure images:
     * hydrogen-emission nebulae glow red-pink from H-alpha, reflection nebulae scatter
     * blue starlight, planetary nebulae are green-teal from doubly-ionised oxygen,
     * globular clusters are dominated by old yellow stars and open clusters by young
     * blue ones. Keyed on the raw OpenNGC class so those distinctions survive.
     */
    const RAW_PALETTE: Record<string, number> = {
      HII: 0xff7f9e, // emission nebula
      EmN: 0xff8fa8,
      RfN: 0x8fb6ff, // reflection nebula
      Neb: 0xd79ce0,
      'Cl+N': 0xff9ec4,
      PN: 0x63e8c8, // planetary nebula
      SNR: 0xff9a7a,
      OCl: 0xa8d4ff,
      GCl: 0xffcf8f,
      G: 0xe4d6ff,
      GPair: 0xe4d6ff,
      GTrpl: 0xe4d6ff,
      GGroup: 0xe4d6ff
    }

    for (let i = 0; i < count; i++) {
      const entry = entries[i]
      const v = eqjUnitVector(entry.r, entry.d)
      positions[i * 3] = v.x * SKY_RADIUS
      positions[i * 3 + 1] = v.y * SKY_RADIUS
      positions[i * 3 + 2] = v.z * SKY_RADIUS

      const colour = new THREE.Color(RAW_PALETTE[entry.rawType] ?? 0xc8d8ff)
      // Fainter objects glow more weakly, which is both truthful and stops the sky
      // filling up with equally loud smudges.
      const brightness = entry.v === null ? 0.26 : Math.max(0.12, Math.min(0.85, (11 - entry.v) / 9))
      tints[i * 3] = colour.r * brightness
      tints[i * 3 + 1] = colour.g * brightness
      tints[i * 3 + 2] = colour.b * brightness

      major[i] = (entry.size ?? 1) / 60 // arcminutes -> degrees
      ratio[i] = entry.minor && entry.size ? Math.min(1, entry.minor / entry.size) : 1
      angle[i] = ((entry.angle ?? 0) * Math.PI) / 180
      seeds[i] = (i % 97) / 97
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3))
    geometry.setAttribute('majorAxis', new THREE.BufferAttribute(major, 1))
    geometry.setAttribute('axisRatio', new THREE.BufferAttribute(ratio, 1))
    geometry.setAttribute('positionAngle', new THREE.BufferAttribute(angle, 1))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        pxPerDegree: { value: 20 },
        pixelRatio: { value: this.renderer.getPixelRatio() },
        aspect: { value: 1 },
        elapsed: { value: 0 },
        animate: { value: this.animate }
      }
    })

    this.nebulae = new THREE.Points(geometry, material)
    this.nebulae.frustumCulled = false
    this.nebulae.visible = this.options.showDeepSky
    this.nebulae.renderOrder = -1
    this.skyGroup.add(this.nebulae)
  }

  /**
   * The Moon gets its own sprite so it can be drawn with its real phase rather than as
   * a featureless dot. Its true angular diameter is about half a degree, but a
   * half-degree disc is only a few pixels at a typical field of view, so the sprite is
   * given a floor — the same exaggeration every planetarium makes so the phase is
   * legible.
   */
  private buildMoon(): void {
    if (!this.catalog) return
    if (this.moon) {
      this.skyGroup.remove(this.moon)
      this.moon.geometry.dispose()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))

    const material = new THREE.ShaderMaterial({
      vertexShader: MOON_VERTEX,
      fragmentShader: MOON_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        illumination: { value: 0.5 },
        sizePixels: { value: 18 },
        pixelRatio: { value: this.renderer.getPixelRatio() },
        aspect: { value: 1 }
      }
    })

    this.moon = new THREE.Points(geometry, material)
    this.moon.frustumCulled = false
    this.moon.renderOrder = 2
    this.skyGroup.add(this.moon)
    this.updateMoon()
  }

  private updateMoon(): void {
    if (!this.moon || !this.catalog) return
    const moonObject = this.catalog.objects.get('moon')
    const sunObject = this.catalog.objects.get('sun')
    if (!moonObject || !sunObject) return

    try {
      const moonPosition = getPosition(moonObject, this.time, this.location)
      const sunPosition = getPosition(sunObject, this.time, this.location)
      const moonLocal = this.horizontalToEqjLocal(moonPosition.altitude, moonPosition.azimuth)
      const sunLocal = this.horizontalToEqjLocal(sunPosition.altitude, sunPosition.azimuth)

      const positions = this.moon.geometry.getAttribute('position') as THREE.BufferAttribute
      positions.setXYZ(0, moonLocal.x * SKY_RADIUS, moonLocal.y * SKY_RADIUS, moonLocal.z * SKY_RADIUS)
      positions.needsUpdate = true

      const { uniforms } = this.moon.material as THREE.ShaderMaterial
      uniforms.sunDirection.value.set(sunLocal.x, sunLocal.y, sunLocal.z)
      uniforms.illumination.value = getIllumination(moonObject, this.time) ?? 0.5
    } catch {
      // A moment astronomy-engine cannot evaluate simply leaves the Moon where it was.
    }
  }

  private buildBlackHoles(): void {
    if (!this.catalog) return
    if (this.blackHoles) {
      this.skyGroup.remove(this.blackHoles)
      this.blackHoles.geometry.dispose()
    }

    const entries = this.catalog.blackHoles
    this.blackHoleObjects = entries.map(
      (entry) => this.catalog?.objects.get(`bh:${entry.id}`) ?? blackHoleToSkyObject(entry)
    )

    const count = entries.length
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const seeds = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const entry = entries[i]
      const v = eqjUnitVector(entry.r, entry.d)
      positions[i * 3] = v.x * SKY_RADIUS
      positions[i * 3 + 1] = v.y * SKY_RADIUS
      positions[i * 3 + 2] = v.z * SKY_RADIUS
      sizes[i] = entry.category === 'supermassive' ? 30 : 24
      seeds[i] = (i % 17) / 17
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('markerSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERTEX,
      fragmentShader: BLACK_HOLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        zoom: { value: 1 },
        pixelRatio: { value: this.renderer.getPixelRatio() },
        elapsed: { value: 0 },
        animate: { value: this.animate }
      }
    })

    this.blackHoles = new THREE.Points(geometry, material)
    this.blackHoles.frustumCulled = false
    this.blackHoles.visible = this.options.showBlackHoles
    // Above the nebula glow so the shadow reads as a shadow.
    this.blackHoles.renderOrder = 1
    this.skyGroup.add(this.blackHoles)
  }

  private buildConstellations(): void {
    if (!this.catalog) return
    if (this.constellationLines) {
      this.skyGroup.remove(this.constellationLines)
      this.constellationLines.geometry.dispose()
    }

    const vertices: number[] = []
    for (const constellation of this.catalog.constellations) {
      if (this.options.beginnerMode && !BEGINNER_CONSTELLATIONS.has(constellation.id)) continue
      for (const segment of constellation.lines) {
        for (let i = 0; i + 1 < segment.length; i++) {
          for (const [ra, dec] of [segment[i], segment[i + 1]]) {
            const v = eqjUnitVector(ra, dec)
            vertices.push(v.x * SKY_RADIUS, v.y * SKY_RADIUS, v.z * SKY_RADIUS)
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    const material = new THREE.LineBasicMaterial({
      color: 0x3f5f9e,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    })
    this.constellationLines = new THREE.LineSegments(geometry, material)
    this.constellationLines.frustumCulled = false
    this.constellationLines.visible = this.options.showConstellationLines
    this.skyGroup.add(this.constellationLines)
  }

  private buildDeepSky(): void {
    if (!this.catalog) return
    if (this.deepSkyPoints) {
      this.skyGroup.remove(this.deepSkyPoints)
      this.deepSkyPoints.geometry.dispose()
    }

    // Only objects a user could plausibly observe; the full 1 300 would be clutter.
    const entries = this.catalog.deepSky.filter((d) => d.m !== null || (d.v !== null && d.v <= 9))
    const positions = new Float32Array(entries.length * 3)
    const tints = new Float32Array(entries.length * 3)
    const sizes = new Float32Array(entries.length)
    const opacities = new Float32Array(entries.length)
    this.deepSkyObjects = []

    const palette: Record<string, THREE.Color> = {
      galaxy: new THREE.Color(0xa78bfa),
      'globular-cluster': new THREE.Color(0xfbbf7a),
      'open-cluster': new THREE.Color(0x7dd3fc),
      nebula: new THREE.Color(0x6ee7b7),
      'planetary-nebula': new THREE.Color(0x5eead4),
      'supernova-remnant': new THREE.Color(0xfca5a5)
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const v = eqjUnitVector(entry.r, entry.d)
      positions[i * 3] = v.x * SKY_RADIUS
      positions[i * 3 + 1] = v.y * SKY_RADIUS
      positions[i * 3 + 2] = v.z * SKY_RADIUS
      const color = palette[entry.t] ?? new THREE.Color(0x9fe8d0)
      tints[i * 3] = color.r
      tints[i * 3 + 1] = color.g
      tints[i * 3 + 2] = color.b
      sizes[i] = entry.m !== null ? 12 : 8
      // Messier objects are the ones worth chasing; the rest sit quietly in the
      // background so they add context without turning the sky into confetti.
      opacities[i] = entry.m !== null ? 0.9 : 0.35
      this.deepSkyObjects.push(
        this.catalog.objects.get(`dso:${entry.id}`) ?? deepSkyToSkyObject(entry)
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3))
    geometry.setAttribute('markerSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('markerOpacity', new THREE.BufferAttribute(opacities, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: MARKER_VERTEX,
      fragmentShader: MARKER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        zoom: { value: 1 },
        pixelRatio: { value: this.renderer.getPixelRatio() },
        ringFade: { value: 1 }
      }
    })
    this.deepSkyPoints = new THREE.Points(geometry, material)
    this.deepSkyPoints.frustumCulled = false
    this.deepSkyPoints.visible = this.options.showDeepSky
    this.skyGroup.add(this.deepSkyPoints)
  }

  private buildPlanets(): void {
    if (!this.catalog) return
    if (this.planetPoints) {
      this.skyGroup.remove(this.planetPoints)
      this.planetPoints.geometry.dispose()
    }

    this.planetObjects = SOLAR_SYSTEM.map((entry) => this.catalog?.objects.get(entry.id)).filter(
      (o): o is SkyObject => Boolean(o)
    )

    const count = this.planetObjects.length
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('markerSize', new THREE.BufferAttribute(new Float32Array(count), 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX,
      fragmentShader: PLANET_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        zoom: { value: 1 },
        pixelRatio: { value: this.renderer.getPixelRatio() }
      }
    })
    this.planetPoints = new THREE.Points(geometry, material)
    this.planetPoints.frustumCulled = false
    this.skyGroup.add(this.planetPoints)
    this.updatePlanetPositions()
  }

  /** Solar-System bodies move, so their vertices are rewritten whenever time changes. */
  private updatePlanetPositions(): void {
    if (!this.planetPoints || this.planetObjects.length === 0) return
    const geometry = this.planetPoints.geometry
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const tints = geometry.getAttribute('tint') as THREE.BufferAttribute
    const sizes = geometry.getAttribute('markerSize') as THREE.BufferAttribute

    const colors: Record<string, number> = {
      sun: 0xfff3c4,
      moon: 0xf2f2f0,
      mercury: 0xd8cbb4,
      venus: 0xfff0c9,
      mars: 0xff9a76,
      jupiter: 0xffd9a0,
      saturn: 0xf6e2a8,
      uranus: 0xb6f0f5,
      neptune: 0xa8c2ff,
      pluto: 0xd9cfc4
    }

    for (let i = 0; i < this.planetObjects.length; i++) {
      const object = this.planetObjects[i]
      let v: Vec3
      try {
        // Position is computed in EQJ so it can live in the sky group with everything else.
        const equatorial = getPosition(object, this.time, this.location)
        const eqj = this.horizontalToEqjLocal(equatorial.altitude, equatorial.azimuth)
        v = eqj
      } catch {
        v = { x: 0, y: 0, z: 0 }
      }
      positions.setXYZ(i, v.x * SKY_RADIUS, v.y * SKY_RADIUS, v.z * SKY_RADIUS)
      const color = new THREE.Color(colors[object.id] ?? 0xffffff)
      tints.setXYZ(i, color.r, color.g, color.b)
      // The Sun is drawn as a bright disc; the Moon has its own phase-aware sprite, so
      // its generic marker is suppressed. The planets are points to the eye but need to
      // be big enough to click.
      sizes.setX(i, object.id === 'moon' ? 0 : object.id === 'sun' ? 26 : 14)
    }
    positions.needsUpdate = true
    tints.needsUpdate = true
    sizes.needsUpdate = true
    this.updateMoon()
    this.refreshLabels()
  }

  /** World-frame direction expressed back in the sky group's local (EQJ) frame. */
  private horizontalToEqjLocal(altitude: number, azimuth: number): Vec3 {
    const world = horizontalToWorld(altitude, azimuth)
    const vector = new THREE.Vector3(world.x, world.y, world.z).applyMatrix4(this.skyMatrixInverse)
    return { x: vector.x, y: vector.y, z: vector.z }
  }

  private buildSatellites(): void {
    if (this.satellitePoints) {
      this.worldGroup.remove(this.satellitePoints)
      this.satellitePoints.geometry.dispose()
    }
    if (this.satelliteStates.length === 0) {
      this.satellitePoints = null
      this.refreshLabels()
      return
    }

    const count = this.satelliteStates.length
    const positions = new Float32Array(count * 3)
    const tints = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const sunlit = new THREE.Color(0xff9de2)
    const shadowed = new THREE.Color(0x6b7280)

    for (let i = 0; i < count; i++) {
      const state = this.satelliteStates[i]
      const v = horizontalToWorld(state.altitude, state.azimuth)
      positions[i * 3] = v.x * SKY_RADIUS
      positions[i * 3 + 1] = v.y * SKY_RADIUS
      positions[i * 3 + 2] = v.z * SKY_RADIUS
      const color = state.sunlit ? sunlit : shadowed
      tints[i * 3] = color.r
      tints[i * 3 + 1] = color.g
      tints[i * 3 + 2] = color.b
      sizes[i] = 10
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3))
    geometry.setAttribute('markerSize', new THREE.BufferAttribute(sizes, 1))
    const material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX,
      fragmentShader: PLANET_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        zoom: { value: 1 },
        pixelRatio: { value: this.renderer.getPixelRatio() }
      }
    })
    this.satellitePoints = new THREE.Points(geometry, material)
    this.satellitePoints.frustumCulled = false
    this.satellitePoints.visible = this.options.showSatellites
    this.worldGroup.add(this.satellitePoints)
    this.refreshLabels()
  }

  private buildHorizon(): void {
    const group = new THREE.Group()

    // Ground: the lower half of the celestial sphere, seen from inside.
    //
    // This has to be a hemisphere rather than a disc. The camera sits at the origin,
    // which is *in* the plane of any horizontal disc, and a plane containing the eye
    // projects to a line rather than a filled region — so a disc occludes nothing at
    // all. The slight transparency keeps objects below the horizon faintly visible,
    // which helps when working out what is about to rise.
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS * 0.96, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x070b16,
        transparent: true,
        opacity: 0.93,
        side: THREE.BackSide,
        depthWrite: false
      })
    )
    ground.renderOrder = 3
    group.add(ground)

    // Horizon ring.
    const points: number[] = []
    for (let i = 0; i <= 360; i++) {
      const v = horizontalToWorld(0, i)
      points.push(v.x * SKY_RADIUS, v.y * SKY_RADIUS, v.z * SKY_RADIUS)
    }
    const ringGeometry = new THREE.BufferGeometry()
    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    const ring = new THREE.Line(
      ringGeometry,
      new THREE.LineBasicMaterial({ color: 0x5a7bb8, transparent: true, opacity: 0.75 })
    )
    ring.renderOrder = 4
    group.add(ring)

    // Tick marks every 10 degrees of azimuth.
    const ticks: number[] = []
    for (let azimuth = 0; azimuth < 360; azimuth += 10) {
      const length = azimuth % 90 === 0 ? 3.5 : azimuth % 30 === 0 ? 2 : 1
      const a = horizontalToWorld(0, azimuth)
      const b = horizontalToWorld(length, azimuth)
      ticks.push(a.x * SKY_RADIUS, a.y * SKY_RADIUS, a.z * SKY_RADIUS)
      ticks.push(b.x * SKY_RADIUS, b.y * SKY_RADIUS, b.z * SKY_RADIUS)
    }
    const tickGeometry = new THREE.BufferGeometry()
    tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3))
    const tickLines = new THREE.LineSegments(
      tickGeometry,
      new THREE.LineBasicMaterial({ color: 0x5a7bb8, transparent: true, opacity: 0.5 })
    )
    tickLines.renderOrder = 4
    group.add(tickLines)

    group.visible = this.options.showHorizon
    this.horizon = group
    this.worldGroup.add(group)
  }

  /** Alt-azimuth grid: circles of equal altitude and lines of equal azimuth. */
  private buildGrid(): void {
    const vertices: number[] = []
    const push = (alt: number, az: number): void => {
      const v = horizontalToWorld(alt, az)
      vertices.push(v.x * SKY_RADIUS, v.y * SKY_RADIUS, v.z * SKY_RADIUS)
    }
    for (let altitude = 0; altitude <= 80; altitude += 20) {
      for (let azimuth = 0; azimuth < 360; azimuth += 3) {
        push(altitude, azimuth)
        push(altitude, azimuth + 3)
      }
    }
    for (let azimuth = 0; azimuth < 360; azimuth += 30) {
      for (let altitude = 0; altitude < 90; altitude += 3) {
        push(altitude, azimuth)
        push(altitude + 3, azimuth)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    this.grid = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x24406e, transparent: true, opacity: 0.4 })
    )
    this.grid.visible = this.options.showGrid
    this.worldGroup.add(this.grid)
  }

  private cardinalTargets: LabelTarget[] = []

  private buildCardinalLabels(): void {
    this.cardinalTargets = []
    for (let azimuth = 0; azimuth < 360; azimuth += 45) {
      const v = horizontalToWorld(2, azimuth)
      this.cardinalTargets.push({
        id: `cardinal:${azimuth}`,
        text: azimuthToCardinal(azimuth),
        kind: 'cardinal',
        local: v,
        frame: 'world',
        priority: 100
      })
    }
  }

  // ---------------------------------------------------------------- labels

  /** Rebuilds the set of labels and pickable objects for the current options. */
  private refreshLabels(): void {
    const labels: LabelTarget[] = [...this.cardinalTargets]
    const picks: PickTarget[] = []

    if (this.catalog) {
      // Stars: named ones only, and only while they are bright enough to be drawn.
      for (const object of this.starObjects) {
        if (object.ra === null || object.dec === null) continue
        const magnitude = object.magnitude ?? 99
        if (magnitude > this.options.starMagnitudeLimit) continue
        const local = eqjUnitVector(object.ra, object.dec)
        picks.push({ id: object.id, local, frame: 'sky', weight: Math.max(0.5, 4 - magnitude) })
        if (!this.options.showStarLabels) continue
        const named = /^[A-Z][a-z]/.test(object.name) && !object.name.startsWith('HIP')
        const threshold = this.options.beginnerMode ? 2.2 : 3.2
        if (named && magnitude <= threshold) {
          labels.push({
            id: object.id,
            text: object.name,
            kind: 'star',
            local,
            frame: 'sky',
            priority: 50 - magnitude
          })
        }
      }

      // Constellation names at their catalogue centres.
      if (this.options.showConstellationLabels) {
        for (const constellation of this.catalog.constellations) {
          if (this.options.beginnerMode && !BEGINNER_CONSTELLATIONS.has(constellation.id)) continue
          const local = eqjUnitVector(constellation.center[0], constellation.center[1])
          labels.push({
            id: `con:${constellation.id}`,
            text: constellation.name,
            kind: 'constellation',
            local,
            frame: 'sky',
            priority: 20 - constellation.rank
          })
          picks.push({ id: `con:${constellation.id}`, local, frame: 'sky', weight: 0.2 })
        }
      }

      if (this.options.showDeepSky) {
        for (const object of this.deepSkyObjects) {
          if (object.ra === null || object.dec === null) continue
          const local = eqjUnitVector(object.ra, object.dec)
          picks.push({ id: object.id, local, frame: 'sky', weight: 1.5 })
          const isMessier = object.aliases.some((a) => /^M\d+$/.test(a))
          if (isMessier) {
            labels.push({
              id: object.id,
              text: object.aliases.find((a) => /^M\d+$/.test(a)) ?? object.name,
              kind: 'deep-sky',
              local,
              frame: 'sky',
              priority: 30
            })
          }
        }
      }

      if (this.options.showBlackHoles) {
        for (const object of this.blackHoleObjects) {
          if (object.ra === null || object.dec === null) continue
          const local = eqjUnitVector(object.ra, object.dec)
          labels.push({
            id: object.id,
            text: object.name,
            kind: 'black-hole',
            local,
            frame: 'sky',
            priority: 70
          })
          picks.push({ id: object.id, local, frame: 'sky', weight: 4 })
        }
      }

      for (const object of this.planetObjects) {
        if (this.options.beginnerMode && !object.beginner) continue
        try {
          const position = getPosition(object, this.time, this.location)
          const local = this.horizontalToEqjLocal(position.altitude, position.azimuth)
          labels.push({
            id: object.id,
            text: object.name,
            kind: object.kind,
            local,
            frame: 'sky',
            priority: 90
          })
          picks.push({ id: object.id, local, frame: 'sky', weight: 3 })
        } catch {
          // A body that astronomy-engine cannot place is simply not drawn.
        }
      }
    }

    if (this.options.showSatellites) {
      for (const state of this.satelliteStates) {
        const local = horizontalToWorld(state.altitude, state.azimuth)
        labels.push({
          id: `sat:${state.noradId}`,
          text: state.name,
          kind: 'satellite',
          local,
          frame: 'world',
          priority: 80
        })
        picks.push({ id: `sat:${state.noradId}`, local, frame: 'world', weight: 3 })
      }
    }

    labels.sort((a, b) => b.priority - a.priority)
    this.labelTargets = labels
    this.pickTargets = picks
    this.syncLabelElements()
  }

  private syncLabelElements(): void {
    const wanted = new Set(this.labelTargets.map((l) => l.id))
    for (const [id, element] of this.labelElements) {
      if (!wanted.has(id)) {
        element.remove()
        this.labelElements.delete(id)
      }
    }
    for (const target of this.labelTargets) {
      let element = this.labelElements.get(target.id)
      if (!element) {
        element = document.createElement('div')
        element.className = `sky-label sky-label--${target.kind}`
        this.overlay.appendChild(element)
        this.labelElements.set(target.id, element)
      }
      if (element.textContent !== target.text) element.textContent = target.text
      element.classList.toggle('font-semibold', target.id === this.selectedId)
      element.style.color = target.id === this.selectedId ? '#ffffff' : ''
    }
  }

  private projectLabels(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const vector = new THREE.Vector3()
    // Simple screen-space occupancy test so labels do not pile on top of each other.
    const occupied: { x: number; y: number; w: number; h: number }[] = []

    for (const target of this.labelTargets) {
      const element = this.labelElements.get(target.id)
      if (!element) continue

      vector.set(target.local.x, target.local.y, target.local.z)
      if (target.frame === 'sky') vector.applyMatrix4(this.skyMatrix)
      const worldY = vector.y
      vector.multiplyScalar(SKY_RADIUS).project(this.camera)

      const screenY = ((1 - vector.y) / 2) * height
      const visible =
        vector.z < 1 &&
        vector.x >= -1 &&
        vector.x <= 1 &&
        vector.y >= -1 &&
        vector.y <= 1 &&
        // Keep clear of the layer chips along the top edge.
        screenY > LABEL_TOP_INSET &&
        // Hide labels for objects under the ground, except the compass points.
        (target.kind === 'cardinal' || worldY > -0.02)

      if (!visible) {
        element.style.display = 'none'
        continue
      }

      const x = ((vector.x + 1) / 2) * width
      const y = ((1 - vector.y) / 2) * height
      const box = { x: x - 30, y: y - 10, w: 62, h: 20 }
      const collides = occupied.some(
        (o) => Math.abs(o.x - box.x) < (o.w + box.w) / 2 && Math.abs(o.y - box.y) < (o.h + box.h) / 2
      )
      if (collides && target.kind !== 'cardinal') {
        element.style.display = 'none'
        continue
      }
      occupied.push(box)

      // The Moon's disc grows with magnification, so its label has to keep clear of it.
      const offset =
        target.id === 'moon'
          ? -(this.moonSizeCss / 2 + 10)
          : labelOffset(target.kind)

      element.style.display = ''
      element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${(y + offset).toFixed(1)}px)`
    }
  }

  // ------------------------------------------------------------- transform

  private updateSkyMatrix(): void {
    const m = eqjToWorldMatrix(this.time, this.location)
    this.skyMatrix.set(
      m[0], m[1], m[2], 0,
      m[3], m[4], m[5], 0,
      m[6], m[7], m[8], 0,
      0, 0, 0, 1
    )
    this.skyMatrixInverse.copy(this.skyMatrix).invert()
    this.skyGroup.matrixAutoUpdate = false
    this.skyGroup.matrix.copy(this.skyMatrix)
    this.skyGroup.matrixWorldNeedsUpdate = true
  }

  private updateCamera(): void {
    if (this.animation) {
      const elapsed = performance.now() - this.animation.startedAt
      const t = Math.min(1, elapsed / this.animation.duration)
      // Ease-out cubic, matching the UI's motion curve.
      const eased = 1 - Math.pow(1 - t, 3)
      const { start, target } = this.animation
      // Take the shorter way round the compass.
      let delta = ((target.azimuth - start.azimuth + 540) % 360) - 180
      this.cameraState = {
        altitude: start.altitude + (target.altitude - start.altitude) * eased,
        azimuth: (start.azimuth + delta * eased + 360) % 360,
        fov: start.fov + (target.fov - start.fov) * eased
      }
      if (t >= 1) this.animation = null
      this.callbacks.onCameraChange?.(this.getCameraState())
    }

    const direction = horizontalToWorld(this.cameraState.altitude, this.cameraState.azimuth)
    this.camera.position.set(0, 0, 0)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(direction.x, direction.y, direction.z)
    if (this.camera.fov !== this.cameraState.fov) {
      this.camera.fov = this.cameraState.fov
      this.camera.updateProjectionMatrix()
    }

    // Zoom factor keeps stars proportionally sized as the field narrows.
    const zoom = Math.sqrt(DEFAULT_CAMERA.fov / this.cameraState.fov)
    const elapsed = ((performance.now() - this.startedAt) / 1000) * this.animate
    // Nebulae are drawn at their true angular size, which means converting degrees of
    // sky into pixels for the current field of view.
    const heightPx = (this.canvas.clientHeight || 1) * this.renderer.getPixelRatio()
    const pxPerDegree = heightPx / this.cameraState.fov
    const aspect = this.camera.aspect

    const layers = [
      this.stars,
      this.faintStars,
      this.nebulae,
      this.deepSkyPoints,
      this.blackHoles,
      this.moon,
      this.planetPoints,
      this.satellitePoints
    ]
    for (const points of layers) {
      if (!points) continue
      const { uniforms } = points.material as THREE.ShaderMaterial
      if (uniforms.zoom) uniforms.zoom.value = zoom
      if (uniforms.elapsed) uniforms.elapsed.value = elapsed
      if (uniforms.pxPerDegree) uniforms.pxPerDegree.value = pxPerDegree
      if (uniforms.aspect) uniforms.aspect.value = aspect
      if (uniforms.twinkle) uniforms.twinkle.value = this.animate
      if (uniforms.animate) uniforms.animate.value = this.animate
    }

    if (this.skyImage) {
      // The panorama is 4000 pixels across the whole sky, so past roughly a 30-degree
      // field it is being magnified past its resolution and turns to blur. Fade it out
      // as the field narrows; survey cutouts take over from there.
      const { uniforms } = this.skyImage.material as THREE.ShaderMaterial
      const fade = smoothstep(12, 34, this.cameraState.fov)
      uniforms.intensity.value = SKY_IMAGE_INTENSITY * fade
      this.skyImage.visible = this.options.showSkyImagery && fade > 0.01
    }

    if (this.deepSkyPoints) {
      // Once an object is magnified enough for its own glow to identify it, the
      // locator ring is just clutter, so it fades out as the field narrows.
      const { uniforms } = this.deepSkyPoints.material as THREE.ShaderMaterial
      uniforms.ringFade.value = Math.min(1, Math.max(0.15, this.cameraState.fov / 22))
    }

    if (this.moon) {
      // Half a degree in pixels, with a floor so the phase stays readable when zoomed out.
      const { uniforms } = this.moon.material as THREE.ShaderMaterial
      uniforms.sizePixels.value = Math.max(16, 0.52 * pxPerDegree)
      this.moonSizeCss = uniforms.sizePixels.value / this.renderer.getPixelRatio()
    }

    // Fade the Milky Way out as the field narrows: at high magnification the faint
    // stars separate into a distracting speckle rather than reading as a glow.
    if (this.faintStars) {
      const material = this.faintStars.material as THREE.ShaderMaterial
      material.uniforms.opacity.value = Math.min(1, this.cameraState.fov / 35)
    }
  }

  private loop = (): void => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    this.updateCamera()
    this.projectLabels()
    this.renderer.render(this.scene, this.camera)
  }

  // ----------------------------------------------------------- interaction

  private applyPan(deltaAzimuth: number, deltaAltitude: number): void {
    this.animation = null
    this.cameraState.azimuth = (this.cameraState.azimuth + deltaAzimuth + 360) % 360
    this.cameraState.altitude = Math.max(
      -89,
      Math.min(89, this.cameraState.altitude + deltaAltitude)
    )
    this.callbacks.onCameraChange?.(this.getCameraState())
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId)
    this.pointerDown = { x: event.clientX, y: event.clientY, moved: false }
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown) {
      const id = this.pick(event.offsetX, event.offsetY)
      this.callbacks.onHover?.(id)
      this.canvas.style.cursor = id ? 'pointer' : 'grab'
      return
    }
    const dx = event.movementX
    const dy = event.movementY
    if (Math.abs(event.clientX - this.pointerDown.x) > 3 || Math.abs(event.clientY - this.pointerDown.y) > 3) {
      this.pointerDown.moved = true
    }
    // Drag scales with the field of view so the sky tracks the cursor at any zoom.
    const scale = this.cameraState.fov / (this.canvas.clientHeight || 1)
    this.applyPan(-dx * scale, dy * scale)
    this.canvas.style.cursor = 'grabbing'
  }

  private onPointerUp = (event: PointerEvent): void => {
    const wasDrag = this.pointerDown?.moved ?? false
    this.pointerDown = null
    this.canvas.releasePointerCapture?.(event.pointerId)
    this.canvas.style.cursor = 'grab'
    if (!wasDrag) {
      this.callbacks.onSelect?.(this.pick(event.offsetX, event.offsetY))
    }
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    // Trackpads report small deltas; a multiplicative step feels the same on both.
    this.setFov(this.cameraState.fov * Math.exp(event.deltaY * 0.0015))
  }

  /**
   * Finds the object nearest to a screen point.
   *
   * The click is turned into a world-space ray, rotated into the sky group's frame,
   * then compared against every candidate by dot product — 10 000 dot products is far
   * cheaper and far more reliable than raycasting against a Points cloud.
   */
  pick(offsetX: number, offsetY: number): string | null {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    const ndc = new THREE.Vector2((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1)
    const ray = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).normalize()

    const skyRay = ray.clone().applyMatrix4(this.skyMatrixInverse).normalize()

    // Tolerance in radians, scaled to the current zoom so clicking stays forgiving.
    const tolerance = Math.cos(((this.cameraState.fov / 40) * Math.PI) / 180)
    let bestId: string | null = null
    let bestScore = tolerance

    for (const target of this.pickTargets) {
      const source = target.frame === 'sky' ? skyRay : ray
      const dot = source.x * target.local.x + source.y * target.local.y + source.z * target.local.z
      // Weight lets bright or large objects win a near-tie against a faint neighbour.
      const score = dot + (1 - dot) * 0 + target.weight * 1e-5
      if (dot > tolerance && score > bestScore) {
        bestScore = score
        bestId = target.id
      }
    }
    return bestId
  }

  private attachEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.style.cursor = 'grab'
  }

  private detachEvents(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
  }
}

/**
 * Turns raw JPEG bytes into a texture via a blob URL, which keeps `img-src` in the
 * Content Security Policy limited to `blob:` rather than opening it up to the
 * filesystem. The URL is revoked as soon as the decode completes.
 */
function loadJpegTexture(bytes: Uint8Array): { texture: THREE.Texture; release: () => void } {
  // Copy into a plain ArrayBuffer: the transferred view may sit inside a larger buffer.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'image/jpeg' }))
  const release = (): void => URL.revokeObjectURL(url)
  const texture = new THREE.TextureLoader().load(url, release, undefined, release)
  return { texture, release }
}

/** Labels are suppressed under the layer chips that run along the top of the map. */
const LABEL_TOP_INSET = 52

/** How far the all-sky photograph is held below the computed sky. */
const SKY_IMAGE_INTENSITY = 0.62

/** Hermite ramp from 0 at `edge0` to 1 at `edge1`, matching the GLSL builtin. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Row-major EQJ -> galactic rotation, as a Three.js Matrix3.
 *
 * astronomy-engine returns a column-major 3x3, so the indices are transposed here.
 */
export function equatorialToGalacticMatrix(): THREE.Matrix3 {
  const rotation = Astronomy.Rotation_EQJ_GAL()
  const m = (row: number, col: number): number => rotation.rot[col][row]
  return new THREE.Matrix3().set(
    m(0, 0), m(0, 1), m(0, 2),
    m(1, 0), m(1, 1), m(1, 2),
    m(2, 0), m(2, 1), m(2, 2)
  )
}

/**
 * Builds the mesh for a gnomonic sky cutout.
 *
 * For a TAN projection centred on `(raHours, decDegrees)` and spanning `fovDegrees`,
 * a point at normalised image coordinates (u, v) lies along
 *
 *     direction = normalise(centre + xi * east + eta * north)
 *
 * with `xi` and `eta` the tangent-plane offsets. East runs to the *left* in the image,
 * which is the standard astronomical orientation these services return, and north is up.
 */
export function buildCutoutGeometry(
  raHours: number,
  decDegrees: number,
  fovDegrees: number,
  segments = 24
): THREE.BufferGeometry {
  const centre = eqjUnitVector(raHours, decDegrees)
  const c = new THREE.Vector3(centre.x, centre.y, centre.z).normalize()
  const pole = new THREE.Vector3(0, 0, 1)

  // East is the direction of increasing right ascension; north is the pole projected
  // onto the tangent plane.
  const east = new THREE.Vector3().crossVectors(pole, c)
  east.lengthSq() < 1e-12 ? east.set(1, 0, 0) : east.normalize()
  const north = pole.clone().addScaledVector(c, -pole.dot(c))
  north.lengthSq() < 1e-12 ? north.set(0, 1, 0) : north.normalize()

  const halfAngle = Math.tan((fovDegrees / 2) * DEG)
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let row = 0; row <= segments; row++) {
    for (let column = 0; column <= segments; column++) {
      const u = column / segments
      const v = row / segments
      // Image x runs right, but east is to the left, hence the negation.
      const xi = -(u - 0.5) * 2 * halfAngle
      const eta = (0.5 - v) * 2 * halfAngle

      const direction = c
        .clone()
        .addScaledVector(east, xi)
        .addScaledVector(north, eta)
        .normalize()
        .multiplyScalar(SKY_RADIUS * 0.995)

      positions.push(direction.x, direction.y, direction.z)
      uvs.push(u, 1 - v)
    }
  }

  const stride = segments + 1
  for (let row = 0; row < segments; row++) {
    for (let column = 0; column < segments; column++) {
      const a = row * stride + column
      const b = a + 1
      const d = a + stride
      const e = d + 1
      indices.push(a, d, b, b, d, e)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/** Nudges labels clear of the marker they belong to. */
function labelOffset(kind: ObjectKind | 'cardinal'): number {
  switch (kind) {
    case 'cardinal':
      return 0
    case 'constellation':
      return 0
    case 'planet':
    case 'moon':
    case 'sun':
      return -16
    case 'black-hole':
      return -17
    default:
      return -11
  }
}

export { applyMatrix3, SKY_RADIUS }
