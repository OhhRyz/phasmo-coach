import type { CSSProperties } from 'react'
import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId } from '../data/types'
import { cycleMark, type EvidenceMark } from '../engine/filter'
import { Icon } from './Icon'

const MARK_LABEL: Record<EvidenceMark, string> = {
  unknown: 'non testée',
  found: 'trouvée',
  excluded: 'exclue',
}

export function EvidenceTracker({
  value,
  onChange,
  possible,
}: {
  value: Partial<Record<EvidenceId, EvidenceMark>>
  onChange: (next: Partial<Record<EvidenceId, EvidenceMark>>) => void
  /** preuves encore possibles parmi les entités restantes */
  possible?: Set<EvidenceId>
}) {
  return (
    <div className="tracker" role="group" aria-label="Preuves (clic : trouvée → exclue → non testée)">
      {EVIDENCE_IDS.map((id) => {
        const mark = value[id] ?? 'unknown'
        const ev = EVIDENCE[id]
        const impossible = mark === 'unknown' && possible && !possible.has(id)
        return (
          <button
            key={id}
            type="button"
            className={`track-btn ${mark}${impossible ? ' impossible' : ''}`}
            style={{ '--c': ev.color } as CSSProperties}
            aria-label={`${ev.label} : ${MARK_LABEL[mark]}`}
            onClick={() => onChange({ ...value, [id]: cycleMark(mark) })}
            onContextMenu={(e) => {
              e.preventDefault()
              onChange({ ...value, [id]: mark === 'excluded' ? 'unknown' : 'excluded' })
            }}
          >
            <span className="track-state" aria-hidden>
              {mark === 'found' && <Icon name="check" size={14} strokeWidth={2.4} />}
              {mark === 'excluded' && <Icon name="x" size={14} strokeWidth={2.4} />}
            </span>
            <Icon name={id} size={18} className="track-icon" />
            <span className="track-label" title={ev.label}>
              {ev.short}
            </span>
          </button>
        )
      })}
    </div>
  )
}
