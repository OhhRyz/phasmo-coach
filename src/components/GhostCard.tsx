import { Link } from 'react-router-dom'
import type { Ghost } from '../data/types'
import { sanityText, speedText } from '../engine/format'
import { Icon } from './Icon'
import { GhostEvidence, GhostSigil, MasteryRing } from './ui'

export function GhostStats({ ghost }: { ghost: Ghost }) {
  const unknownSpeed = ghost.speed.min < 0
  return (
    <div className="ghost-stats">
      <span className="chip" title="Vitesse de chasse">
        <Icon name="zap" size={13} />
        <span className="mono">{speedText(ghost)}</span>
      </span>
      <span className="chip" title="Seuil de chasse">
        <Icon name="pulse" size={13} />
        <span className="mono">{sanityText(ghost)}</span>
      </span>
      {!unknownSpeed && ghost.id !== 'the-mimic' && (
        <span className={`chip${ghost.speed.los ? '' : ' chip-lantern'}`} title={ghost.speed.los ? 'Accélère en ligne de vue' : 'Pas d’accélération standard en ligne de vue'}>
          <Icon name={ghost.speed.los ? 'eye' : 'eyeOff'} size={13} />
          {ghost.speed.los ? 'LdV' : 'Sans LdV'}
        </span>
      )}
    </div>
  )
}

export function GhostCard({ ghost, mastery, dimmed }: { ghost: Ghost; mastery: number; dimmed?: boolean }) {
  return (
    <Link to={`/codex/${ghost.id}`} className={`card card-hover ghost-card${dimmed ? ' dimmed' : ''}`}>
      <div className="ghost-card-head">
        <GhostSigil ghost={ghost} mastery={mastery} />
        <div className="ghost-card-names">
          <h3>{ghost.name}</h3>
          {ghost.nameEn !== ghost.name && <span>{ghost.nameEn}</span>}
        </div>
        <MasteryRing value={mastery} size={36} />
      </div>
      <GhostEvidence ghost={ghost} />
      <GhostStats ghost={ghost} />
      {ghost.keyTells[0] && <p className="ghost-card-tell">{ghost.keyTells[0]}</p>}
    </Link>
  )
}
