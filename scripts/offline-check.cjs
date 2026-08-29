/**
 * Verifies NovaSky's central promise: that it is fully usable with no network.
 *
 * Boots the built app with every outbound request refused, then asserts the catalogues
 * loaded, the sky map rendered and labels were placed. It also reports how many requests
 * were attempted. The expected answer is zero, because catalogues arrive over IPC and
 * the renderer never talks to the network itself.
 *
 *   npm run build && npx electron scripts/offline-check.cjs
 *
 * Runs on an invisible window, so it is safe on a desktop and in CI.
 */
const path = require('node:path')
const { app, BrowserWindow, session } = require('electron')

const ROOT = path.resolve(__dirname, '..')
process.env.NOVASKY_DATA_DIR = path.join(ROOT, 'resources', 'data')

require(path.join(ROOT, 'out', 'main', 'index.js'))

const attempted = []
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const local = /^(devtools|file|blob|data):/.test(details.url) || details.url.startsWith('http://localhost')
    if (local) return callback({})
    attempted.push(details.url)
    callback({ cancel: true })
  })

  await wait(1500)
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.error('FAIL: no window')
    return app.exit(1)
  }
  win.setOpacity(0)
  await wait(7000)

  const state = await win.webContents.executeJavaScript(
    `({
       shell: Boolean(document.querySelector('nav[aria-label="Main"]')),
       canvas: Boolean(document.querySelector('canvas')),
       failed: document.body.textContent.includes('could not start'),
       labels: document.querySelectorAll('.sky-label').length
     })`,
    true
  )

  console.log(`shell rendered      : ${state.shell}`)
  console.log(`sky map rendered    : ${state.canvas}`)
  console.log(`sky labels placed   : ${state.labels}`)
  console.log(`network attempts    : ${attempted.length}`)
  for (const url of attempted.slice(0, 5)) console.log(`  - ${url}`)

  const ok = state.shell && state.canvas && !state.failed && state.labels > 20
  console.log(ok ? 'PASS: fully usable offline' : 'FAIL: the app is not usable offline')
  app.exit(ok ? 0 : 1)
})

setTimeout(() => {
  console.error('FAIL: offline check timed out')
  app.exit(2)
}, 45000)
