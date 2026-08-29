/** Small shared primitives: tooltips, toggles, section headings, empty and error states. */
import { useId, useState, type JSX, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface TooltipProps {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'right'
}

/**
 * A hover/focus tooltip. The label is also wired up with `aria-describedby`, so screen
 * readers get the same explanation that sighted users get from hovering.
 */
export function Tooltip({ label, children, side = 'top' }: TooltipProps): JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(false)
  const position =
    side === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 ml-2'
      : side === 'bottom'
        ? 'top-full left-1/2 -translate-x-1/2 mt-2'
        : 'bottom-full left-1/2 -translate-x-1/2 mb-2'

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-space-600 bg-space-900 px-2 py-1 text-xs text-slate-200 shadow-lg ${position}`}
        >
          {label}
        </span>
      )}
    </span>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps): JSX.Element {
  return (
    <label
      className={`flex items-start justify-between gap-4 py-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-slate-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-nova-500' : 'bg-space-600'
        }`}
      >
        {/* `left-0` is required: without it the knob is placed from the button's
            centred static position rather than its left edge. */}
        <span
          className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-smooth ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  )
}

export function SectionHeading({
  title,
  subtitle,
  action
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  icon = 'info',
  title,
  description
}: {
  icon?: IconName
  title: string
  description?: string
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-space-600 px-6 py-10 text-center">
      <Icon name={icon} size={22} className="text-slate-500" />
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="max-w-md text-xs text-slate-500">{description}</p>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }): JSX.Element {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 px-1 py-6 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-space-500 border-t-nova-400" />
      {label}
    </div>
  )
}

export function ErrorState({ title, detail }: { title: string; detail?: string }): JSX.Element {
  return (
    <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3">
      <p className="text-sm font-medium text-rose-200">{title}</p>
      {detail && <p className="mt-1 text-xs text-rose-300/80">{detail}</p>}
    </div>
  )
}

/**
 * Badge that says where a value came from. Used everywhere a number is shown, so the
 * user can always tell calculated values from catalogue values from live downloads.
 */
export function OriginBadge({ origin }: { origin: 'calculated' | 'catalog' | 'live' | 'cached' }): JSX.Element {
  const copy = {
    calculated: { label: 'Calculated', hint: 'Computed from the astronomy-engine ephemeris for this exact moment.' },
    catalog: { label: 'Catalogue', hint: 'Read from a star catalogue bundled with the app.' },
    live: { label: 'Live', hint: 'Downloaded from the network during this session.' },
    cached: { label: 'Cached', hint: 'From an earlier download, reused because the network is unavailable.' }
  }[origin]
  const tone = {
    calculated: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    catalog: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    live: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    cached: 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }[origin]
  return (
    <Tooltip label={copy.hint}>
      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
        {copy.label}
      </span>
    </Tooltip>
  )
}

/** Definition-list row used across the detail panels. */
export function DataRow({
  label,
  value,
  hint,
  badge
}: {
  label: string
  value: ReactNode
  hint?: string
  badge?: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-space-700/50 py-2 last:border-0">
      <dt className="flex items-center gap-1.5 text-xs text-slate-400">
        {label}
        {hint && (
          <Tooltip label={hint}>
            <Icon name="info" size={13} className="text-slate-500" />
          </Tooltip>
        )}
      </dt>
      <dd className="flex items-center gap-2 text-right text-sm text-slate-100">
        {value}
        {badge}
      </dd>
    </div>
  )
}
