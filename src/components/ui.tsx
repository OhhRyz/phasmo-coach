import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { EVIDENCE } from '../data/evidence'
import type { EvidenceId, Ghost } from '../data/types'
import { masteryLevel } from '../engine/progress'
import { H } from './journal/Journal'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Nom d'une preuve, souligné dans sa couleur du jeu. */
export function Evidence({ id, forced, fake, short }: { id: EvidenceId; forced?: boolean; fake?: boolean; short?: boolean }) {
  const ev = EVIDENCE[id]
  return (
    <span
      className={`evw${forced ? ' forced' : ''}`}
      style={{ '--c': ev.color } as Style}
      title={forced ? `${ev.label} : preuve forcée` : fake ? `${ev.label} : fausse preuve` : ev.label}
    >
      {short ? ev.short : ev.label}
      {fake && <span className="faint"> (fausse)</span>}
    </span>
  )
}

export function GhostEvidence({ ghost, short }: { ghost: Ghost; short?: boolean }) {
  return (
    <span className="evw-list">
      {ghost.evidence.map((e) => (
        <Evidence key={e} id={e} short={short} forced={ghost.forcedEvidence === e} />
      ))}
      {ghost.fakeEvidence && <Evidence id={ghost.fakeEvidence} short={short} fake />}
    </span>
  )
}

/** Maîtrise : coup de surligneur proportionnel + pourcentage tapé. */
export function Mastery({ value, showLabel }: { value: number; showLabel?: boolean }) {
  const pct = Math.round(value * 100)
  return (
    <span className="mastery" title={`Maîtrise : ${pct} % (${masteryLevel(value).label})`}>
      <span className="mastery-hl" style={{ '--m': value } as Style} aria-hidden />
      <span className="pct">{pct} %</span>
      {showLabel && <span className="hand mastery-word">{masteryLevel(value).label.toLowerCase()}</span>}
    </span>
  )
}

/** Avancement d'une séance : un trait de crayon qui se remplit à l'encre rouge. */
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Choix exclusif : l'option retenue est entourée au stylo. */
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
    <div className="opts" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="opt" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-note">
      <H>{title}</H>
      {children}
    </div>
  )
}

/** Ancien en-tête de page : conservé le temps de migrer toutes les pages vers le carnet. */
export function PageHead({ title, children, actions, crumb }: { title: ReactNode; children?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <header className="legacy-head">
      {crumb}
      <H as="h1">{title}</H>
      {children && <p className="prose">{children}</p>}
      {actions && <div className="row">{actions}</div>}
    </header>
  )
}
