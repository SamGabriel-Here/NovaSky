/**
 * The main <-> renderer contract.
 *
 * The renderer has no Node access (contextIsolation is on, nodeIntegration is off), so
 * every privileged operation — disk, network, notifications — comes through one of
 * these channels. Keeping them in one file makes the app's whole trust boundary
 * reviewable at a glance.
 */
import { BrowserWindow, ipcMain, shell } from 'electron'
import type {
  Achievement,
  AstroEvent,
  Bootstrap,
  LessonProgress,
  NetworkStatus,
  ObjectImage,
  Settings,
  TleBundle
} from '../shared/types'
import { loadCatalog } from './catalog'
import { getNetworkStatus, getTleBundle } from './network'
import { getObjectImage, readSkyImage, type ObjectImageRequest } from './imagery'
import type { NotificationScheduler } from './notifications'
import type { Store } from './store'

export interface IpcContext {
  store: Store
  scheduler: NotificationScheduler
  appVersion: string
  getWindow: () => BrowserWindow | null
}

/** Only these hosts may be opened from in-app links. */
const ALLOWED_LINK_HOSTS = [
  'en.wikipedia.org',
  'science.nasa.gov',
  'nssdc.gsfc.nasa.gov',
  'simbad.cds.unistra.fr',
  'celestrak.org',
  'www.imo.net'
]

export function registerIpc(context: IpcContext): void {
  const { store, scheduler } = context

  ipcMain.handle('app:bootstrap', (): Bootstrap => {
    return {
      settings: store.getSettings(),
      catalog: loadCatalog(),
      storeBackend: store.backend,
      achievements: store.getAchievements(),
      lessons: store.getLessonProgress(),
      platform: process.platform,
      appVersion: context.appVersion,
      systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  })

  ipcMain.handle('settings:save', (_event, patch: Partial<Settings>): Settings => {
    const settings = store.saveSettings(patch)
    // Any change to location, notification kinds or the master switch invalidates the
    // pending notification schedule.
    scheduler.refresh(settings)
    return settings
  })

  ipcMain.handle('achievements:unlock', (_event, id: string): Achievement[] =>
    store.unlockAchievement(id)
  )

  ipcMain.handle('lessons:save', (_event, progress: LessonProgress): LessonProgress[] =>
    store.saveLessonProgress(progress)
  )

  ipcMain.handle(
    'satellites:tle',
    async (_event, options: { force?: boolean } = {}): Promise<TleBundle> => {
      const settings = store.getSettings()
      return getTleBundle(store, { allowNetwork: settings.allowNetwork, force: options.force })
    }
  )

  ipcMain.handle('network:status', (): NetworkStatus => getNetworkStatus())

  // The bundled all-sky panorama, sent once as raw bytes. The renderer turns it into a
  // blob URL, which keeps the image-src CSP tight and avoids a 6 MB base64 string.
  ipcMain.handle('imagery:sky', (): Uint8Array | null => {
    const image = readSkyImage()
    return image ? new Uint8Array(image) : null
  })

  ipcMain.handle(
    'imagery:object',
    async (_event, request: ObjectImageRequest): Promise<ObjectImage> => {
      const settings = store.getSettings()
      if (!settings.showObjectImagery) {
        return {
          objectId: request.objectId,
          fovDegrees: request.fovDegrees,
          data: null,
          origin: 'cached',
          fetchedAt: null,
          source: null,
          warning: 'Survey imagery is turned off in Settings.'
        }
      }
      return getObjectImage(store, request, { allowNetwork: settings.allowNetwork })
    }
  )

  ipcMain.handle('notifications:enable', (_event, enabled: boolean): Settings => {
    const settings = store.saveSettings({ notificationsEnabled: enabled })
    if (enabled) scheduler.test()
    scheduler.refresh(settings)
    return settings
  })

  ipcMain.handle('notifications:scheduled', (): AstroEvent[] =>
    scheduler.refresh(store.getSettings())
  )

  ipcMain.handle('data:clear', (_event, scope: 'cache' | 'all'): Settings => {
    if (scope === 'all') store.clearAll()
    else store.clearCache()
    const settings = store.getSettings()
    scheduler.refresh(settings)
    return settings
  })

  ipcMain.handle('shell:open-external', async (_event, url: string): Promise<boolean> => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') return false
      if (!ALLOWED_LINK_HOSTS.includes(parsed.hostname)) return false
      await shell.openExternal(parsed.toString())
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('window:toggle-fullscreen', (): boolean => {
    const window = context.getWindow()
    if (!window) return false
    const next = !window.isFullScreen()
    window.setFullScreen(next)
    return next
  })
}
