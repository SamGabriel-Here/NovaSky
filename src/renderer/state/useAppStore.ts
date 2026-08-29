/**
 * Application state.
 *
 * One store holds everything the screens share: the parsed catalogue, the settings
 * (which are mirrored to the local database through the preload bridge), the current
 * sky time, and the selection. Screens stay presentational and read from here.
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  Achievement,
  AstroEvent,
  LessonProgress,
  Settings,
  SkyObject,
  TleBundle
} from '@shared/types'
import { buildCatalog, type Catalog } from '@shared/astro/catalog'
import { DEFAULT_SETTINGS, effectiveSettings } from '@shared/settings'
import type { NovaSkyApi } from '../../preload'

export type Screen = 'sky' | 'search' | 'tonight' | 'learn' | 'events' | 'settings'

export const SCREENS: { id: Screen; label: string; hint: string }[] = [
  { id: 'sky', label: 'Sky', hint: 'The live 3D sky map for your location and time' },
  { id: 'search', label: 'Search', hint: 'Find any star, planet, constellation or deep-sky object' },
  { id: 'tonight', label: 'Tonight', hint: 'What is worth looking at from here, tonight' },
  { id: 'learn', label: 'Learn', hint: 'Guided activities, quizzes and achievements' },
  { id: 'events', label: 'Events', hint: 'Eclipses, meteor showers, conjunctions and more' },
  { id: 'settings', label: 'Settings', hint: 'Location, display, notifications and privacy' }
]

/** Sky-time playback speeds offered by the Time Machine. */
export const PLAYBACK_RATES = [
  { label: 'Real time', value: 1 },
  { label: '1 min/s', value: 60 },
  { label: '1 hour/s', value: 3600 },
  { label: '1 day/s', value: 86400 },
  { label: '1 month/s', value: 2592000 }
] as const

interface AppState {
  status: 'loading' | 'ready' | 'error'
  error: string | null

  catalog: Catalog | null
  settings: Settings
  achievements: Achievement[]
  lessons: LessonProgress[]
  storeBackend: 'sqlite' | 'json'
  systemTimeZone: string
  platform: string
  appVersion: string

  /** The moment the sky map is showing. */
  time: Date
  /** When true, `time` follows the system clock. */
  live: boolean
  /** Seconds of sky time per real second while playing. */
  playbackRate: number
  playing: boolean

  screen: Screen
  selectedId: string | null
  searchOpen: boolean
  timeMachineOpen: boolean
  onboardingOpen: boolean

  tle: TleBundle | null
  tleLoading: boolean
  scheduledEvents: AstroEvent[]
  toast: string | null

  initialise: () => Promise<void>
  setScreen: (screen: Screen) => void
  select: (objectId: string | null, options?: { focus?: boolean }) => void
  /** Set when a selection should also recentre the sky map. */
  focusRequest: { id: string; at: number } | null
  setTime: (time: Date) => void
  setLive: (live: boolean) => void
  setPlaybackRate: (rate: number) => void
  setPlaying: (playing: boolean) => void
  tick: (elapsedMs: number) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  toggleBeginnerMode: () => Promise<void>
  setSearchOpen: (open: boolean) => void
  setTimeMachineOpen: (open: boolean) => void
  completeOnboarding: () => Promise<void>
  reopenOnboarding: () => void
  refreshTle: (force?: boolean) => Promise<void>
  unlockAchievement: (id: string) => Promise<void>
  saveLesson: (progress: LessonProgress) => Promise<void>
  clearData: (scope: 'cache' | 'all') => Promise<void>
  showToast: (message: string | null) => void
  getObject: (id: string) => SkyObject | null
}

