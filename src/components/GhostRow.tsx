import { Link } from 'react-router-dom'
import type { Ghost } from '../data/types'
import { sanityText, speedText } from '../engine/format'
import { GhostEvidence, Mastery } from './ui'

export function losText(ghost: Ghost): string {
  if (ghost.speed.min < 0 || ghost.id === 'the-mimic') return 'Variable'
  return ghost.speed.los ? 'Oui' : 'Non'
}

/** Ligne de l'index du codex (tableau sur ordinateur, bloc sur mobile). */
export function GhostRow({ ghost, mastery, dimmed }: { ghost: Ghost; mastery: number; dimmed?: boolean }) {
  return (
    <tr className={dimmed ? 'dimmed' : undefined}>
      <th scope="row">
        <Link to={`/codex/${ghost.id}`} className="ghost-link">
          {ghost.name}
        </Link>
        {ghost.nameEn !== ghost.name && <span className="faint en">{ghost.nameEn}</span>}
      </th>
      <td data-label="Preuves">
        <GhostEvidence ghost={ghost} short />
      </td>
      <td data-label="Vitesse" className="mono">
        {speedText(ghost)}
      </td>
      <td data-label="Accél. LdV">{losText(ghost)}</td>
      <td data-label="Seuil" className="mono">
        {sanityText(ghost)}
      </td>
      <td data-label="Maîtrise">
        <Mastery value={mastery} />
      </td>
    </tr>
  )
}
