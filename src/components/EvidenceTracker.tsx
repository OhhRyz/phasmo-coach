import type { CSSProperties } from 'react'
import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId } from '../data/types'
import { cycleMark, type EvidenceMark } from '../engine/filter'
import { JournalBox } from './journal/Journal'

const MARK_LABEL: Record<EvidenceMark, string> = {
  unknown: 'non testée',
  found: 'trouvée',
  excluded: 'exclue',
}

/**
 * Le carnet de preuves, comme la page du journal du jeu :
 * un clic coche la preuve, un deuxième la barre au crayon, un troisième efface.
 */
export function EvidenceTracker({
  value,
  onChange,
  possible,
  compact,
}: {
  value: Partial<Record<EvidenceId, EvidenceMark>>
  onChange: (next: Partial<Record<EvidenceId, EvidenceMark>>) => void
  /** preuves encore possibles parmi les entités restantes */
  possible?: Set<EvidenceId>
  /** deux colonnes serrées (barre latérale d'enquête) */
  compact?: boolean
}) {
  return (
    <ul className={`ev-list tracker${compact ? ' tracker--compact' : ''}`} aria-label="Preuves (un clic : trouvée, deux : exclue, trois : effacée)">
      {EVIDENCE_IDS.map((id) => {
        const mark = value[id] ?? 'unknown'
        const ev = EVIDENCE[id]
        const impossible = mark === 'unknown' && possible && !possible.has(id)
        return (
          <li key={id} className={`ev ${mark === 'found' ? 'yes' : mark === 'excluded' ? 'no' : ''}${impossible ? ' impossible' : ''}`} data-ev={id} style={{ '--c': ev.color } as CSSProperties}>
            <button
              type="button"
              className="ev-btn"
              aria-label={`${ev.label} : ${MARK_LABEL[mark]}`}
              onClick={() => onChange({ ...value, [id]: cycleMark(mark) })}
              onContextMenu={(e) => {
                e.preventDefault()
                onChange({ ...value, [id]: mark === 'excluded' ? 'unknown' : 'excluded' })
              }}
            >
              <JournalBox state={mark === 'found' ? 'yes' : mark === 'excluded' ? 'no' : 'empty'} color={ev.color} seed={`trk-${id}`} delay={0} crossOut />
              <span className="ev-text">
                <span className="ev-name">
                  <span className="l">{ev.label}</span>
                  <span className="s">{ev.short}</span>
                </span>
                {mark !== 'unknown' && <span className="side">{MARK_LABEL[mark]}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
