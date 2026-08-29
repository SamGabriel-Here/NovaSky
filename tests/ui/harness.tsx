/** Shared setup for renderer component tests: a stubbed preload bridge and a seeded store. */
import { vi } from 'vitest'
import { useAppStore } from '@renderer/state/useAppStore'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { Settings } from '@shared/types'
import { GREENWICH, testCatalog } from '../fixtures'

export const bridge = {
  bootstrap: vi.fn(),
  saveSettings: vi.fn(async (patch: Partial<Settings>) => ({ ...DEFAULT_SETTINGS, ...patch })),
  unlockAchievement: vi.fn(async () => []),
  saveLessonProgress: vi.fn(async () => []),
  getTle: vi.fn(async () => ({
    records: [],
    fetchedAt: new Date().toISOString(),
    origin: 'cached' as const,
    warning: null
  })),
  networkStatus: vi.fn(async () => ({ online: true, lastCheckedAt: new Date().toISOString() })),
  enableNotifications: vi.fn(async () => DEFAULT_SETTINGS),
  scheduledNotifications: vi.fn(async () => []),
  clearData: vi.fn(async () => DEFAULT_SETTINGS),
  openExternal: vi.fn(async () => true),
  toggleFullscreen: vi.fn(async () => true)
}

/** Puts the store into a known, ready state with the real catalogue loaded. */
export function seedStore(overrides: Partial<Settings> = {}): void {
  Object.values(bridge).forEach((fn) => fn.mockClear?.())
  Object.assign(window, { novasky: bridge })

  useAppStore.setState({
    status: 'ready',
    error: null,
    catalog: testCatalog(),
    settings: { ...DEFAULT_SETTINGS, location: GREENWICH, onboardingComplete: true, ...overrides },
    achievements: [],
    lessons: [],
    storeBackend: 'sqlite',
    systemTimeZone: 'Europe/London',
    platform: 'darwin',
    appVersion: '0.1.0',
    time: new Date('2027-01-15T22:00:00Z'),
    live: false,
    playing: false,
    playbackRate: 1,
    screen: 'sky',
    selectedId: null,
    searchOpen: false,
    timeMachineOpen: false,
    onboardingOpen: false,
    focusRequest: null,
    tle: null,
    tleLoading: false,
    scheduledEvents: [],
    toast: null
  })
}
