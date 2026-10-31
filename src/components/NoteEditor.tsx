import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { GHOSTS } from '../data'
import type { CoachNote } from '../engine/cards'
import { makesCard } from '../engine/notes'
import { newId, useStore } from '../store/store'
import { CheckLine, PaperButton, TapeButton, TypedLink } from './journal/Journal'
import { useToast } from './Toast'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Le titre d'une note : celui qui a été écrit, sinon la première ligne du texte. Jamais un titre inventé. */
export function noteTitle(title: string, body: string): string {
  const t = title.trim()
  if (t) return t
  const line = body.trim().split('\n')[0].trim()
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line
}

/**
 * Écrire une note du carnet : une page de bloc-notes. La note est signée par la personne qui tient
 * ce carnet (le coach sur son appareil, l'élève sur le sien).
 * `bare` : sans le papier ni le scotch, pour l'écrire dans une fenêtre qui est déjà une fiche.
 */
export function NoteEditor({
  ghostId = null,
  note,
  compact,
  bare,
  autoFocus = true,
  onDone,
}: {
  ghostId?: string | null
  note?: CoachNote
  compact?: boolean
  bare?: boolean
  /** curseur dans le titre à l'ouverture (nouvelle note seulement) */
  autoFocus?: boolean
  onDone?: () => void
}) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(!compact || !!note)
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [ghost, setGhost] = useState<string | null>(note?.ghostId ?? ghostId)
  const [asCard, setAsCard] = useState(note?.asCard ?? true)
  const [question, setQuestion] = useState(note?.question ?? '')
  const [answer, setAnswer] = useState(note?.answer ?? '')
  const addRef = useRef<HTMLParagraphElement>(null)
  const refocus = useRef(false)

  // le formulaire replié : le focus revient sur « + Ajouter une note » au lieu de tomber sur la page
  useEffect(() => {
    if (open || !refocus.current) return
    refocus.current = false
    addRef.current?.querySelector('button')?.focus()
  }, [open])

  const fold = () => {
    refocus.current = true
    setOpen(false)
  }

  const reset = () => {
    setTitle('')
    setBody('')
    setQuestion('')
    setAnswer('')
    setAsCard(true)
    setGhost(ghostId)
  }

  const empty = !title.trim() && !body.trim()
  const noBack = !body.trim() && !answer.trim()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (empty) return
    const now = Date.now()
    const n: CoachNote = {
      id: note?.id ?? newId(),
      createdAt: note?.createdAt ?? now,
      updatedAt: now,
      ghostId: ghost,
      title: noteTitle(title, body),
      body: body.trim(),
      asCard,
      question: question.trim() || undefined,
      answer: answer.trim() || undefined,
      author: state.profile.name.trim(),
      pinned: note?.pinned,
    }
    dispatch({ type: 'note:upsert', note: n })
    toast(note ? 'Note mise à jour' : makesCard(n) ? 'Note ajoutée à la révision' : 'Note enregistrée')
    if (!note) reset()
    if (compact && !note) fold()
    onDone?.()
  }

  const cancel = () => {
    if (!note) fold()
    onDone?.()
  }

  if (!open) {
    return (
      <p className="note-add" ref={addRef}>
        <PaperButton onClick={() => setOpen(true)} rotate={-1}>
          + Ajouter une note
        </PaperButton>
      </p>
    )
  }

  const submitBtn = (
    <TapeButton type="submit" disabled={empty} arrow={false}>
      {note ? 'Enregistrer' : 'Coller la note'}
    </TapeButton>
  )

  return (
    <form className={`note-form${bare ? ' is-bare' : ''}`} onSubmit={submit} style={bare ? undefined : ({ '--r': note ? '0deg' : '-.4deg' } as Style)}>
      <label className="field">
        <span>Titre (facultatif)</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ex. Le piège du Démon et de l’encens"
          maxLength={120}
          autoFocus={autoFocus && !note}
        />
        <small>Sans titre, la première ligne de la note en sert.</small>
      </label>
      <label className="field">
        <span>Entité concernée</span>
        <select className="select" value={ghost ?? ''} onChange={(e) => setGhost(e.target.value || null)}>
          <option value="">Général (aucune entité)</option>
          {GHOSTS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>La note</span>
        <textarea
          className="textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Le conseil, l’explication ou l’erreur à ne plus refaire…"
          maxLength={4000}
        />
      </label>
      <div className="note-card-check">
        <CheckLine checked={asCard} onChange={setAsCard} seed={`asCard-${note?.id ?? 'new'}`} hint="La note reviendra d’elle-même au bon moment, pour ne pas être oubliée.">
          Ajouter à la révision espacée
        </CheckLine>
        {asCard && noBack && !!title.trim() && <p className="pencil-note note-card-hint">écris un texte ou une réponse pour en faire une carte</p>}
      </div>
      {asCard && (
        <div className="note-qa-fields">
          <label className="field">
            <span>Question (facultatif)</span>
            <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="ex. Combien de temps l’encens bloque-t-il un Démon ?" />
            <small>Sinon, la carte demande de se souvenir du titre.</small>
          </label>
          <label className="field">
            <span>Réponse attendue (facultatif)</span>
            <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="ex. 60 secondes au lieu de 90" />
            <small>Sinon, le texte de la note sert de réponse.</small>
          </label>
        </div>
      )}
      {bare ? (
        <div className="modal-actions note-actions">
          <TypedLink onClick={cancel}>Annuler</TypedLink>
          {submitBtn}
        </div>
      ) : (
        <div className="row note-actions">
          {submitBtn}
          {(compact || note) && <TypedLink onClick={cancel}>Annuler</TypedLink>}
        </div>
      )}
    </form>
  )
}
