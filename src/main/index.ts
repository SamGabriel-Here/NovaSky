/**
 * Electron entry point: window lifecycle, menu, and the security posture.
 *
 * The renderer runs with context isolation on, node integration off and a strict CSP.
 * It reaches the disk, the network and the OS only through the channels in ipc.ts.
 */
import path from 'node:path'
import { BrowserWindow, Menu, app, session, shell } from 'electron'
import { openStore, type Store } from './store'
import { NotificationScheduler } from './notifications'
import { registerIpc } from './ipc'
import { getTleBundle } from './network'
import { buildContentSecurityPolicy } from '../shared/csp'

const isDev = !app.isPackaged

// CI runners have no GPU. Falling back to software rendering lets the smoke and offline
// checks exercise the real WebGL sky map instead of skipping it.
if (process.env.NOVASKY_SOFTWARE_GL === '1') {
  app.commandLine.appendSwitch('use-gl', 'swiftshader')
  app.commandLine.appendSwitch('use-angle', 'swiftshader')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
}

let mainWindow: BrowserWindow | null = null
let store: Store | null = null
const scheduler = new NotificationScheduler()

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#04060f',
    title: 'NovaSky',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // The sky map is a full-screen WebGL canvas; throttling it while the window is
      // occluded would freeze the clock-driven animation.
      backgroundThrottling: false
    }
  })

  window.once('ready-to-show', () => window.show())

  // A renderer that throws while loading its first module leaves nothing on screen at
  // all. Surface those failures in the terminal rather than letting the window sit
  // blank and silent.
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[novasky] renderer failed to load (${code} ${description}): ${url}`)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[novasky] renderer process gone: ${details.reason}`)
  })
  if (isDev) {
    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      // Chromium logging levels: 2 is warning, 3 is error.
      if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`)
    })
  }

  // Anything that tries to open a new window goes to the system browser instead,
  // and only over https.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block in-page navigation away from the app shell.
  window.webContents.on('will-navigate', (event, url) => {
    const isDevServer = isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'http://localhost')
    if (!isDevServer && !url.startsWith('file://')) event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}

/** Applies the renderer CSP and denies every web permission. */
function applyContentSecurityPolicy(): void {
  const policy = buildContentSecurityPolicy(isDev)

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] }
    })
  })

  // NovaSky needs no web permissions: no camera, microphone, geolocation or MIDI.
  // Location is entered by the user or derived from the system time zone.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? ([{ role: 'toggleDevTools' }] as Electron.MenuItemConstructorOptions[]) : [])
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'NovaSky data sources',
          click: () => void shell.openExternal('https://celestrak.org/')
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  applyContentSecurityPolicy()
  buildMenu()

  store = openStore(path.join(app.getPath('userData'), 'store'), (error) => {
    console.warn(
      '[novasky] SQLite unavailable, falling back to the JSON store:',
      error instanceof Error ? error.message : error
    )
  })

  registerIpc({
    store,
    scheduler,
    appVersion: app.getVersion(),
    getWindow: () => mainWindow
  })

  mainWindow = createWindow()

  const settings = store.getSettings()
  scheduler.refresh(settings)
  // Warm the satellite cache in the background so the Tonight screen has something to
  // show. Failures are expected offline and are reported through the returned bundle.
  if (settings.allowNetwork) {
    void getTleBundle(store, { allowNetwork: true }).catch(() => undefined)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  scheduler.cancel()
  store?.close()
})
