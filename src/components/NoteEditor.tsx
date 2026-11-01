import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { GHOSTS } from '../data'
import type { CoachNote } from '../engine/cards'
import { makesCard } from '../engine/notes'
import { newId, useStore } from '../store/store'
import { CheckLine, PaperButton, TapeButton, TypedLink } from './journal/Journal'
import { useToast } from './Toast'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Exemples des trois lignes « Mauvaise réponse », dans la suite de celui de la réponse attendue. */
const WRONG_EXAMPLES = ['ex. 90 secondes, comme les autres', 'ex. 180 secondes', 'ex. 30 secondes']

/** Le titre d'une note : celui qui a été écrit, sinon la première ligne du texte. Jamais un titre inventé. */
export function noteTitle(title: string, body: string): string {
  const t = title.trim()
  if (t) return t
  const line = body.trim().split('\n')[0].trim()
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line
}

/**
 * Écrire une note du carnet : une page de bloc-notes. La note est signée par la personne qui tient
 * ce carnet, seule ou à deux (le coach sur son appareil, la personne coachée sur le sien).
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
  // un titre tiré de la première ligne n'a pas été écrit : on le laisse vide pour qu'il suive le texte
  const [title, setTitle] = useState(note && note.title !== noteTitle('', note.body) ? note.title : '')
  const [body, setBody] = useState(note?.body ?? '')
  const [ghost, setGhost] = useState<string | null>(note?.ghostId ?? ghostId)
  const [asCard, setAsCard] = useState(note?.asCard ?? true)
  const [question, setQuestion] = useState(note?.question ?? '')
  // la question de révision est facultative : repliée tant qu'on ne la personnalise pas
  const [custom, setCustom] = useState(!!(note?.question || note?.answer || note?.wrong?.length))
  const [answer, setAnswer] = useState(note?.answer ?? '')
  // trois lignes « Mauvaise réponse », toujours là (les vides ne sont pas enregistrées)
  const [wrong, setWrong] = useState<string[]>(() => [0, 1, 2].map((i) => note?.wrong?.[i] ?? ''))
  const addRef = useRef<HTMLParagraphElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  // côté coach, la case part avec le partage : elle décide si l'élève reçoit la note en carte de révision
  const coach = state.profile.role === 'coach'
  const uid = useId()
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
    setWrong(['', '', ''])
    setAsCard(true)
    setCustom(false)
    setGhost(ghostId)
  }

  const empty = !title.trim() && !body.trim()
  const noBack = !body.trim() && !answer.trim()
  const wrongs = wrong.map((w) => w.trim()).filter(Boolean)

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
      // sans question, il n'y a pas de QCM : les mauvaises réponses ne servent à rien
      wrong: question.trim() && wrongs.length ? wrongs : undefined,
      author: state.profile.name.trim(),
      pinned: note?.pinned,
    }
    dispatch({ type: 'note:upsert', note: n })
    toast(note ? 'Note mise à jour' : makesCard(n) ? 'Note ajoutée à la révision' : 'Note enregistrée')
    if (!note) reset()
    if (compact && !note) fold()
    // note suivante : le curseur repart dans le titre du formulaire vidé (le bouton, lui, se désactive)
    else if (!note) titleRef.current?.focus()
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
    <TapeButton type="submit" disabled={empty} arrow={false} disabledHint="écris ta note pour l’enregistrer">
      {note ? 'Enregistrer' : 'Enregistrer la note'}
    </TapeButton>
  )

  return (
    <form className={`note-form${bare ? ' is-bare' : ''}`} onSubmit={submit} style={bare ? undefined : ({ '--r': note ? '0deg' : '-.4deg' } as Style)}>
      <label className="field">
        <span>Titre (facultatif)</span>
        <input
          ref={titleRef}
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
        <CheckLine
          checked={asCard}
          onChange={setAsCard}
          seed={`asCard-${note?.id ?? 'new'}`}
          hint={
            coach
              ? 'Ton élève la recevra comme une carte quand tu partageras tes notes (et elle te sera reposée aussi).'
              : 'Elle te sera reposée d’elle-même, juste avant que tu l’oublies.'
          }
        >
          {coach ? 'En faire une question de révision' : 'Me la reposer en révision'}
        </CheckLine>
        {asCard && noBack && !!title.trim() && <p className="pencil-note note-card-hint">écris un texte ou une réponse pour en faire une carte</p>}
      </div>
      {asCard && !custom && (
        <p className="note-custom">
          <TypedLink onClick={() => setCustom(true)}>Personnaliser la question de révision (facultatif)</TypedLink>
        </p>
      )}
      {asCard && custom && (
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
      {asCard && custom && !!question.trim() && (
        <div className="field note-wrong" role="group" aria-labelledby={`${uid}-wrong`}>
          <span id={`${uid}-wrong`}>Mauvaises réponses (facultatif)</span>
          {wrong.map((w, i) => (
            <input
              key={i}
              className="input"
              value={w}
              onChange={(e) => setWrong((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={WRONG_EXAMPLES[i]}
              aria-label={`Mauvaise réponse ${i + 1}`}
              maxLength={200}
            />
          ))}
          <small>Avec des mauvaises réponses, la note devient un QCM.</small>
          {wrongs.length > 0 && !answer.trim() && <p className="pencil-note">écris aussi la réponse attendue pour en faire un QCM</p>}
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
