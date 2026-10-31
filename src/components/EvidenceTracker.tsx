import type { CSSProperties } from 'react'
import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId } from '../data/types'
import { cycleMark, type EvidenceMark } from '../engine/filter'

const MARK_LABEL: Record<EvidenceMark, string> = {
  unknown: 'non testée',
  found: 'trouvée',
  excluded: 'exclue',
}

/** Carnet de preuves : un clic = trouvée, deux = exclue, trois = non testée. */
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
    <div className="tracker" role="group" aria-label="Preuves">
      {EVIDENCE_IDS.map((id) => {
        const mark = value[id] ?? 'unknown'
        const ev = EVIDENCE[id]
        const impossible = mark === 'unknown' && possible && !possible.has(id)
        return (
          <button
            key={id}
            type="button"
            className={`track ${mark}${impossible ? ' impossible' : ''}`}
            style={{ '--c': ev.color } as CSSProperties}
            aria-label={`${ev.label} : ${MARK_LABEL[mark]}`}
            title={ev.label}
            onClick={() => onChange({ ...value, [id]: cycleMark(mark) })}
            onContextMenu={(e) => {
              e.preventDefault()
              onChange({ ...value, [id]: mark === 'excluded' ? 'unknown' : 'excluded' })
            }}
          >
            <span className="track-name">{ev.short}</span>
            <span className="track-state">{mark === 'unknown' ? '' : MARK_LABEL[mark]}</span>
          </button>
        )
      })}
    </div>
  )
}
