/**
 * First-launch onboarding.
 *
 * Six short steps covering what NovaSky is, why it needs a location, how to move around
 * the sky map, the Time Machine, notifications, and beginner mode. Skippable at every
 * step, and reopenable from Settings.
 */
import { useState, type JSX, type ReactNode } from 'react'
import { Icon } from './Icon'
import { LocationPicker } from './LocationPicker'
import { Toggle } from './ui'
import { useAppStore } from '../state/useAppStore'

interface Step {
  title: string
  body: ReactNode
}

export function Onboarding(): JSX.Element | null {
  const open = useAppStore((s) => s.onboardingOpen)
  const complete = useAppStore((s) => s.completeOnboarding)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const showToast = useAppStore((s) => s.showToast)
  const [index, setIndex] = useState(0)

  if (!open) return null

  const enableNotifications = async (enabled: boolean): Promise<void> => {
    const next = await window.novasky.enableNotifications(enabled)
    useAppStore.setState({ settings: next })
    if (enabled) showToast('Notifications enabled. You can turn them off in Settings.')
  }

  const steps: Step[] = [
    {
      title: 'Welcome to NovaSky',
      body: (
        <div className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            NovaSky shows you the real sky above your location, at any moment in time. It
            draws 8 900 naked-eye stars, all 88 constellations, the planets, the Moon and
            over a thousand deep-sky objects, using published astronomical catalogues.
          </p>
          <p>
            Everything you need to identify what you are looking at works offline. Only
            satellite tracking needs the internet, because orbits change from day to day.
          </p>
        </div>
      )
    },
    {
      title: 'Where are you observing from?',
      body: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-300">
            The sky looks different from every point on Earth, so NovaSky needs to know
            roughly where you are to place the horizon and work out what has risen. Your
            location stays on this computer. There is no account and nothing is uploaded.
          </p>
          <LocationPicker />
        </div>
      )
    },
    {
      title: 'Moving around the sky',
      body: (
        <div className="space-y-3 text-sm leading-relaxed text-slate-300">
          <ul className="space-y-2">
            <li>
              <strong className="text-slate-100">Drag</strong> with the mouse or trackpad to
              look around. The horizon and compass points stay fixed while the sky turns.
            </li>
            <li>
              <strong className="text-slate-100">Scroll or pinch</strong> to zoom in and out.
            </li>
            <li>
              <strong className="text-slate-100">Arrow keys</strong> pan, and{' '}
              <kbd className="rounded border border-space-600 px-1 font-mono text-xs">+</kbd> /{' '}
              <kbd className="rounded border border-space-600 px-1 font-mono text-xs">−</kbd> zoom.
            </li>
            <li>
              <strong className="text-slate-100">Click any object</strong> to see its distance,
              brightness, rise and set times and a short explanation.
            </li>
          </ul>
          <p className="rounded-lg border border-space-700 bg-space-900/60 px-3 py-2 text-xs text-slate-400">
            Press <kbd className="rounded border border-space-600 px-1 font-mono">S</kbd> at any
            time to search for something by name.
          </p>
        </div>
      )
    },
    {
      title: 'The Time Machine',
      body: (
        <div className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            Press <kbd className="rounded border border-space-600 px-1 font-mono">T</kbd> to open
            the Time Machine and set the sky to any date: last night, your birthday, or a
            century from now. Everything updates together: positions, rise and set times,
            visibility and the Tonight list.
          </p>
          <p>
            You can also play time forward at up to a month per second to watch the sky turn,
            planets loop back on themselves, and the Moon run through its phases.
          </p>
        </div>
      )
    },
    {
      title: 'Notifications (optional)',
      body: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-300">
            NovaSky can give you a desktop notification an hour before a meteor shower peak,
            an eclipse, or a planet reaching opposition. This is entirely optional and off by
            default.
          </p>
          <div className="rounded-lg border border-space-700 bg-space-900/60 px-3 py-1">
            <Toggle
              checked={settings.notificationsEnabled}
              onChange={(value) => void enableNotifications(value)}
              label="Send me desktop notifications"
              description="You can change this at any time in Settings."
            />
          </div>
        </div>
      )
    },
    {
      title: 'Beginner mode',
      body: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-300">
            Beginner mode strips the sky back to the major constellations and the brightest
            stars, with simpler labels. It makes the sky far easier to read when you are
            starting out, and the Learn screen has guided activities that use it.
          </p>
          <div className="rounded-lg border border-space-700 bg-space-900/60 px-3 py-1">
            <Toggle
              checked={settings.beginnerMode}
              onChange={(value) => void updateSettings({ beginnerMode: value })}
              label="Start in beginner mode"
              description="Toggle any time with the B key."
            />
          </div>
        </div>
      )
    }
  ]

  const step = steps[index]
  const isLast = index === steps.length - 1

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-space-950/85 px-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="panel flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-space-700/60 px-5 py-3">
          <h2 id="onboarding-title" className="text-lg font-semibold text-slate-50">
            {step.title}
          </h2>
          <button
            type="button"
            onClick={() => void complete()}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Skip
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{step.body}</div>

        <div className="flex items-center justify-between gap-3 border-t border-space-700/60 px-5 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-6 bg-nova-400' : 'w-1.5 bg-space-600'
                }`}
              />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            Step {index + 1} of {steps.length}
          </p>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" onClick={() => setIndex(index - 1)} className="btn-ghost">
                <Icon name="chevron-left" size={15} />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? void complete() : setIndex(index + 1))}
              className="btn-primary"
            >
              {isLast ? 'Start exploring' : 'Next'}
              {!isLast && <Icon name="chevron-right" size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
