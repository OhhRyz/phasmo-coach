import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EVIDENCE } from '../data/evidence'
import { fr } from '../engine/format'
import type { EvidenceId, Ghost } from '../data/types'
import { masteryLevel } from '../engine/progress'
import { H } from './journal/Journal'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Vrai tant que la fenêtre correspond à la requête média (suit les changements de taille). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof matchMedia === 'undefined') return () => {}
      const mq = matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => typeof matchMedia !== 'undefined' && matchMedia(query).matches,
  )
}

/** Nom d'une preuve, souligné dans sa couleur du jeu. */
export function Evidence({ id, forced, fake, short }: { id: EvidenceId; forced?: boolean; fake?: boolean; short?: boolean }) {
  const ev = EVIDENCE[id]
  return (
    <span
      className={`evw${forced ? ' forced' : ''}`}
      style={{ '--c': ev.color } as Style}
      title={forced ? `${ev.label}\u202f: preuve forcée` : fake ? `${ev.label}\u202f: fausse preuve` : ev.label}
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
    <span className="mastery" title={`Maîtrise\u202f: ${pct}\u00a0% (${masteryLevel(value).label})`}>
      <span className="mastery-hl" style={{ '--m': value } as Style} aria-hidden />
      <span className="pct">{`${pct}\u00a0%`}</span>
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

/**
 * Le focus sur le titre de la page, sans contour ni défilement : après avoir quitté un exercice (la page de
 * réglages revient), ou à la fermeture d'une fiche dont le déclencheur a disparu. Sinon il tomberait sur la page
 * entière, et Tab repartirait du haut de l'écran.
 */
export function focusPageTitle(): void {
  const h1 = document.querySelector<HTMLElement>('main h1')
  if (!h1) return
  if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
  h1.focus({ preventScroll: true })
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
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  // le déclencheur (bouton, lien) se note au rendu qui ouvre la fenêtre : au moment de l'effet, un champ de la
  // fenêtre en autoFocus a déjà pris le focus, et c'est lui qu'on rendrait, disparu, à la fermeture
  const trigger = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open !== wasOpen.current) {
    if (open && typeof document !== 'undefined') trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    wasOpen.current = open
  }
  useEffect(() => {
    if (!open) return
    const back = trigger.current
    const onKey = (e: KeyboardEvent) => {
      // un formulaire de la fenêtre qui gère lui-même Échap (texte à ne pas perdre) l'a déjà traité
      if (e.key === 'Escape' && !e.defaultPrevented) close.current()
      if (e.key !== 'Tab' || !box.current) return
      // le focus reste sur la fiche tant qu'elle est posée
      const items = box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!box.current?.contains(document.activeElement)) {
      const auto = box.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select')
      ;(auto ?? box.current)?.focus()
    }
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      // le déclencheur a pu disparaître (note supprimée) : on rend le focus au titre de la page, sans remonter
      // en haut de la page
      if (back?.isConnected) back.focus({ preventScroll: true })
      else focusPageTitle()
    }
  }, [open])
  if (!open) return null
  // rendue hors du carnet : sinon la fiche passerait sous la barre d'onglets
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={fr(title)} ref={box} tabIndex={-1}>
        <h2>{fr(title)}</h2>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Empty({ title, children, as }: { title: string; children?: ReactNode; as?: 'h1' | 'h2' }) {
  return (
    <div className="empty-note">
      <H as={as}>{title}</H>
      {children}
    </div>
  )
}
