import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MutableRefObject } from 'react'
import { GHOSTS } from '../data'
import { firstLineTitle, noteQuestion, type CoachNote } from '../engine/cards'
import { NNBSP } from '../engine/format'
import { keepNoteAsCard, makesCard, noteAsCard, skipsOwnReview } from '../engine/notes'
import { newId, useStore } from '../store/store'
import { CheckLine, PaperButton, TapeButton, TypedLink } from './journal/Journal'
import { useToast } from './Toast'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Exemples des trois lignes « Mauvaise réponse », dans la suite de celui de la réponse attendue. */
const WRONG_EXAMPLES = ['ex. 90 secondes, comme les autres', 'ex. 180 secondes', 'ex. 30 secondes']

/** Le titre d'une note : celui qui a été écrit, sinon la première ligne du texte. Jamais un titre inventé. */
export function noteTitle(title: string, body: string): string {
  return title.trim() || firstLineTitle(body)
}

/**
 * La ligne d'aide sous le titre : la règle du titre, telle qu'elle s'applique à la note en cours. Sans titre, la
 * première ligne en sert, et sert aussi de question en révision ; quand elle dit déjà la réponse (une phrase
 * chiffrée, une note d'une seule ligne : voir noteQuestion, `vague`), la note a besoin d'un titre pour devenir
 * une question, et l'aide dit pourquoi. Une seule ligne qui est une question (`askedLine`) : il lui manque la
 * réponse, dessous. `asCard` est faux aussi quand la question de la carte est écrite à part : c'est elle qui est
 * posée, pas la première ligne. L'aide ne promet jamais ce que l'enregistrement refuse.
 */
export function titleHelp(asCard: boolean, needsTitle: boolean, hasBody = true, askedLine = false): string {
  if (needsTitle) {
    if (!hasBody) return 'Écris un titre, il servira de question en révision.'
    if (askedLine) return `Ajoute la réponse sur une ligne en dessous, ou écris un titre${NNBSP}: il servira de question en révision.`
    return `Ta première ligne dit déjà la réponse${NNBSP}: écris un titre, il servira de question en révision.`
  }
  return asCard ? 'Sans titre, la première ligne de la note en sert, et sert aussi de question en révision.' : 'Sans titre, la première ligne de la note en sert.'
}

/** Une note d'une seule ligne qui est une question (« Combien de temps l'encens bloque-t-il un Démon ? ») : la réponse manque. */
export function onlyAQuestion(body: string): boolean {
  const [lead, ...more] = body.trim().split('\n')
  return !!lead.trim() && /\?$/u.test(lead.trim()) && !more.join('').trim()
}

/** Ce que contient le formulaire d'une note, pour savoir si quelque chose a été écrit ou changé depuis l'ouverture. */
export interface NoteDraft {
  title: string
  body: string
  ghost: string | null
  asCard: boolean
  question: string
  answer: string
  wrong: string[]
}

