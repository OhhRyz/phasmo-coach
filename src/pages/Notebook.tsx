import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  Consigne,
  FileHead,
  H,
  Notebook as Book,
  Page,
  PaperButton,
  Polaroid,
  Sticky,
  Tape,
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { NoteEditor } from '../components/NoteEditor'
import { useToast } from '../components/Toast'
import { Empty, Modal } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import type { CoachNote } from '../engine/cards'
import { fr, NNBSP, plural, relativeDays, safeDate, validTime } from '../engine/format'
import { coachNameOf, isCoachNote, isOwnNote, makesCard, sortNotes } from '../engine/notes'
import { downloadJson, importCounts, importSummary, readNotesPayload, type NotesPayload } from '../engine/share'
import type { CardState } from '../engine/srs'
import { useStore } from '../store/store'

export type { NotesPayload } from '../engine/share'

type Style = CSSProperties & Record<`--${string}`, string | number>
type Hand = 'coach' | 'mine'

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const TILT = [-1.4, 1.1, -0.5, 1.6, -1, 0.7]

/**
 * Une note trop longue pour un post-it : une page arrachée d'un cahier. Au stylo rouge seulement si
 * c'est une vraie note du coach (`hand="coach"`), à l'encre sinon.
 */
export function TornPage({
  meta,
  sign,
  rotate = 0,
  delay = 0,
  hand = 'coach',
  children,
}: {
  meta?: ReactNode
  sign?: ReactNode
  rotate?: number
  delay?: number
  hand?: Hand
  children: ReactNode
}) {
  return (
    <div className={`torn torn--${hand} settle`} style={{ '--r': `${rotate}deg`, '--d': `${delay}s` } as Style}>
      <div className="torn-paper">
        {meta && <span className="torn-meta">{meta}</span>}
        {children}
        {sign && <span className="torn-sign">{sign}</span>}
      </div>
    </div>
  )
}

/** Le contenu d'une note (titre, texte, question de révision), tel qu'il a été écrit. */
export function NoteText({ note }: { note: CoachNote }) {
  // sans titre écrit, le titre est la première ligne du texte : on ne l'écrit pas deux fois
  const [first, ...rest] = note.body.split('\n')
  const lead = first.trim()
  const fromBody = !!lead && (lead === note.title || (note.title.endsWith('…') && lead.startsWith(note.title.slice(0, -1).trimEnd())))
  const title = fromBody ? lead : note.title
  const body = fromBody ? rest.join('\n').trim() : note.body
  return (
    <>
      <strong className="note-ttl">{title}</strong>
      {body && <span className="note-body pre">{body}</span>}
      {note.asCard && note.question && (
        <span className="note-qa">
          <span>
            <span className="note-q">Question</span> {note.question}
          </span>
          {note.answer && (
            <span>
              <span className="note-q">Réponse</span> {note.answer}
            </span>
          )}
        </span>
      )}
    </>
  )
}

/** Post-it pour une note courte, page arrachée pour une note longue. */
export function isLongNote(n: CoachNote): boolean {
  return n.body.length + (n.question?.length ?? 0) + (n.answer?.length ?? 0) > 150
}

/** L'état de la note dans la révision, au crayon sous le papier. */
function noteStatus(n: CoachNote, rs: CardState | undefined, now: number): string {
  if (!n.asCard) return 'pas en révision'
  if (!makesCard(n)) return fr('pas en révision : il manque un texte ou une réponse')
  if (!rs) return 'en révision, pas encore révisée'
  const due = validTime(rs.due)
  if (rs.phase === 'review' && due != null) return due <= now ? 'en révision, à revoir aujourd’hui' : `en révision, revient ${relativeDays(due)}`
  return 'en révision, en cours d’apprentissage'
}

/**
 * #/carnet : le carnet de chacun, seul·e ou à deux. Les anciens liens internes (?coller=1, ?partager=1)
 * ouvrent la même chose sur la page « Coaching », où se font désormais les envois et les liens reçus.
 */
export function Notebook() {
  const [params] = useSearchParams()
  if (params.get('coller') === '1') return <Navigate to="/coaching?coller=1" replace />
  if (params.get('partager') === '1') return <Navigate to="/coaching?partager=1" replace />
  return <Carnet />
}

/** État de navigation : des notes viennent d'arriver, le carnet s'ouvre sur elles plutôt que sur l'éditeur. */
export const SHOW_NOTES = { carnet: 'notes' } as const

