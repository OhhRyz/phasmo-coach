import type { CSSProperties } from 'react'
import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId } from '../data/types'
import { cycleMark, type EvidenceMark } from '../engine/filter'
import { JournalBox } from './journal/Journal'

const MARK_LABEL: Record<EvidenceMark, string> = {
  unknown: 'non testée',
  found: 'trouvée',
  excluded: 'absente',
}

/** Ce que fera la prochaine touche (annoncé aux lecteurs d'écran et au survol). */
const NEXT_ACTION: Record<EvidenceMark, string> = {
  unknown: 'touche pour la cocher trouvée',
  found: 'touche pour la marquer absente (barrée)',
  excluded: 'touche pour l’effacer',
}

const HOW_STEPS = ['touche 1\u00a0fois\u202f: trouvée', '2\u00a0fois\u202f: absente (barrée)', '3\u00a0fois\u202f: effacée']

/** La consigne du carnet de preuves, la même partout où il apparaît (texte brut, pour les étiquettes). */
export const TRACKER_HOW = HOW_STEPS.join(' · ')

/** La même consigne à afficher : chaque étape reste d'un seul tenant quand la ligne se coupe. */
export function TrackerHow() {
  return (
    <>
      {HOW_STEPS.map((step, k) => (
        <span key={k}>
          <span style={{ whiteSpace: 'nowrap' }}>{step}</span>
          {k < HOW_STEPS.length - 1 && '\u00a0· '}
        </span>
      ))}
    </>
  )
}

/**
 * Le carnet de preuves, comme la page du journal du jeu :
 * une touche coche la preuve (trouvée), une deuxième la barre au crayon (absente), une troisième efface.
 * Sur ordinateur, le clic droit la marque absente directement.
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
    <ul className={`ev-list tracker${compact ? ' tracker--compact' : ''}`} aria-label={`Preuves (${TRACKER_HOW})`}>
      {EVIDENCE_IDS.map((id) => {
        const mark = value[id] ?? 'unknown'
        const ev = EVIDENCE[id]
        const impossible = mark === 'unknown' && possible && !possible.has(id)
        const label = `${ev.label} : ${MARK_LABEL[mark]}${impossible ? ' (impossible avec ce qui reste)' : ''} — ${NEXT_ACTION[mark]}`
        return (
          <li key={id} className={`ev ${mark === 'found' ? 'yes' : mark === 'excluded' ? 'no' : ''}${impossible ? ' impossible' : ''}`} data-ev={id} style={{ '--c': ev.color } as CSSProperties}>
            <button
              type="button"
              className="ev-btn"
              aria-label={label}
              title={`${label}${mark === 'excluded' ? '' : ' · clic droit : absente directement'}`}
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
