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
  TypedLink,
} from '../components/journal/Journal'
import { NoteActionLinks, NoteName, useNoteActions } from '../components/NoteActions'
import { NoteEditor } from '../components/NoteEditor'
import { useToast } from '../components/Toast'
import { Empty } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import type { CoachNote } from '../engine/cards'
import { fr, plural, relativeDays, safeDate, validTime } from '../engine/format'
import { coachNameOf, isCoachNote, isOwnNote, makesCard, sortNotes } from '../engine/notes'
import { downloadJson, importCounts, importSummary, isNotesFile, readNotesPayload, type NotesPayload } from '../engine/share'
import type { CardState } from '../engine/srs'
import { notesFileName } from '../engine/transfer'
import { readBackup } from '../store/schema'
import { useStore } from '../store/store'
import { ExportedLine } from '../components/Backup'

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
  const [params, setParams] = useSearchParams()
  const [arrived] = useState(() => (location.state as typeof SHOW_NOTES | null)?.carnet === 'notes')
  const profile = state.profile
  const role = profile.role
  const isStudent = role === 'student'
  const coach = coachNameOf(profile)
  const holder = profile.name.trim()

  const [query, setQuery] = useState('')
  const [ghost, setGhost] = useState('')
  // modifier, supprimer (avec confirmation) : les mêmes fenêtres que sur la fiche d'une entité
  const noteActions = useNoteActions()
  const fileRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLElement>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [fileError, setFileError] = useState<'backup' | 'empty' | 'unknown' | null>(null)
  // lien d'une autre page (?sauvegarde=1 : exporter, ?sauvegarde=importer) : on arrive sur le bouton, surligné
  const [asked, setAsked] = useState<'export' | 'import' | null>(null)

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

  useEffect(() => {
    const v = params.get('sauvegarde')
    if (v !== '1' && v !== 'importer') return
    setAsked(v === 'importer' ? 'import' : 'export')
    setParams({}, { replace: true })
  }, [params]) // seul le paramètre du lien déclenche l'arrivée
  useEffect(() => {
    if (!asked) return
    const raf = requestAnimationFrame(() => {
      const box = saveRef.current
      if (!box) return
      box.scrollIntoView({ block: 'center' })
      box.querySelector<HTMLElement>('.backup-export')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [asked])

  /* ---------- fichier ---------- */
  const filePayload = (): NotesPayload => ({ kind: 'phasmo-coach/notes', from: holder, at: Date.now(), notes: state.notes })

  const exportFile = () => {
    const name = notesFileName()
    downloadJson(name, filePayload())
    setExported(name)
    toast(fr(`Notes exportées : ${name}, dans tes téléchargements`))
  }

  const importFile = async (file: File) => {
    let raw: unknown = null
    try {
      raw = JSON.parse(await file.text())
    } catch {
      /* pas un fichier du carnet */
    }
    const p = readNotesPayload(raw)
    if (!p) return setFileError(readBackup(raw) ? 'backup' : isNotesFile(raw) ? 'empty' : 'unknown')
    setFileError(null)
    const { fresh, updated } = importCounts(state.notes, p.notes)
    dispatch({ type: 'notes:import', notes: p.notes, from: p.from })
    toast(importSummary(fresh, updated))
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
  // rien à exporter (bouton grisé) : on arrive sur le bouton d'import
  const landOn = asked === 'export' && !total ? 'import' : asked
  const inReview = state.notes.filter(makesCard).length
  const pinned = state.notes.filter((n) => n.pinned).length
  const filtering = !!query.trim() || !!activeGhost
  const visibleGroups = groups.filter((grp) => grp.notes.length || (!filtering && grp.key === 'coach'))
  const single = visibleGroups.length === 1
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
    const long = isLongNote(n)
    const status = noteStatus(n, state.cards[`n:${n.id}`], now)
    const meta = `${safeDate(SHORT, n.createdAt)} · ${g ? g.name : 'Général'}`
    const sign = n.author ? `— ${n.author}` : undefined
    const rotate = TILT[i % TILT.length]
    const delay = Math.min(0.1 + i * 0.08, 0.6)
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
          <NoteActionLinks
            note={n}
            actions={noteActions}
            before={
              <TypedLink onClick={() => dispatch({ type: 'note:upsert', note: { ...n, pinned: !n.pinned } })}>
                {n.pinned ? 'Désépingler' : 'Épingler'}
                <NoteName note={n} />
              </TypedLink>
            }
          />
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
            {fr(
              role === 'coach'
                ? 'écris une astuce ou une erreur à ne plus refaire, puis enregistre-la ; avec la case de révision cochée, ton élève la recevra comme une carte quand tu partageras tes notes'
                : 'écris une astuce ou une erreur à ne plus refaire, puis enregistre-la ; avec la case de révision cochée, elle te sera reposée d’elle-même',
            )}
          </Consigne>
          <NoteEditor autoFocus={!arrived} />

          <section className={`carnet-share${asked ? ' is-asked' : ''}`} aria-labelledby="h-share" id="sauvegarde" ref={saveRef}>
            <h2 className="carnet-share-h" id="h-share">
              <span className="pocket-hl">Sauvegarder mes notes</span>
            </h2>
            <p>
              {fr('Un fichier avec tes notes seulement, sans ta progression : en copie de sécurité, ou pour les passer sur un autre appareil. Pour tout le carnet, progression comprise, il y a la')}{' '}
              <TypedLink to="/profil?sauvegarde=1">sauvegarde complète du profil</TypedLink>.
            </p>
            <div className="carnet-share-btns">
              <PaperButton disabled={!total} rotate={0.8} onClick={exportFile} className={landOn === 'export' ? 'backup-export' : undefined}>
                Exporter mes notes
              </PaperButton>
              <PaperButton
                onClick={() => {
                  setFileError(null)
                  fileRef.current?.click()
                }}
                rotate={-0.4}
                className={landOn === 'import' ? 'backup-export' : undefined}
              >
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
            <ExportedLine name={exported} />
            {fileError && (
              <div className="pencil-note backup-error" role="alert">
                {fileError === 'backup' ? (
                  <>
                    <p>{fr('Ce fichier « phasmo-coach-sauvegarde-… » est une sauvegarde complète : elle s’importe depuis le profil, et remplace tout le carnet.')}</p>
                    <TypedLink to="/profil?sauvegarde=importer">Aller à la sauvegarde complète</TypedLink>
                  </>
                ) : fileError === 'empty' ? (
                  <p>{fr('Ce fichier de notes ne contient aucune note lisible : rien n’a été ajouté.')}</p>
                ) : (
                  <p>
                    {fr(
                      'Fichier non reconnu. Il faut un fichier « phasmo-coach-notes-… .json » : il se crée avec « Exporter mes notes », ici, dans « Mes notes » (le tien, ou celui de ton coach).',
                    )}
                  </p>
                )}
              </div>
            )}
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
              visibleGroups.map((grp) => (
                  <section key={grp.key} className="carnet-group" aria-labelledby={single ? undefined : `h-${grp.key}`}>
                    {/* un seul groupe : le titre « Les notes » et son compte suffisent */}
                    {!single && (
                      <h3 className="carnet-group-h" id={`h-${grp.key}`} tabIndex={-1}>
                        <span>{grp.title}</span>
                        <span className="h-count">{grp.notes.length ? plural(grp.notes.length, 'note', 'notes') : 'aucune note'}</span>
                      </h3>
                    )}
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

      {noteActions.modals}

    </>
  )
}