function Carnet() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const location = useLocation()
  const [arrived] = useState(() => (location.state as typeof SHOW_NOTES | null)?.carnet === 'notes')
  const profile = state.profile
  const role = profile.role
  const isStudent = role === 'student'
  const coach = coachNameOf(profile)
  const holder = profile.name.trim()

  const [query, setQuery] = useState('')
  const [ghost, setGhost] = useState('')
  const [editing, setEditing] = useState<CoachNote | null>(null)
  const [deleting, setDeleting] = useState<CoachNote | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // notes reçues : on descend jusqu'à elles (sur téléphone, elles sont sous l'éditeur) et le focus suit
  useEffect(() => {
    if (!arrived) return
    const raf = requestAnimationFrame(() => {
      const h = document.getElementById('h-notes')
      if (!h) return
      h.setAttribute('tabindex', '-1')
      h.focus({ preventScroll: true })
      h.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(raf)
  }, [arrived])

  /* ---------- fichier ---------- */
  const filePayload = (): NotesPayload => ({ kind: 'phasmo-coach/notes', from: holder, at: Date.now(), notes: state.notes })

  const importFile = async (file: File) => {
    try {
      const p = readNotesPayload(JSON.parse(await file.text()))
      if (!p) throw new Error('format')
      const { fresh, updated } = importCounts(state.notes, p.notes)
      dispatch({ type: 'notes:import', notes: p.notes, from: p.from })
      toast(importSummary(fresh, updated))
    } catch {
      toast('Fichier non reconnu')
    }
  }

  /* ---------- les notes ---------- */
  const knownGhost = ghost === 'general' || state.notes.some((n) => n.ghostId === ghost)
  const activeGhost = ghost && knownGhost ? ghost : '' // l'entité filtrée n'a plus de note : on revient à toutes
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortNotes(
      state.notes
        .filter((n) => !activeGhost || (activeGhost === 'general' ? !n.ghostId : n.ghostId === activeGhost))
        .filter((n) => !q || `${n.title} ${n.body} ${n.question ?? ''} ${n.answer ?? ''}`.toLowerCase().includes(q)),
    )
  }, [state.notes, query, activeGhost])

  // coaché·e : « De Ryz » (au stylo rouge) puis « Mes notes » ; sinon ses notes ; puis les notes d'autres carnets
  const groups = useMemo(() => {
    const out: { key: string; title: string; notes: CoachNote[]; author?: string }[] = []
    const mine = (n: CoachNote) => isOwnNote(n, profile) || !n.author
    if (isStudent) {
      out.push({ key: 'coach', title: coach ? `De ${coach}` : 'Du coach', notes: shown.filter((n) => isCoachNote(n, profile)) })
      out.push({ key: 'mine', title: 'Mes notes', notes: shown.filter((n) => !isCoachNote(n, profile) && mine(n)) })
    } else out.push({ key: 'mine', title: 'Mes notes', notes: shown.filter((n) => isCoachNote(n, profile) || mine(n)) })
    const others = new Map<string, CoachNote[]>()
    for (const n of shown) {
      if (isCoachNote(n, profile) || mine(n)) continue
      others.set(n.author, [...(others.get(n.author) ?? []), n])
    }
    for (const [author, notes] of others) out.push({ key: `from-${author}`, title: `De ${author}`, notes, author })
    return out
  }, [shown, profile, isStudent, coach])

  const total = state.notes.length
  const inReview = state.notes.filter(makesCard).length
  const pinned = state.notes.filter((n) => n.pinned).length
  const filtering = !!query.trim() || !!activeGhost
  const now = Date.now()
  const coachLabel = coach || 'ton coach'
  const lead =
    'Tes notes au même endroit : une astuce, une erreur à ne plus refaire, un test à retenir. Ajoutée à la révision, une note revient d’elle-même au bon moment.' +
    (isStudent ? ` Les notes de ${coachLabel} arrivent ici aussi, au stylo rouge.` : role === 'coach' ? ' Ton élève les reçoit quand tu les partages.' : '')

  let index = 0
  const renderNote = (n: CoachNote) => {
    const i = index++
    const g = n.ghostId ? getGhost(n.ghostId) : undefined
    const hand: Hand = isCoachNote(n, profile) ? 'coach' : 'mine'
    const canEdit = isOwnNote(n, profile) || !n.author
    const long = isLongNote(n)
    const status = noteStatus(n, state.cards[`n:${n.id}`], now)
    const meta = `${safeDate(SHORT, n.createdAt)} · ${g ? g.name : 'Général'}`
    const sign = n.author ? `— ${n.author}` : undefined
    const rotate = TILT[i % TILT.length]
    const delay = Math.min(0.1 + i * 0.08, 0.6)
    const named = (
      <span className="sr-only">
        {' '}
        «{NNBSP}
        {n.title}
        {NNBSP}»
      </span>
    )
    return (
      <li key={n.id} className={`carnet-note ${long ? 'is-torn' : 'is-sticky'}${n.pinned ? ' is-pinned' : ''}${g ? ' has-photo' : ''}`}>
        <div className="carnet-slot">
          {n.pinned && (
            <>
              <Tape />
              <span className="sr-only">Note épinglée.</span>
            </>
          )}
          {long ? (
            <TornPage meta={meta} sign={sign} rotate={rotate * 0.4} delay={delay} hand={hand}>
              <NoteText note={n} />
            </TornPage>
          ) : (
            <Sticky meta={meta} sign={sign} rotate={rotate} delay={delay} hand={hand}>
              <NoteText note={n} />
            </Sticky>
          )}
        </div>
        {g && <Polaroid ghostId={g.id} to={`/codex/${g.id}`} caption={g.name} rotate={i % 2 ? -5 : 4} delay={delay + 0.15} />}
        <div className="carnet-under">
          <span className="pencil-note carnet-status">
            {n.pinned && 'épinglée · '}
            {status}
          </span>
          <span className="carnet-actions">
            <TypedLink onClick={() => dispatch({ type: 'note:upsert', note: { ...n, pinned: !n.pinned } })}>
              {n.pinned ? 'Désépingler' : 'Épingler'}
              {named}
            </TypedLink>
            {canEdit && (
              <>
                <span className="dot" aria-hidden>
                  ·
                </span>
                <TypedLink onClick={() => setEditing(n)}>
                  Modifier
                  {named}
                </TypedLink>
              </>
            )}
            <span className="dot" aria-hidden>
              ·
            </span>
            <TypedLink onClick={() => setDeleting(n)}>
              Supprimer
              {named}
            </TypedLink>
          </span>
        </div>
      </li>
    )
  }

  return (
    <>
      <Book className="carnet">
        {/* ===================== page de gauche : écrire ===================== */}
        <Page side="left" section="6" label="Écrire une note">
          <FileHead>
            <span>
              <b>Mes notes</b>
            </span>
            <span>
              {total === 0 ? (
                'aucune note'
              ) : (
                <>
                  <b>{total}</b> note{total > 1 ? 's' : ''} · {inReview ? <><b>{inReview}</b> en révision</> : 'aucune en révision'}
                </>
              )}
            </span>
          </FileHead>

          <div className="entry carnet-entry">
            <h1 className="entry-date">
              {holder ? (
                <>
                  <em>Les notes de</em>
                  {holder}
                </>
              ) : (
                <>
                  <em>Mes</em>notes
                </>
              )}
            </h1>
            <p className="entry-line">{fr(lead)}</p>
          </div>

          <Consigne className="carnet-consigne">
            {fr('écris une astuce ou une erreur à ne plus refaire, puis enregistre-la ; avec la case de révision cochée, elle te sera reposée d’elle-même')}
          </Consigne>
          <NoteEditor autoFocus={!arrived} />

          <section className="carnet-share" aria-labelledby="h-share">
            <h2 className="carnet-share-h" id="h-share">
              Sauvegarder
            </h2>
            <p>{fr('Un fichier avec toutes tes notes, en copie de sécurité ou pour les passer sur un autre appareil.')}</p>
            <div className="carnet-share-btns">
              <PaperButton
                disabled={!total}
                rotate={0.8}
                onClick={() => downloadJson(`phasmo-coach-notes-${new Date().toISOString().slice(0, 10)}.json`, filePayload())}
              >
                Exporter
              </PaperButton>
              <PaperButton onClick={() => fileRef.current?.click()} rotate={-0.4}>
                Importer un fichier
              </PaperButton>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = '' // le même fichier pourra être choisi à nouveau
                  if (f) void importFile(f)
                }}
              />
            </div>
            {!total && <p className="pencil-note carnet-export-hint">{fr('rien à exporter : aucune note pour l’instant')}</p>}
            <p className="carnet-coaching">
              <TypedLink to="/coaching">Partager ou recevoir des notes</TypedLink>
            </p>
          </section>
        </Page>

        {/* ===================== page de droite : les notes collées ===================== */}
        <Page side="right" section="6" label="Les notes">
          <FileHead>
            <span>Notes collées</span>
            <span>Épinglées d’abord, puis les plus récentes</span>
          </FileHead>

          <section aria-labelledby="h-notes">
            <H
              id="h-notes"
              count={
                total
                  ? shown.length === total
                    ? `${plural(total, 'note', 'notes')}${pinned ? ` · ${pinned} épinglée${pinned > 1 ? 's' : ''}` : ''}`
                    : `${shown.length} sur ${total}`
                  : 'aucune note'
              }
            >
              Les notes
            </H>

            {total > 0 && (
              <div className="carnet-find" role="search">
                <label className="carnet-q">
                  <span className="typed-label">Chercher</span>
                  <input
                    className="input"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="un mot, un conseil…"
                    aria-label="Chercher dans les notes"
                  />
                </label>
                <label className="carnet-g">
                  <span className="typed-label">Filtrer</span>
                  <select className="select" value={activeGhost} onChange={(e) => setGhost(e.target.value)} aria-label="Filtrer par entité">
                    <option value="">Toutes les notes ({total})</option>
                    <option value="general">Générales</option>
                    {GHOSTS.filter((g) => state.notes.some((n) => n.ghostId === g.id)).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {total === 0 ? (
              <Empty title="Aucune note pour l’instant">
                <p>
                  {fr(
                    isStudent
                      ? `Quand ${coachLabel} t’envoie un lien, ouvre-le (ou colle-le dans la page « Coaching ») : ses notes arriveront ici. Tu peux aussi écrire les tiennes.`
                      : 'Écris la première note : une astuce, une erreur à éviter, un test à retenir.',
                  )}
                </p>
              </Empty>
            ) : shown.length === 0 ? (
              <Empty title="Aucune note ne correspond">
                <p>
                  <TypedLink
                    onClick={() => {
                      setQuery('')
                      setGhost('')
                    }}
                  >
                    Revoir toutes les notes
                  </TypedLink>
                </p>
              </Empty>
            ) : (
              groups
                .filter((grp) => grp.notes.length || (!filtering && grp.key === 'coach'))
                .map((grp) => (
                  <section key={grp.key} className="carnet-group" aria-labelledby={`h-${grp.key}`}>
                    <h3 className="carnet-group-h" id={`h-${grp.key}`} tabIndex={-1}>
                      <span>{grp.title}</span>
                      <span className="h-count">{grp.notes.length ? plural(grp.notes.length, 'note', 'notes') : 'aucune note'}</span>
                    </h3>
                    {grp.author && role !== 'coach' && (
                      <p className="pencil-note carnet-group-coach">
                        {fr(
                          coach
                            ? `Ton coach est noté « ${coach} ». Si ces notes viennent de lui, dis-le : elles passeront au stylo rouge.`
                            : 'Ton coach n’est pas encore noté. Si ces notes viennent de lui, dis-le : elles passeront au stylo rouge.',
                        )}{' '}
                        <PaperButton
                          onClick={() => {
                            // seul·e jusqu'ici : la personne passe en « coaché·e »
                            dispatch({ type: 'profile', profile: { coachName: grp.author!, role: 'student' } })
                            // le groupe devient « De … » du coach : le focus suit
                            requestAnimationFrame(() => document.getElementById('h-coach')?.focus())
                          }}
                        >
                          {`${grp.author} est mon coach`}
                        </PaperButton>
                      </p>
                    )}
                    {grp.notes.length ? (
                      <ol className="carnet-board">{grp.notes.map(renderNote)}</ol>
                    ) : (
                      <p className="pencil-note carnet-group-empty">
                        {fr(`rien de ${coachLabel} pour l’instant : ses notes arrivent par lien, à ouvrir ou à coller dans la page « Coaching »`)}
                      </p>
                    )}
                  </section>
                ))
            )}
          </section>
        </Page>
      </Book>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Modifier la note">
        {editing && <NoteEditor note={editing} bare onDone={() => setEditing(null)} />}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={'Supprimer cette note\u202f?'}
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
        </p>
      </Modal>

    </>
  )
}
