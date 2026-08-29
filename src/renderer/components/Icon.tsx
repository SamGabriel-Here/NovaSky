/** Inline SVG icons. Bundling them avoids an icon dependency and keeps the app offline. */
import type { JSX, SVGProps } from 'react'

export type IconName =
  | 'sky'
  | 'search'
  | 'tonight'
  | 'learn'
  | 'events'
  | 'settings'
  | 'clock'
  | 'play'
  | 'pause'
  | 'reset'
  | 'close'
  | 'chevron-right'
  | 'chevron-left'
  | 'location'
  | 'bell'
  | 'offline'
  | 'online'
  | 'zoom-in'
  | 'zoom-out'
  | 'external'
  | 'check'
  | 'trophy'
  | 'info'

const PATHS: Record<IconName, JSX.Element> = {
  sky: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 14c3-1 6-1 9 0s6 1 9 0" />
      <path d="M9 5.5 9.6 7l1.5.6-1.5.6L9 9.7 8.4 8.2 6.9 7.6 8.4 7z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  tonight: (
    <>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </>
  ),
  learn: (
    <>
      <path d="M3 7.5 12 4l9 3.5-9 3.5z" />
      <path d="M7 10v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V10" />
      <path d="M21 7.5V13" />
    </>
  ),
  events: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5V6.5M16 3.5V6.5" />
      <circle cx="12" cy="14.5" r="1.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .35 1.9l.05.05a2 2 0 1 1-2.85 2.85l-.05-.05a1.7 1.7 0 0 0-1.9-.35 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.9.35l-.05.05A2 2 0 1 1 3.7 16.9l.05-.05a1.7 1.7 0 0 0 .35-1.9 1.7 1.7 0 0 0-1.55-1H2.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.35-1.9L3.75 6.9A2 2 0 1 1 6.6 4.05l.05.05a1.7 1.7 0 0 0 1.9.35H8.6a1.7 1.7 0 0 0 1-1.55V2.8a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.9-.35l.05-.05a2 2 0 1 1 2.85 2.85l-.05.05a1.7 1.7 0 0 0-.35 1.9v.05a1.7 1.7 0 0 0 1.55 1h.15a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.55 1Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4.5V10h5.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'chevron-right': <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  'chevron-left': <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  location: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </>
  ),
  offline: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.5M19 13a10 10 0 0 0-6-2.9" />
      <circle cx="12" cy="20" r=".6" />
    </>
  ),
  online: (
    <>
      <path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 14 0M2 9.5a15 15 0 0 1 20 0" />
      <circle cx="12" cy="20" r=".6" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M11 8.5v5M8.5 11h5M16 16l4.5 4.5" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M8.5 11h5M16 16l4.5 4.5" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5.5H5.5A2.5 2.5 0 0 0 8 10M16 5.5h2.5A2.5 2.5 0 0 1 16 10" />
      <path d="M12 13v3.5M9 20h6M10 16.5h4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.4" />
    </>
  )
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
