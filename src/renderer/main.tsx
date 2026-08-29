import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAppStore } from './state/useAppStore'
import './styles/index.css'

// Development affordance: scripts/capture.cjs drives the app through its screens to
// produce documentation screenshots, and asserts that nothing threw along the way.
if (import.meta.env.MODE !== 'production') {
  const errors: string[] = []
  window.addEventListener('error', (event) => errors.push(String(event.message)))
  window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)))
  Object.assign(window, { __novaskyStore: useAppStore, __novaskyErrors: errors })
}

const container = document.getElementById('root')
if (!container) throw new Error('NovaSky: #root element is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
