/** Default settings, and the helpers that guess a starting location. */
import type { GeoLocation, Settings } from './types'

/**
 * Used until the user picks a location. Greenwich is the conventional zero point for
 * terrestrial coordinates, and it makes the "your location is a guess" state obvious.
 */
export const DEFAULT_LOCATION: GeoLocation = {
  latitude: 51.4779,
  longitude: -0.0015,
  elevation: 0,
  label: 'Greenwich, United Kingdom',
  timeZone: 'Europe/London',
  source: 'default'
}

export const DEFAULT_SETTINGS: Settings = {
  location: DEFAULT_LOCATION,
  beginnerMode: false,
  showConstellationLines: true,
  showConstellationLabels: true,
  showStarLabels: true,
  showHorizon: true,
  showGrid: false,
  showDeepSky: true,
  showBlackHoles: true,
  showMilkyWay: true,
  showSatellites: false,
  starMagnitudeLimit: 5.5,
  notificationsEnabled: false,
  notificationKinds: ['meteor-shower', 'lunar-eclipse', 'solar-eclipse', 'opposition'],
  onboardingComplete: false,
  allowNetwork: true
}

/** Beginner mode overrides a handful of display settings without overwriting them. */
export const BEGINNER_OVERRIDES: Partial<Settings> = {
  starMagnitudeLimit: 3.5,
  showDeepSky: false,
  // Black holes stay on: there are only seventeen of them and they are the single
  // thing beginners most often ask to be shown.
  showBlackHoles: true,
  showGrid: false,
  showConstellationLabels: true,
  showStarLabels: true
}

export function effectiveSettings(settings: Settings): Settings {
  return settings.beginnerMode ? { ...settings, ...BEGINNER_OVERRIDES } : settings
}
