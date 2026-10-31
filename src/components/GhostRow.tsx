import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Ghost } from '../data/types'
import { sanityText, speedText } from '../engine/format'
import { roughLine, roughRng } from './journal/rough'
import { GhostEvidence, Mastery } from './ui'

type Style = CSSProperties & Record<`--${string}`, string | number>

export function losText(ghost: Ghost): string {
  if (ghost.speed.min < 0 || ghost.id === 'the-mimic') return 'Variable'
  return ghost.speed.los ? 'Oui' : 'Non'
}

/** Trait de crayon qui barre une ligne du registre (se dessine à l'arrivée). */
function Strike({ seed }: { seed: string }) {
  const r = roughRng('strike-' + seed)
  const d = roughLine(0.5, 5.5 + r() * 2, 99.5, 3 + r() * 2.5, r, 0.9)
  return (
    <svg className="cx-strike draw" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
      <path d={d} pathLength={1} style={{ '--d': '0s', '--dur': '.45s' } as Style} />
    </svg>
  )
}

/**
 * Une ligne du registre du codex : numéro, nom, maîtrise, preuves, vitesse et seuil.
 * `dimmed` : entité éliminée par le carnet de preuves (barrée au crayon, pas cachée).
 */
export function GhostRow({ ghost, mastery, dimmed, n }: { ghost: Ghost; mastery: number; dimmed?: boolean; n?: number }) {
  const los = losText(ghost)
  return (
    <li className={`cx-row${dimmed ? ' is-out' : ''}`}>
      {n != null && (
        <span className="cx-num" aria-hidden>
          {String(n).padStart(2, '0')}
        </span>
      )}
      <span className="cx-name">
        <Link to={`/codex/${ghost.id}`} className="cx-link">
          {ghost.name}
          {dimmed && <span className="sr-only"> (éliminée)</span>}
        </Link>
        {ghost.nameEn !== ghost.name && <span className="cx-en">{ghost.nameEn}</span>}
      </span>
      <span className="cx-mast">
        <span className="sr-only">Maîtrise : </span>
        <Mastery value={mastery} />
      </span>
      <span className="cx-l2">
        <span className="cx-ev">
          <span className="sr-only">Preuves : </span>
          <GhostEvidence ghost={ghost} short />
        </span>
        <span className="cx-data">
          <span className="cx-speed">
            <span className="sr-only">Vitesse : </span>
            {speedText(ghost)}
          </span>
          <span className="cx-san">
            <span className="sr-only">, seuil de chasse : </span>
            {sanityText(ghost)}
          </span>
        </span>
        {los !== 'Oui' && <span className="cx-los pencil-note">{los === 'Non' ? 'n’accélère pas à vue' : 'accélération variable'}</span>}
      </span>
      {dimmed && <Strike seed={ghost.id} />}
    </li>
  )
}
