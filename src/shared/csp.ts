/**
 * The renderer's Content Security Policy.
 *
 * Kept out of the main process module so it can be unit-tested: a CSP that is too tight
 * fails silently. The window comes up blank with nothing in the terminal, which is
 * exactly the kind of regression a test should catch.
 */

/**
 * In production the renderer needs no remote origins at all. Catalogues arrive over IPC
 * and the only outbound request the app makes (CelesTrak) is issued by the main
 * process, so `connect-src` stays closed and scripts are restricted to the bundle.
 *
 * The Vite dev server needs more: it serves modules over http from localhost, keeps a
 * WebSocket open for hot reload, and @vitejs/plugin-react injects its React Refresh
 * preamble as an **inline** script. Without `'unsafe-inline'` that preamble is blocked,
 * the plugin throws "can't detect preamble" while evaluating the first component, and
 * the window renders nothing at all.
 */
export function buildContentSecurityPolicy(isDev: boolean): string {
  const scriptSources = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'"
  const connectSources = isDev
    ? "'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*"
    : "'self'"

  return [
    "default-src 'self'",
    // Vite injects styles as <style> tags; the sky map sets inline transforms on labels.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    `script-src ${scriptSources}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
}
