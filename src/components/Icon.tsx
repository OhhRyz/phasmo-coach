import type { SVGProps } from 'react'

/** Jeu d'icônes dessinées pour l'app (24×24, trait). */
const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9" /><path d="M10 20v-6h4v6" /></>,
  codex: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /><path d="M9 8h7M9 12h5" /></>,
  train: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  quiz: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.2 1.2L7 5" /><path d="m3.5 12 1.2 1.2L7 11" /><circle cx="5" cy="18" r="1.2" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.8-4.8" /></>,
  ear: <><path d="M6 9a6 6 0 1 1 12 0c0 3.5-3 4.5-3 7.5a3.5 3.5 0 0 1-6.6 1.6" /><path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 1.5-1.5 2-1.5 3.5" /></>,
  notebook: <><rect x="4" y="3" width="15" height="18" rx="2" /><path d="M8 3v18" /><path d="M11.5 8H16M11.5 12H16" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,

  emf: <><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M9 6.5h6" /><path d="M9 11v3M11 10v4M13 9v5M15 8v6" /></>,
  dots: <><path d="M3 20 12 4l9 16z" opacity=".35" /><circle cx="8" cy="15" r="1.1" fill="currentColor" /><circle cx="12" cy="11" r="1.1" fill="currentColor" /><circle cx="16" cy="15" r="1.1" fill="currentColor" /><circle cx="12" cy="17" r="1.1" fill="currentColor" /><circle cx="10" cy="13.5" r=".8" fill="currentColor" /><circle cx="14" cy="13.5" r=".8" fill="currentColor" /></>,
  uv: <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7" /><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V14" /><path d="M8 12.5 6.6 11a1.6 1.6 0 0 0-2.4 2.1L8 18c1.3 1.8 2.8 3 5.5 3a4.5 4.5 0 0 0 4.5-4.5V12" /></>,
  freezing: <><path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11" /><path d="m9.5 3.5 2.5 2 2.5-2M9.5 20.5l2.5-2 2.5 2" /></>,
  orbs: <><circle cx="9" cy="10" r="3.2" /><circle cx="16.5" cy="15.5" r="2" /><circle cx="15.5" cy="6" r="1.2" /><circle cx="7" cy="18" r="1" /></>,
  writing: <><path d="M4 19.5V5a2 2 0 0 1 2-2h11v13" /><path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H17v3H5.5A1.5 1.5 0 0 1 4 19.5z" /><path d="m8 11 2-3 1.5 3 1.5-3" /></>,
  spiritbox: <><rect x="3" y="8" width="18" height="12" rx="2.5" /><path d="m7 8 9-5" /><circle cx="15.5" cy="14" r="2.5" /><path d="M6.5 12.5h4M6.5 15.5h4" /></>,

  flame: <><path d="M12 22a7 7 0 0 0 7-7c0-4.5-4-6.5-4-11-3 1.5-5 4-5 6.5C8.5 9 8 7.5 8 6.5 6 8.5 5 11.5 5 15a7 7 0 0 0 7 7z" /><path d="M12 22a3 3 0 0 0 3-3c0-2-2-3-2-5-2 1-4 2.5-4 5a3 3 0 0 0 3 3z" /></>,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowRight: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  volume: <><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  footsteps: <><path d="M5 15.5c-1-2.5-1.3-5.5.2-7.7 1.3-1.9 3.5-1.3 3.8 1.2.3 2.2-.5 4.3-.5 6.5" /><path d="M5.2 18.5a1.8 1.8 0 0 0 3.6 0v-1.5H5.2z" /><path d="M19 11.5c1-2.5 1.3-5.5-.2-7.7-1.3-1.9-3.5-1.3-3.8 1.2-.3 2.2.5 4.3.5 6.5" /><path d="M18.8 14.5a1.8 1.8 0 0 1-3.6 0V13h3.6z" /></>,
  skull: <><path d="M12 3a8 8 0 0 0-5 14.2V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.8A8 8 0 0 0 12 3z" /><circle cx="9" cy="12" r="1.6" fill="currentColor" /><circle cx="15" cy="12" r="1.6" fill="currentColor" /><path d="M10 21v-2.5M14 21v-2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  share: <><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
  upload: <><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 21h16" /></>,
  trash: <><path d="M4 7h16" /><path d="M9.5 7V4.5h5V7" /><path d="M6 7l1 13h10l1-13" /></>,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1-4.5-4.3 6.1-.8z" />,
  sparkles: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><path d="m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2z" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
  brain: <><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1z" /><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" /></>,
  filter: <path d="M4 5h16l-6 7.5V19l-4 2v-8.5z" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r=".6" fill="currentColor" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r=".6" fill="currentColor" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  ghost: <><path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.8L14.3 21 12 19.2 9.7 21l-2.4-1.8z" /><circle cx="9.5" cy="11" r="1.1" fill="currentColor" /><circle cx="14.5" cy="11" r="1.1" fill="currentColor" /></>,
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  shuffle: <><path d="M3 6h3.5a4 4 0 0 1 3.3 1.8l4.4 6.4A4 4 0 0 0 17.5 16H21" /><path d="M3 16h3.5a4 4 0 0 0 3.3-1.8M14.2 7.8A4 4 0 0 1 17.5 6H21" /><path d="m18 3 3 3-3 3M18 13l3 3-3 3" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" /><path d="M12 14v4M8 21h8M9.5 18h5" /></>,
  pin: <><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /><path d="M12 14v7" /></>,
  candle: <><path d="M9 10h6v11H9z" /><path d="M12 10V8" /><path d="M12 2.5c1.2 1.4 1.8 2.4 1.8 3.3a1.8 1.8 0 0 1-3.6 0c0-.9.6-1.9 1.8-3.3z" /></>,
  door: <><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" /><path d="M3 21h18" /><circle cx="15" cy="12.5" r=".9" fill="currentColor" /></>,
  thermometer: <><path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0z" /><path d="M12 9v7" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  quote: <><path d="M10 7H6a2 2 0 0 0-2 2v4h4v4H4" /><path d="M20 7h-4a2 2 0 0 0-2 2v4h4v4h-4" /></>,
} as const

export type IconName = keyof typeof PATHS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  title?: string
}

export function Icon({ name, size = 20, title, strokeWidth = 1.75, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}
