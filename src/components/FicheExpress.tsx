import { getGhost } from '../data'
import { NNBSP, spellLdV } from '../engine/format'
import { TapeButton } from './journal/Journal'
import { GhostEvidence, Modal } from './ui'

/**
 * La fiche express d'une entité, posée sur l'exercice en cours (copie du quiz, carte de révision) : on la lit
 * sans quitter l'exercice. `back` : le bouton qui la referme ; `later` : quand relire la fiche complète.
 */
export function FicheExpress({ ghostId, onClose, back, later }: { ghostId: string | null; onClose: () => void; back: string; later: string }) {
  const ghost = ghostId ? getGhost(ghostId) : undefined
  return (
    <Modal
      open={!!ghost}
      onClose={onClose}
      title={ghost ? `Fiche express · ${ghost.name}` : 'Fiche express'}
      actions={<TapeButton onClick={onClose}>{back}</TapeButton>}
    >
      {ghost && (
        <div className="qz-fiche">
          <p className="qz-fiche-sum">{ghost.summary}</p>
          <p className="qz-fiche-line">
            <span className="qz-fiche-k">Preuves</span>
            <GhostEvidence ghost={ghost} />
          </p>
          <p className="qz-fiche-line">
            <span className="qz-fiche-k">Vitesse</span>
            <span>{spellLdV(ghost.speed.summary)}</span>
          </p>
          {ghost.keyTells.length > 0 && (
            <>
              <p className="qz-fiche-k">À retenir</p>
              <ol className="qz-fiche-tells">
                {ghost.keyTells.slice(0, 2).map((t, k) => (
                  <li key={k}>{spellLdV(t)}</li>
                ))}
              </ol>
            </>
          )}
          <p className="pencil-note qz-fiche-more">
            la fiche complète est dans le Codex{NNBSP}: tu pourras la relire {later}
          </p>
        </div>
      )}
    </Modal>
  )
}
