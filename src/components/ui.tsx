import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { EVIDENCE } from '../data/evidence'
import type { EvidenceId, Ghost } from '../data/types'
import { masteryLevel } from '../engine/progress'
import { Icon, type IconName } from './Icon'

export function EvidencePill({
  id,
  compact,
  forced,
  fake,
}: {
  id: EvidenceId
  compact?: boolean
  forced?: boolean
  fake?: boolean
}) {
  const ev = EVIDENCE[id]
  const title = `${ev.label}${forced ? ' — preuve forcée' : ''}${fake ? ' — fausse preuve' : ''}`
  return (
    <span
      className={`ev${compact ? ' compact' : ''}${forced ? ' forced' : ''}`}
      style={{ '--c': ev.color } as CSSProperties}
      title={title}
    >
      <Icon name={id} size={16} />
      {!compact && <span>{ev.short}</span>}
      {!compact && forced && <span className="faint">· forcée</span>}
      {!compact && fake && <span className="faint">· fausse</span>}
      {compact && <span className="sr-only">{title}</span>}
    </span>
  )
}

export function GhostEvidence({ ghost, compact }: { ghost: Ghost; compact?: boolean }) {
  return (
    <div className="ev-list">
      {ghost.evidence.map((e) => (
        <EvidencePill key={e} id={e} compact={compact} forced={ghost.forcedEvidence === e} />
      ))}
      {ghost.fakeEvidence && <EvidencePill id={ghost.fakeEvidence} compact={compact} fake />}
    </div>
  )
}

export function MasteryRing({ value, size = 40, label = true }: { value: number; size?: number; label?: boolean }) {
  const lvl = masteryLevel(value)
  const stroke = size >= 56 ? 5 : 3.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.round(value * 100)
  return (
    <svg
      className={`ring tone-${lvl.tone}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Maîtrise ${pct} % (${lvl.label})`}
      style={{ '--ring-w': stroke } as CSSProperties}
    >
      <circle className="track" cx={size / 2} cy={size / 2} r={r} />
      <circle
        className="val"
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--tone)"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.001, value))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {label && (
        <text className="ring-label" x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={size >= 56 ? { fontSize: '0.85rem' } : undefined}>
          {pct}
        </text>
      )}
    </svg>
  )
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  )
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <h3>{title}</h3>
      {children}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  )
}

/** Monogramme d'une entité : initiale dans un médaillon teinté par la maîtrise. */
export function GhostSigil({ ghost, mastery, size = 44 }: { ghost: Ghost; mastery: number; size?: number }) {
  const lvl = masteryLevel(mastery)
  const letter = ghost.name.replace(/^(Le |Les |La )/, '').charAt(0)
  return (
    <span className={`sigil tone-${lvl.tone}`} style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden>
      {letter}
    </span>
  )
}
