/**
 * Application shell: bootstrap, the clock, global keyboard shortcuts and routing
 * between the six screens.
 */
import { useEffect, type JSX } from 'react'
import { NavRail } from './components/NavRail'
import { TopBar } from './components/TopBar'
import { SearchPalette } from './components/SearchPalette'
import { Onboarding } from './components/Onboarding'
import { Toast } from './components/Toast'
import { ErrorState } from './components/ui'
import { SkyScreen } from './screens/SkyScreen'
import { SearchScreen } from './screens/SearchScreen'
import { TonightScreen } from './screens/TonightScreen'
import { LearnScreen } from './screens/LearnScreen'
import { EventsScreen } from './screens/EventsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useAppStore } from './state/useAppStore'

/** How often the sky clock advances. One second is smooth without being wasteful. */
const TICK_MS = 1000

function useClock(): void {
  const tick = useAppStore((s) => s.tick)
  useEffect(() => {
    let last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      const elapsed = now - last
      last = now
      tick(elapsed)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [tick])
}

/** T, S, B, F and Escape, as documented in Settings. */
function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useAppStore.getState()
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

      if (event.key === 'Escape') {
        if (state.searchOpen) state.setSearchOpen(false)
        else if (state.timeMachineOpen) state.setTimeMachineOpen(false)
        else if (state.selectedId) state.select(null)
        return
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return

      switch (event.key.toLowerCase()) {
        case 't':
          event.preventDefault()
          state.setTimeMachineOpen(!state.timeMachineOpen)
          if (state.screen !== 'sky') state.setScreen('sky')
          break
        case 's':
          event.preventDefault()
          state.setSearchOpen(true)
          break
        case 'b':
          event.preventDefault()
          void state.toggleBeginnerMode()
          break
        case 'f':
          event.preventDefault()
          void window.novasky.toggleFullscreen()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Unlocks the achievements that depend on how the app is used. */
function useProgressWatchers(): void {
  const live = useAppStore((s) => s.live)
  const selectedId = useAppStore((s) => s.selectedId)
  const onboardingOpen = useAppStore((s) => s.onboardingOpen)
  const status = useAppStore((s) => s.status)

  useEffect(() => {
    if (!live) void useAppStore.getState().unlockAchievement('time-traveller')
  }, [live])

  useEffect(() => {
    if (!selectedId) return
    const object = useAppStore.getState().getObject(selectedId)
    if (object?.aliases.some((a) => /^M\d+$/.test(a))) {
      void useAppStore.getState().unlockAchievement('deep-diver')
    }
  }, [selectedId])

  useEffect(() => {
    if (status === 'ready' && !onboardingOpen) {
      void useAppStore.getState().unlockAchievement('first-light')
    }
  }, [status, onboardingOpen])
}

function ScreenRouter(): JSX.Element {
  const screen = useAppStore((s) => s.screen)
  switch (screen) {
    case 'sky':
      return <SkyScreen />
    case 'search':
      return <SearchScreen />
    case 'tonight':
      return <TonightScreen />
    case 'learn':
      return <LearnScreen />
    case 'events':
      return <EventsScreen />
    case 'settings':
      return <SettingsScreen />
  }
}

function Splash({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-space-950">
      <svg width="52" height="52" viewBox="0 0 24 24" className="animate-pulse text-nova-400">
        <path
          d="M12 2.5 13.9 9l6.6 1.9-6.6 1.9L12 19.5 10.1 12.8 3.5 10.9 10.1 9z"
          fill="currentColor"
        />
      </svg>
      <p className="text-sm text-slate-400" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  )
}

export function App(): JSX.Element {
  const status = useAppStore((s) => s.status)
  const error = useAppStore((s) => s.error)
  const initialise = useAppStore((s) => s.initialise)

  useEffect(() => {
    void initialise()
  }, [initialise])

  useClock()
  useShortcuts()
  useProgressWatchers()

  if (status === 'loading') return <Splash message="Loading star catalogues…" />

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-space-950 px-6">
        <div className="max-w-lg">
          <ErrorState
            title="NovaSky could not start"
            detail={error ?? 'An unexpected error occurred while loading the catalogues.'}
          />
          <p className="mt-3 text-xs text-slate-500">
            If the catalogue files are missing, run <code className="font-mono">npm run data:build</code>{' '}
            in the project directory to download them, then restart the app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-space-950">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1">
          <ScreenRouter />
        </main>
      </div>
      <SearchPalette />
      <Onboarding />
      <Toast />
    </div>
  )
}
