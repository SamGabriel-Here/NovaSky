/** Transient status message, announced politely to screen readers. */
import { useEffect, type JSX } from 'react'
import { useAppStore } from '../state/useAppStore'

export function Toast(): JSX.Element | null {
  const toast = useAppStore((s) => s.toast)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => showToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast, showToast])

  if (!toast) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-[70] rounded-lg border border-space-600 bg-space-850/95 px-4 py-2.5 text-sm text-slate-100 shadow-2xl"
    >
      {toast}
    </div>
  )
}
