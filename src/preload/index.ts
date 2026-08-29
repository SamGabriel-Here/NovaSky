/**
 * The renderer's only door to the outside world.
 *
 * Each function here maps to exactly one IPC channel in main/ipc.ts. No Node API and
 * no ipcRenderer object itself is exposed, so a bug in the UI cannot reach the disk.
 */
import { contextBridge, ipcRenderer } from 'electron'
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

const api = {
  bootstrap: (): Promise<Bootstrap> => ipcRenderer.invoke('app:bootstrap'),
  saveSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:save', patch),
  unlockAchievement: (id: string): Promise<Achievement[]> =>
    ipcRenderer.invoke('achievements:unlock', id),
  saveLessonProgress: (progress: LessonProgress): Promise<LessonProgress[]> =>
    ipcRenderer.invoke('lessons:save', progress),
  getTle: (options: { force?: boolean } = {}): Promise<TleBundle> =>
    ipcRenderer.invoke('satellites:tle', options),
  networkStatus: (): Promise<NetworkStatus> => ipcRenderer.invoke('network:status'),
  getSkyImage: (): Promise<Uint8Array | null> => ipcRenderer.invoke('imagery:sky'),
  getObjectImage: (request: {
    objectId: string
    raDegrees: number
    decDegrees: number
    fovDegrees: number
  }): Promise<ObjectImage> => ipcRenderer.invoke('imagery:object', request),
  enableNotifications: (enabled: boolean): Promise<Settings> =>
    ipcRenderer.invoke('notifications:enable', enabled),
  scheduledNotifications: (): Promise<AstroEvent[]> =>
    ipcRenderer.invoke('notifications:scheduled'),
  clearData: (scope: 'cache' | 'all'): Promise<Settings> => ipcRenderer.invoke('data:clear', scope),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:open-external', url),
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-fullscreen')
}

export type NovaSkyApi = typeof api

contextBridge.exposeInMainWorld('novasky', api)