/** Quelque chose a été écrit ou changé : fermer le formulaire le perdrait (on demande d'abord). */
export function draftChanged(from: NoteDraft, to: NoteDraft): boolean {
  return (
    from.title !== to.title ||
    from.body !== to.body ||
    from.ghost !== to.ghost ||
    from.asCard !== to.asCard ||
    from.question !== to.question ||
    from.answer !== to.answer ||
    from.wrong.join('\n') !== to.wrong.join('\n')
  )
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
  closeRef,
}: {
  ghostId?: string | null
  note?: CoachNote
  compact?: boolean
  bare?: boolean
  /** curseur dans le titre à l'ouverture (nouvelle note seulement) */
  autoFocus?: boolean
  onDone?: () => void
  /** la fenêtre qui contient le formulaire passe par là pour se fermer (Échap, clic à côté) : on demande avant de perdre le texte */
  closeRef?: MutableRefObject<(() => void) | null>
}) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(!compact || !!note)
  // un titre tiré de la première ligne n'a pas été écrit : on le laisse vide pour qu'il suive le texte
  const [title, setTitle] = useState(note && note.title !== noteTitle('', note.body) ? note.title : '')
  const [body, setBody] = useState(note?.body ?? '')
  const [ghost, setGhost] = useState<string | null>(note?.ghostId ?? ghostId)
  // une nouvelle note part du choix laissé à la dernière note écrite dans ce rôle (voir noteAsCard)
  const keptAsCard = noteAsCard(state.settings, state.profile.role)
  const [asCard, setAsCard] = useState(note?.asCard ?? keptAsCard)
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
  // côté coach, ses notes partent chez l'élève sans revenir dans sa propre révision (réglage du profil)
  const ownReview = !coach || !!state.settings.reviewOwnNotes
  const uid = useId()
  const refocus = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const askRef = useRef<HTMLDivElement>(null)
  const backTo = useRef<HTMLElement | null>(null)
  // Échap ou « Annuler » sur un formulaire où l'on a écrit : on demande avant de tout perdre
  const [asking, setAsking] = useState(false)
  const draft: NoteDraft = { title, body, ghost, asCard, question, answer, wrong }
  const [opened, setOpened] = useState<NoteDraft>(draft)
  const changed = draftChanged(opened, draft)

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

  /** Vide le formulaire ; la case de révision reste comme on l'a laissée (`keep`), ou revient au dernier choix. */
  const reset = (keep = keptAsCard) => {
    setTitle('')
    setBody('')
    setQuestion('')
    setAnswer('')
    setWrong(['', '', ''])
    setAsCard(keep)
    setCustom(false)
    setGhost(ghostId)
    setAsking(false)
    setOpened({ title: '', body: '', ghost: ghostId, asCard: keep, question: '', answer: '', wrong: ['', '', ''] })
  }

  // la question posée : le curseur va sur « Continuer à écrire » (le choix sans perte)
  useEffect(() => {
    if (asking) askRef.current?.querySelector<HTMLElement>('.note-ask-keep')?.focus()
  }, [asking])

  const empty = !title.trim() && !body.trim()
  const noBack = !body.trim() && !answer.trim()
  const wrongs = wrong.map((w) => w.trim()).filter(Boolean)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (empty || needsTitle) return
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
    // la case reste comme on l'a laissée pour la note suivante, ici et à la prochaine visite (dans ce rôle)
    const kept = note ? null : keepNoteAsCard(state.settings, state.profile.role, asCard)
    if (kept) dispatch({ type: 'settings', settings: kept })
    toast(note ? 'Note mise à jour' : makesCard(n) && !skipsOwnReview(n, state.profile, state.settings) ? 'Note ajoutée à la révision' : 'Note enregistrée')
    if (!note) reset(asCard)
    if (compact && !note) fold()
    // note suivante : le curseur repart dans le titre du formulaire vidé (le bouton, lui, se désactive)
    else if (!note) titleRef.current?.focus()
    onDone?.()
  }

  /** Fermer sans enregistrer (ou, dans « Mes notes », vider le formulaire toujours ouvert). */
  const discard = () => {
    setAsking(false)
    if (note) return onDone?.()
    reset()
    if (compact) fold()
    else titleRef.current?.focus()
    onDone?.()
  }

  /** Échap, « Annuler » ou un clic à côté de la fenêtre : rien d'écrit, on ferme ; sinon on demande d'abord. */
  const cancel = () => {
    if (!changed) {
      if (note || compact) discard()
      return
    }
    backTo.current = document.activeElement instanceof HTMLElement && formRef.current?.contains(document.activeElement) ? document.activeElement : null
    setAsking(true)
  }

  const keepWriting = () => {
    setAsking(false)
    const el = backTo.current
    requestAnimationFrame(() => (el?.isConnected ? el : formRef.current?.querySelector<HTMLElement>('textarea'))?.focus())
  }

  // la fenêtre qui contient le formulaire (Échap, clic à côté) passe par la même question
  useEffect(() => {
    if (!closeRef) return
    closeRef.current = asking ? keepWriting : cancel
    return () => {
      closeRef.current = null
    }
  })

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
    // la fenêtre qui contient le formulaire ne se ferme pas d'elle-même : c'est le formulaire qui décide
    e.preventDefault()
    if (asking) keepWriting()
    else cancel()
  }

  const derived = asCard && !question.trim() && (body.trim() || answer.trim()) ? noteQuestion({ title, body, question, answer, ghostId: ghost, createdAt: note?.createdAt ?? Date.now() }, GHOSTS) : null
  const preview = derived?.front ?? ''
  // « Que retenir de la note du 1er novembre ? » ne dit pas ce qu'on demande : pour en faire une carte, un titre
  // (ou une question écrite) d'abord
  const needsTitle = !!derived?.vague
  const askedLine = needsTitle && onlyAQuestion(body)

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
    <TapeButton
      type="submit"
      disabled={empty || needsTitle}
      arrow={false}
      disabledHint={empty ? 'écris ta note pour l’enregistrer' : askedLine ? 'ajoute la réponse, ou un titre' : 'écris un titre pour l’enregistrer'}
    >
      {note ? 'Enregistrer' : 'Enregistrer la note'}
    </TapeButton>
  )

  return (
    <form
      ref={formRef}
      className={`note-form${bare ? ' is-bare' : ''}`}
      onSubmit={submit}
      onKeyDown={onKeyDown}
      style={bare ? undefined : ({ '--r': note ? '0deg' : '-.4deg' } as Style)}
    >
      <label className="field">
        {/* une carte qui ne dirait que « la note du 1er novembre » : le titre n’est plus facultatif (l’aide dessous dit pourquoi) */}
        <span>{needsTitle ? 'Titre' : 'Titre (facultatif)'}</span>
        <input
          ref={titleRef}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ex. Le piège du Démon et de l’encens"
          maxLength={120}
          autoFocus={autoFocus && !note}
        />
        {/* une question écrite à part : c'est elle qui est posée en révision, pas la première ligne */}
        <small>{titleHelp(asCard && !question.trim(), needsTitle, !!body.trim(), askedLine)}</small>
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
              ? ownReview
                ? 'Ton élève la recevra comme une carte quand tu partageras tes notes (et elle te sera reposée aussi).'
                : 'Ton élève la recevra comme une carte quand tu partageras tes notes. Elle ne revient pas dans ta propre révision (réglage du profil).'
              : 'Elle te sera reposée d’elle-même, juste avant que tu l’oublies.'
          }
        >
          {coach ? 'En faire une question de révision' : 'Me la reposer en révision'}
        </CheckLine>
        {asCard && noBack && !!title.trim() && <p className="pencil-note note-card-hint">écris un texte ou une réponse pour en faire une carte</p>}
        {/* seulement une question qui sera vraiment posée : sans titre, « Que retenir de la note du 1er novembre ? » ne l'est pas */}
        {preview && !needsTitle && (
          <p className="note-card-preview">
            <span className="typed-label">Question posée</span> {preview}
          </p>
        )}
      </div>
      {asCard && !custom && (
        <p className="note-custom">
          <TypedLink onClick={() => setCustom(true)}>Écrire toi-même la question et la réponse de la carte (facultatif)</TypedLink>
        </p>
      )}
      {asCard && custom && (
        <div className="note-qa-fields">
          <label className="field">
            <span>{coach ? 'Question posée à ton élève (facultatif)' : 'Question posée en révision (facultatif)'}</span>
            <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="ex. Combien de temps l’encens bloque-t-il un Démon ?" />
            <small>Laisse vide pour garder la question tirée de la note.</small>
          </label>
          <label className="field">
            <span>Bonne réponse (facultatif)</span>
            <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="ex. 60 secondes au lieu de 90" />
            <small>Laisse vide pour que le texte de la note serve de réponse.</small>
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
      {asking ? (
        <div className="note-ask" ref={askRef} role="group" aria-labelledby={`${uid}-ask`}>
          <p className="note-ask-q" id={`${uid}-ask`}>
            {note ? `Abandonner tes modifications${NNBSP}?` : `Abandonner cette note${NNBSP}?`}
            <small>{note ? 'Elles ne seront pas enregistrées.' : 'Ce que tu as écrit sera perdu.'}</small>
          </p>
          <div className={bare ? 'modal-actions note-actions' : 'row note-actions'}>
            <TypedLink onClick={keepWriting} className="note-ask-keep">
              {note ? 'Continuer à modifier' : 'Continuer à écrire'}
            </TypedLink>
            <TapeButton arrow={false} onClick={discard}>
              Abandonner
            </TapeButton>
          </div>
        </div>
      ) : bare ? (
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
