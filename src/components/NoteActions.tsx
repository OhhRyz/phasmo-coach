import { useState, type ReactNode } from 'react'
import type { CoachNote } from '../engine/cards'
import { NNBSP, validTime } from '../engine/format'
import { isOwnNote, makesCard } from '../engine/notes'
import { useStore } from '../store/store'
import { TapeButton, TypedLink } from './journal/Journal'
import { NoteEditor } from './NoteEditor'
import { useToast } from './Toast'
import { Modal } from './ui'

/**
 * Modifier ou supprimer une note, avec les mêmes fenêtres partout (« Mes notes », fiche d'une entité) :
 * l'éditeur de la note, et la confirmation avant de supprimer. `modals` se place une fois dans la page.
 */
export function useNoteActions() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState<CoachNote | null>(null)
  const [deleting, setDeleting] = useState<CoachNote | null>(null)
  const profile = state.profile
  // côté coach : une note déjà partagée (pas modifiée depuis le dernier envoi) est peut-être chez l'élève
  const lastShared = validTime(state.settings.lastSharedAt)
  const sharedAlready = (n: CoachNote) => profile.role === 'coach' && lastShared != null && n.updatedAt <= lastShared && isOwnNote(n, profile)

  const modals = (
    <>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Modifier la note">
        {editing && <NoteEditor note={editing} bare onDone={() => setEditing(null)} />}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Supprimer cette note${NNBSP}?`}
        actions={
          <>
            <TypedLink onClick={() => setDeleting(null)}>Annuler</TypedLink>
            <TapeButton
              arrow={false}
              onClick={() => {
                if (deleting) dispatch({ type: 'note:delete', id: deleting.id })
                setDeleting(null)
                toast('Note supprimée')
              }}
            >
              Supprimer
            </TapeButton>
          </>
        }
      >
        <p className="modal-text">
          «{NNBSP}
          {deleting?.title}
          {NNBSP}»{deleting && makesCard(deleting) ? ' et sa carte de révision seront supprimées' : ' sera supprimée'} de cet appareil.
          {/* une suppression ne part pas avec le partage : l'élève garde la note déjà reçue */}
          {deleting && sharedAlready(deleting) && ` Si ton élève l’a déjà reçue, elle reste dans son carnet.`}
        </p>
      </Modal>
    </>
  )

  return {
    /** seules les notes de la personne qui tient le carnet (ou sans signature) se modifient ; toutes se suppriment */
    canEdit: (n: CoachNote) => isOwnNote(n, profile) || !n.author,
    edit: setEditing,
    remove: setDeleting,
    modals,
  }
}

/** Le titre de la note, pour les lecteurs d'écran : « Modifier « Encens » ». */
export function NoteName({ note }: { note: CoachNote }) {
  return (
    <span className="sr-only">
      {' '}
      «{NNBSP}
      {note.title}
      {NNBSP}»
    </span>
  )
}

/** « Modifier · Supprimer » sous une note (avant, d'autres actions éventuelles, comme « Épingler »). */
export function NoteActionLinks({
  note,
  actions,
  before,
  className = '',
}: {
  note: CoachNote
  actions: ReturnType<typeof useNoteActions>
  before?: ReactNode
  className?: string
}) {
  const dot = (
    <span className="dot" aria-hidden>
      ·
    </span>
  )
  const edit = actions.canEdit(note)
  return (
    <span className={`carnet-actions ${className}`}>
      {before}
      {before && dot}
      {edit && (
        <>
          <TypedLink onClick={() => actions.edit(note)}>
            Modifier
            <NoteName note={note} />
          </TypedLink>
          {dot}
        </>
      )}
      <TypedLink onClick={() => actions.remove(note)}>
        Supprimer
        <NoteName note={note} />
      </TypedLink>
    </span>
  )
}
