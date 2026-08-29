/**
 * Production smoke test: boots the built app, waits for the UI to render, and fails if
 * the renderer logged an error or the shell did not mount.
 *
 *   npm run build && npx electron scripts/smoke.cjs
 *
 * The window is made fully transparent rather than shown, so this is safe to run on a
 * developer's desktop and in CI.
 */
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const ROOT = path.resolve(__dirname, '..')
process.env.NOVASKY_DATA_DIR = path.join(ROOT, 'resources', 'data')

require(path.join(ROOT, 'out', 'main', 'index.js'))

const errors = []
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message) {
  console.error(`FAIL: ${message}`)
  app.exit(1)
}

app.whenReady().then(async () => {
  await wait(1200)
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return fail('no window was created')
  win.setOpacity(0)

  win.webContents.on('console-message', (_event, level, message) => {
    // level 3 is "error" in Chromium's logging levels.
    if (level >= 3) errors.push(message)
  })
  win.webContents.on('did-fail-load', (_e, code, description) => {
    errors.push(`did-fail-load ${code} ${description}`)
  })

  await wait(6000)

  const checks = await win.webContents.executeJavaScript(
    `({
       shell: Boolean(document.querySelector('nav[aria-label="Main"]')),
       canvas: Boolean(document.querySelector('canvas')),
       stillLoading: document.body.textContent.includes('Loading star catalogues'),
       failed: document.body.textContent.includes('could not start')
     })`,
    true
  )

  if (checks.failed) return fail('the app rendered its start-up error state')
  if (checks.stillLoading) return fail('the app is still on the loading screen after 6s')
  if (!checks.shell) return fail('the navigation rail did not render')
  if (!checks.canvas) return fail('the sky map canvas did not render')
  if (errors.length > 0) return fail(`renderer errors:\n${errors.join('\n')}`)

  console.log('PASS: production build boots, catalogues load, sky map renders')
  app.exit(0)
})

setTimeout(() => fail('smoke test timed out'), 45000)