declare global {
  interface Window {
    novasky: NovaSkyApi
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'loading',
  error: null,

  catalog: null,
  settings: DEFAULT_SETTINGS,
  achievements: [],
  lessons: [],
  storeBackend: 'json',
  systemTimeZone: 'UTC',
  platform: 'unknown',
  appVersion: '0.0.0',

  time: new Date(),
  live: true,
  playbackRate: 1,
  playing: false,

  screen: 'sky',
  selectedId: null,
  searchOpen: false,
  timeMachineOpen: false,
  onboardingOpen: false,
  focusRequest: null,

  tle: null,
  tleLoading: false,
  scheduledEvents: [],
  toast: null,

  async initialise() {
    try {
      const bootstrap = await window.novasky.bootstrap()
      const catalog = buildCatalog(bootstrap.catalog)
      set({
        catalog,
        settings: bootstrap.settings,
        achievements: bootstrap.achievements,
        lessons: bootstrap.lessons,
        storeBackend: bootstrap.storeBackend,
        systemTimeZone: bootstrap.systemTimeZone,
        platform: bootstrap.platform,
        appVersion: bootstrap.appVersion,
        onboardingOpen: !bootstrap.settings.onboardingComplete,
        status: 'ready',
        time: new Date()
      })
      if (bootstrap.settings.showSatellites) void get().refreshTle()
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'NovaSky could not start.'
      })
    }
  },

  setScreen: (screen) => set({ screen }),

  select: (objectId, options) =>
    set((state) => ({
      selectedId: objectId,
      focusRequest:
        objectId && options?.focus ? { id: objectId, at: Date.now() } : state.focusRequest
    })),

  setTime: (time) => set({ time, live: false }),
  setLive: (live) => set(live ? { live, time: new Date(), playing: false } : { live }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setPlaying: (playing) => set({ playing, live: playing ? false : get().live }),

  tick: (elapsedMs) => {
    const { live, playing, playbackRate, time } = get()
    if (live) {
      set({ time: new Date() })
    } else if (playing) {
      set({ time: new Date(time.getTime() + elapsedMs * playbackRate) })
    }
  },

  async updateSettings(patch) {
    // Optimistic: the UI reflects the change immediately, then the store confirms.
    set((state) => ({ settings: { ...state.settings, ...patch } }))
    const settings = await window.novasky.saveSettings(patch)
    set({ settings })
  },

  async toggleBeginnerMode() {
    const next = !get().settings.beginnerMode
    await get().updateSettings({ beginnerMode: next })
    get().showToast(next ? 'Beginner mode on. Showing the brightest objects only.' : 'Beginner mode off.')
  },

  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setTimeMachineOpen: (timeMachineOpen) => set({ timeMachineOpen }),

  async completeOnboarding() {
    set({ onboardingOpen: false })
    await get().updateSettings({ onboardingComplete: true })
  },

  reopenOnboarding: () => set({ onboardingOpen: true }),

  async refreshTle(force = false) {
    set({ tleLoading: true })
    try {
      const tle = await window.novasky.getTle({ force })
      set({ tle, tleLoading: false })
    } catch {
      set({ tleLoading: false })
    }
  },

  async unlockAchievement(id) {
    if (get().achievements.some((a) => a.id === id)) return
    const achievements = await window.novasky.unlockAchievement(id)
    set({ achievements })
  },

  async saveLesson(progress) {
    const lessons = await window.novasky.saveLessonProgress(progress)
    set({ lessons })
  },

  async clearData(scope) {
    const settings = await window.novasky.clearData(scope)
    set({
      settings,
      tle: scope === 'all' ? null : get().tle,
      achievements: scope === 'all' ? [] : get().achievements,
      lessons: scope === 'all' ? [] : get().lessons,
      onboardingOpen: scope === 'all'
    })
    get().showToast(scope === 'all' ? 'All local data cleared.' : 'Cached downloads cleared.')
  },

  showToast: (toast) => set({ toast }),

  getObject: (id) => get().catalog?.objects.get(id) ?? null
}))

/**
 * Settings with beginner-mode overrides applied. Use this for anything visual.
 *
 * The derivation has to happen outside the selector. `effectiveSettings` builds a new
 * object when beginner mode is on, and a selector that returns a fresh object every
 * call makes `useSyncExternalStore` believe the store changed on every render. React
 * then re-renders forever and throws "Maximum update depth exceeded". Selecting the
 * stable `settings` reference and memoising on it keeps the result referentially stable.
 */
export const useEffectiveSettings = (): Settings => {
  const settings = useAppStore((state) => state.settings)
  return useMemo(() => effectiveSettings(settings), [settings])
}
