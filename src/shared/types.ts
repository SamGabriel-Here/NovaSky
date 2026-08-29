/**
 * Types shared by the Electron main process, the preload bridge and the renderer.
 * Keep this module dependency-free so it can be imported from any of them.
 */

/** Where a value came from. Surfaced in the UI so users can trust what they see. */
export type DataOrigin =
  /** Computed on demand from an ephemeris model (astronomy-engine). */
  | 'calculated'
  /** Read from a catalogue that ships with the app. */
  | 'catalog'
  /** Fetched from the network during this session. */
  | 'live'
  /** Fetched previously and reused because the network is unavailable. */
  | 'cached'

export type ObjectKind =
  | 'star'
  | 'planet'
  | 'moon'
  | 'sun'
  | 'constellation'
  | 'deep-sky'
  | 'black-hole'
  | 'satellite'

/** Deep-sky sub-classification, as recorded by OpenNGC. */
export type DeepSkyType =
  | 'galaxy'
  | 'planetary-nebula'
  | 'open-cluster'
  | 'globular-cluster'
  | 'cluster-nebula'
  | 'nebula'
  | 'dark-nebula'
  | 'supernova-remnant'
  | 'star'
  | 'double-star'
  | 'association'
  | 'asterism'

export interface GeoLocation {
  /** Degrees north, -90..90. */
  latitude: number
  /** Degrees east, -180..180. */
  longitude: number
  /** Metres above sea level. */
  elevation: number
  /** Human-readable label shown in the UI, e.g. "Indore, India". */
  label: string
  /** IANA time-zone id used for all local-time formatting. */
  timeZone: string
  source: 'system' | 'manual' | 'default'
}

/** A distance with the unit it is naturally expressed in. */
export interface Distance {
  value: number
  unit: 'km' | 'au' | 'ly' | 'kly' | 'Mly'
  origin: DataOrigin
}

/**
 * A catalogue entry. Fixed objects carry J2000 `ra`/`dec`; Solar-System bodies
 * and satellites leave them null because their position is computed per moment.
 */
export interface SkyObject {
  id: string
  name: string
  kind: ObjectKind
  /** Alternative designations searched alongside `name`. */
  aliases: string[]
  /** Apparent visual magnitude, or null when the catalogue has none. */
  magnitude: number | null
  /** Right ascension in hours (J2000), null for moving bodies. */
  ra: number | null
  /** Declination in degrees (J2000), null for moving bodies. */
  dec: number | null
  /** IAU three-letter constellation abbreviation. */
  constellation: string | null
  distance: Distance | null
  /** Deep-sky class, spectral class, or planet/satellite descriptor. */
  subtype: string | null
  /** Apparent major axis in arcminutes, when catalogued. */
  sizeArcmin: number | null
  /** True for the reduced set shown in Beginner mode. */
  beginner: boolean
  /** astronomy-engine Body name for Solar-System objects. */
  body?: string
  /** NORAD catalogue number for satellites. */
  noradId?: number
}

export interface HorizontalPosition {
  /** Degrees above the horizon (refracted). */
  altitude: number
  /** Degrees clockwise from north. */
  azimuth: number
  /** Apparent right ascension of date, hours. */
  ra: number
  /** Apparent declination of date, degrees. */
  dec: number
}

export interface RiseSetTimes {
  rise: string | null
  transit: string | null
  set: string | null
  /** Altitude in degrees at upper culmination. */
  transitAltitude: number | null
  /** Never sets from this latitude. */
  circumpolar: boolean
  /** Never rises from this latitude. */
  neverRises: boolean
}

export type VisibilityState =
  | 'visible'
  | 'daylight'
  | 'twilight'
  | 'below-horizon'
  | 'too-faint'
  | 'unknown'

export interface Visibility {
  state: VisibilityState
  /** One-line explanation shown under the object name. */
  summary: string
  /** Local ISO timestamp of the best observing moment tonight, if any. */
  bestViewing: string | null
  bestViewingNote: string | null
}

/** Everything the details panel needs about one object at one instant. */
export interface ObjectSnapshot {
  object: SkyObject
  position: HorizontalPosition
  riseSet: RiseSetTimes
  visibility: Visibility
  /** Apparent magnitude at this instant (planets vary), else the catalogue value. */
  magnitude: number | null
  magnitudeOrigin: DataOrigin
  distance: Distance | null
  /** Illuminated fraction, 0..1, for the Moon and planets. */
  illumination: number | null
  description: string
  mythology: string | null
  links: { label: string; url: string }[]
  positionOrigin: DataOrigin
}

export type AstroEventKind =
  | 'lunar-eclipse'
  | 'solar-eclipse'
  | 'meteor-shower'
  | 'conjunction'
  | 'opposition'
  | 'elongation'
  | 'moon-phase'
  | 'solstice'
  | 'equinox'

export interface AstroEvent {
  id: string
  kind: AstroEventKind
  title: string
  /** ISO timestamp (UTC) of the peak / exact moment. */
  time: string
  /** Optional activity window for showers and eclipses. */
  startTime?: string
  endTime?: string
  description: string
  /** Objects involved, for "show me in the sky map". */
  objectIds: string[]
  /** Whether the event is observable from the current location at all. */
  localVisibility: string | null
  origin: DataOrigin
}

export interface SatellitePass {
  satelliteId: number
  name: string
  rise: string
  culminate: string
  set: string
  maxAltitude: number
  riseAzimuth: number
  setAzimuth: number
  /** Sunlit satellite against a dark sky — the only kind you can actually see. */
  visible: boolean
  origin: DataOrigin
}

export interface TleRecord {
  name: string
  noradId: number
  line1: string
  line2: string
}

export interface TleBundle {
  records: TleRecord[]
  /** When the set was downloaded. */
  fetchedAt: string
  origin: DataOrigin
  /** Present when the data is stale or missing. */
  warning: string | null
}

/** Persisted user settings. Mirrors the `settings` table in the local database. */
export interface Settings {
  location: GeoLocation
  beginnerMode: boolean
  showConstellationLines: boolean
  showConstellationLabels: boolean
  showStarLabels: boolean
  showHorizon: boolean
  showGrid: boolean
  showDeepSky: boolean
  showBlackHoles: boolean
  /** The faint-star layer whose density traces the Milky Way. */
  showMilkyWay: boolean
  showSatellites: boolean
  starMagnitudeLimit: number
  notificationsEnabled: boolean
  notificationKinds: AstroEventKind[]
  onboardingComplete: boolean
  allowNetwork: boolean
}

export interface Achievement {
  id: string
  unlockedAt: string
}

export interface LessonProgress {
  id: string
  completed: boolean
  score: number | null
  updatedAt: string
}

export interface CatalogPayload {
  stars: string
  faintStars: string
  constellations: string
  deepSky: string
  blackHoles: string
  places: string
  manifest: string
}

/** The single payload the renderer receives at startup. */
export interface Bootstrap {
  settings: Settings
  catalog: CatalogPayload
  storeBackend: 'sqlite' | 'json'
  achievements: Achievement[]
  lessons: LessonProgress[]
  platform: string
  appVersion: string
  /** Best guess at the user's IANA time zone, read from the operating system. */
  systemTimeZone: string
}

export interface NetworkStatus {
  online: boolean
  lastCheckedAt: string
}
