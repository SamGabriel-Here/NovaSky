/**
 * Development helper: launches the built app, drives it through a few states and saves
 * PNG screenshots to docs/screenshots. Used to produce the images in the design docs
 * and to eyeball the renderer without opening the app by hand.
 *
 *   npm run build && npx electron scripts/capture.cjs
 */
const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow } = require('electron')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'screenshots')
process.env.NOVASKY_DATA_DIR = path.join(ROOT, 'resources', 'data')

// Boot the real main process.
require(path.join(ROOT, 'out', 'main', 'index.js'))

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function shoot(win, name) {
  const image = await win.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG())
  console.log('captured', name)
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  await wait(1500)
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.error('no window')
    app.exit(1)
    return
  }
  win.setSize(1440, 900)
  // capturePage() reads the web contents, not the screen, so the window does not need
  // to be visible. Make it fully transparent and send it to the back rather than
  // parking a live app window on top of whatever the user is doing.
  win.setOpacity(0)
  win.setAlwaysOnTop(false)
  win.blur()

  const run = (js) => win.webContents.executeJavaScript(js, true)

  await wait(3500)
  await shoot(win, '01-onboarding')

  // Set a known location and time so the captures are reproducible.
  await run(`
    (async () => {
      const store = window.__novaskyStore
      await store.getState().updateSettings({
        location: { latitude: 40.7128, longitude: -74.006, elevation: 10,
                    label: 'New York, United States', timeZone: 'America/New_York', source: 'manual' },
        onboardingComplete: true,
        beginnerMode: false
      })
      store.setState({ onboardingOpen: false })
      store.getState().setTime(new Date('2027-01-15T01:30:00Z'))
    })()
  `)
  await wait(2500)
  await shoot(win, '02-sky')

  await run(`window.__novaskyStore.getState().select('con:Ori', { focus: true })`)
  await wait(3500)
  await shoot(win, '03-sky-selected')

  // A low-altitude target puts the horizon, the ground and the compass points in frame.
  await run(`
    window.__novaskyStore.getState().setTime(new Date('2027-01-15T00:20:00Z'));
    window.__novaskyStore.getState().select('jupiter', { focus: true });
  `)
  await wait(3500)
  await shoot(win, '03b-horizon')

  await run(`window.__novaskyStore.getState().setTimeMachineOpen(true)`)
  await wait(2000)
  await shoot(win, '04-time-machine')

  await run(`
    window.__novaskyStore.getState().setTimeMachineOpen(false);
    window.__novaskyStore.getState().setScreen('tonight');
  `)
  await wait(4000)
  await shoot(win, '05-tonight')

  await run(`window.__novaskyStore.getState().setScreen('events')`)
  await wait(5000)
  await shoot(win, '06-events')

  await run(`window.__novaskyStore.getState().setScreen('learn')`)
  await wait(1500)
  await shoot(win, '07-learn')

  await run(`window.__novaskyStore.getState().setScreen('search')`)
  await wait(800)
  await run(`
    (() => {
      const input = document.querySelector('input[aria-label="Search the catalogue"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Pleiades');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `)
  await wait(600)
  await run(`window.__novaskyStore.getState().select('dso:Mel022')`)
  await wait(1500)
  await shoot(win, '08-search')

  await run(`window.__novaskyStore.getState().setScreen('settings')`)
  await wait(1200)
  await shoot(win, '09-settings')

  // Black holes and the Milky Way band.
  await run(`
    (() => {
      const s = window.__novaskyStore.getState();
      s.setScreen('sky');
      s.setTime(new Date('2027-07-15T03:30:00Z'));
      s.select('bh:Sagittarius_A_', { focus: true });
    })()
  `)
  await wait(4000)
  await shoot(win, '10-black-hole')

  await run(`
    (async () => {
      const s = window.__novaskyStore.getState();
      s.select(null);
      await s.updateSettings({ starMagnitudeLimit: 6.5 });
    })()
  `)
  await wait(2500)
  await shoot(win, '11-milky-way')

  // A gibbous Moon at high magnification, to show the phase rendering.
  // A waxing crescent a few days after the 2 August 2027 new Moon.
  await run(`
    (() => {
      const s = window.__novaskyStore.getState();
      s.setTime(new Date('2027-08-06T00:40:00Z'));
      s.select('moon', { focus: true });
    })()
  `)
  await wait(3000)
  // Zoom in on the Moon: the '+' shortcut is handled by the sky canvas.
  for (let i = 0; i < 7; i++) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '+' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '+' })
    await wait(120)
  }
  await run(`window.__novaskyStore.getState().select('moon', { focus: true })`)
  await wait(2500)
  await shoot(win, '12-moon')

  // The Orion Nebula at high magnification: checks the diffuse-object rendering has no
  // sprite-edge artefacts when a nebula fills much of the field.
  await run(`
    (() => {
      const s = window.__novaskyStore.getState();
      s.setTime(new Date('2027-01-15T02:00:00Z'));
      s.select('dso:NGC1976', { focus: true });
    })()
  `)
  await wait(3500)
  await shoot(win, '13-nebula')

  // --- imagery -----------------------------------------------------------
  // The all-sky panorama over the galactic centre, at a wide field where the
  // photograph is at its best. The bulge must land on Sagittarius.
  await run(`
    (() => {
      const s = window.__novaskyStore.getState();
      s.setScreen('sky');
      s.setSelectedNull = null;
      s.select(null);
      s.setTime(new Date('2027-07-15T03:30:00Z'));
    })()
  `)
  await wait(1500)
  for (let i = 0; i < 12; i++) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '-' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '-' })
    await wait(80)
  }
  // Look south, where the galactic centre sits on this date.
  for (let i = 0; i < 6; i++) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
    await wait(60)
  }
  await wait(3500)
  await shoot(win, '14-photo-sky')

  // A survey cutout of the Orion Nebula, registered against the catalogue stars.
  await run(`
    (() => {
      const s = window.__novaskyStore.getState();
      s.setTime(new Date('2027-01-15T02:00:00Z'));
      s.select('dso:NGC1976', { focus: true });
    })()
  `)
  await wait(3000)
  // Zoom well past the 6-degree threshold at which survey cutouts are requested.
  for (let i = 0; i < 11; i++) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '+' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '+' })
    await wait(150)
  }
  await run(`window.__novaskyStore.getState().select('dso:NGC1976', { focus: true })`)
  // The cutout is debounced, then downloaded, then decoded.
  await wait(9000)
  await shoot(win, '15-object-photo')

  const errors = await run(`window.__novaskyErrors || []`)
  if (errors.length > 0) {
    console.error('RENDERER ERRORS:', JSON.stringify(errors, null, 2))
    app.exit(2)
    return
  }
  console.log('all captures complete, no renderer errors')
  app.exit(0)
})

setTimeout(() => {
  console.error('capture timed out')
  app.exit(3)
}, 90000)
