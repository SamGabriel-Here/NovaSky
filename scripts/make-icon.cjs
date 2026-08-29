/**
 * Renders the application icon to build/icon.png at 1024x1024.
 *
 * electron-builder turns that single PNG into the .icns, .ico and Linux icon set, so
 * this is the only source image the project needs. Rendering it with Electron itself
 * avoids adding an SVG-rasterising dependency just for one file.
 *
 *   npx electron scripts/make-icon.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const SIZE = 1024
const OUT = path.resolve(__dirname, '..', 'build', 'icon.png')

// A rounded square in the macOS proportions, a deep-space gradient, the NovaSky mark
// from the navigation rail, and a scatter of stars placed deterministically.
const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; }
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%"   stop-color="#141d3d"/>
      <stop offset="55%"  stop-color="#080d1c"/>
      <stop offset="100%" stop-color="#03050d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.46" r="0.5">
      <stop offset="0%"   stop-color="#4d86ff" stop-opacity="0.55"/>
      <stop offset="60%"  stop-color="#4d86ff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#4d86ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="warmGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%"   stop-color="#ffd9a0" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ffd9a0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="star" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="45%"  stop-color="#cfe3ff"/>
      <stop offset="100%" stop-color="#7aa9ff"/>
    </linearGradient>
  </defs>

  <rect x="88" y="88" width="848" height="848" rx="196" fill="url(#sky)"/>
  <rect x="88" y="88" width="848" height="848" rx="196" fill="url(#glow)"/>

  <!-- A warm halo behind one star, drawn first so it reads as glow rather than a disc. -->
  <circle cx="781" cy="268" r="34" fill="url(#warmGlow)"/>

  <!-- Background stars, sized and placed by hand so the layout is stable. -->
  <g fill="#dce8ff">
    <circle cx="250" cy="240" r="6"   opacity="0.85"/>
    <circle cx="781" cy="268" r="9"   opacity="1" fill="#fff3d8"/>
    <circle cx="330" cy="742" r="7"   opacity="0.8"/>
    <circle cx="742" cy="726" r="5"   opacity="0.7"/>
    <circle cx="196" cy="520" r="4.5" opacity="0.6"/>
    <circle cx="846" cy="512" r="5.5" opacity="0.72"/>
    <circle cx="404" cy="196" r="4"   opacity="0.55"/>
    <circle cx="616" cy="836" r="4"   opacity="0.55"/>
  </g>

  <!-- The NovaSky mark: the same four-point star used in the navigation rail. -->
  <g transform="translate(512 512) scale(30) translate(-12 -11.8)">
    <path d="M12 2.5 13.9 9l6.6 1.9-6.6 1.9L12 19.5 10.1 12.8 3.5 10.9 10.1 9z" fill="url(#star)"/>
  </g>
</svg>
</body></html>`

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`)
  await new Promise((resolve) => setTimeout(resolve, 600))

  // On a Retina display capturePage returns twice the CSS size, so normalise it.
  const captured = await win.webContents.capturePage()
  const image = captured.getSize().width === SIZE ? captured : captured.resize({ width: SIZE, height: SIZE })

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, image.toPNG())

  const { width, height } = image.getSize()
  console.log(`wrote ${OUT} (${width}x${height})`)
  app.exit(width === SIZE && height === SIZE ? 0 : 1)
})

setTimeout(() => {
  console.error('icon render timed out')
  app.exit(2)
}, 20000)
