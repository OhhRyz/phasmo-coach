import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
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
import { relativeDays } from '../engine/format'
import { appUrl, copyText, downloadJson, encodePayload } from '../engine/share'
import { sanitizeNotes } from '../store/schema'
import { useStore } from '../store/store'

type Style = CSSProperties & Record<`--${string}`, string | number>

export interface NotesPayload {
  kind: 'phasmo-coach/notes'
  from: string
  at: number
  notes: CoachNote[]
}

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const TILT = [-1.4, 1.1, -0.5, 1.6, -1, 0.7]

/** Une note trop longue pour un post-it : une page arrachée d'un cahier, écrite au stylo. */
export function TornPage({ meta, sign, rotate = 0, delay = 0, children }: { meta?: ReactNode; sign?: ReactNode; rotate?: number; delay?: number; children: ReactNode }) {
  return (
    <div className="torn settle" style={{ '--r': `${rotate}deg`, '--d': `${delay}s` } as Style}>
      <div className="torn-paper">
        {meta && <span className="torn-meta">{meta}</span>}
        {children}
        {sign && <span className="torn-sign">{sign}</span>}
      </div>
    </div>
  )
}

/** Le contenu d'une note du coach (titre, texte, question de révision), tel qu'il l'a écrit. */
export function NoteText({ note }: { note: CoachNote }) {
  return (
    <>
      <strong className="note-ttl">{note.title}</strong>
      {note.body && <span className="note-body pre">{note.body}</span>}
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

export function Notebook() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [ghost, setGhost] = useState('')
  const [editing, setEditing] = useState<CoachNote | null>(null)
  const [deleting, setDeleting] = useState<CoachNote | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.notes
      .filter((n) => !ghost || (ghost === 'general' ? !n.ghostId : n.ghostId === ghost))
      .filter((n) => !q || `${n.title} ${n.body} ${n.question ?? ''} ${n.answer ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
  }, [state.notes, query, ghost])

  const payload = (): NotesPayload => ({
    kind: 'phasmo-coach/notes',
    from: state.profile.name,
    at: Date.now(),
    notes: state.notes,
  })

  const share = async () => {
    setShareUrl(appUrl(`/importer?d=${await encodePayload(payload())}`))
  }

  const importFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text()) as Partial<NotesPayload>
      const notes = json.kind === 'phasmo-coach/notes' ? sanitizeNotes(json.notes) : []
      if (!notes.length) throw new Error('format')
      dispatch({ type: 'notes:import', notes })
      toast(`${notes.length} note${notes.length > 1 ? 's' : ''} importée${notes.length > 1 ? 's' : ''}`)
    } catch {
      toast('Fichier non reconnu')
    }
  }

  const coach = state.profile.role === 'coach' ? state.profile.name : state.profile.coachName
  const total = state.notes.length
  const inReview = state.notes.filter((n) => n.asCard).length
  const pinned = state.notes.filter((n) => n.pinned).length

  return (
    <>
      <Book className="carnet">
        {/* ===================== page de gauche : écrire ===================== */}
        <Page side="left" section="6" label="Écrire une note">
          <FileHead>
            <span>
              Carnet du coach{coach && <> · <b>{coach}</b></>}
            </span>
            <span>
              <b>{total}</b> note{total > 1 ? 's' : ''} · <b>{inReview}</b> en révision
            </span>
          </FileHead>

          <div className="entry carnet-entry">
            <h1 className="entry-date">
              {coach ? (
                <>
                  <em>Le carnet de</em>
                  {coach}
                </>
              ) : (
                <>
                  <em>Le carnet</em>du coach
                </>
              )}
            </h1>
            <p className="entry-line">
              Tout ce que le coach explique, au même endroit. Une note ajoutée à la révision reviendra d’elle-même au bon moment :
              plus besoin de la répéter.
            </p>
          </div>

          <NoteEditor />

          <section className="carnet-share" aria-labelledby="h-share">
            <h2 className="carnet-share-h" id="h-share">
              Partager et sauvegarder
            </h2>
            <p>
              Le lien emporte tout le carnet : l’autre appareil n’a qu’à l’ouvrir. Le fichier sert de copie de sécurité.
            </p>
            <div className="carnet-share-btns">
              <PaperButton onClick={share} disabled={!total} rotate={-1}>
                Partager par lien
              </PaperButton>
              <PaperButton
                disabled={!total}
                rotate={0.8}
                onClick={() => downloadJson(`phasmo-coach-notes-${new Date().toISOString().slice(0, 10)}.json`, payload())}
              >
                Exporter
              </PaperButton>
              <PaperButton onClick={() => fileRef.current?.click()} rotate={-0.4}>
                Importer un fichier
              </PaperButton>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </div>
          </section>
        </Page>

        {/* ===================== page de droite : les notes collées ===================== */}
        <Page side="right" section="6" label="Les notes du coach">
          <FileHead>
            <span>Notes collées</span>
            <span>Les plus récentes en haut</span>
          </FileHead>

          <section aria-labelledby="h-notes">
            <H
              id="h-notes"
              count={
                total
                  ? notes.length === total
                    ? `${total} note${total > 1 ? 's' : ''}${pinned ? ` · ${pinned} épinglée${pinned > 1 ? 's' : ''}` : ''}`
                    : `${notes.length} sur ${total}`
                  : undefined
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
                  <select className="select" value={ghost} onChange={(e) => setGhost(e.target.value)} aria-label="Filtrer par entité">
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

            {notes.length === 0 ? (
              <Empty title={total ? 'Aucune note ne correspond' : 'Le carnet est vide'}>
                {total ? (
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
                ) : (
                  <p>Écris le premier conseil : une astuce, une erreur à éviter, un test à retenir.</p>
                )}
              </Empty>
            ) : (
              <ol className="carnet-board">
                {notes.map((n, i) => {
                  const g = n.ghostId ? getGhost(n.ghostId) : undefined
                  const rs = state.cards[`n:${n.id}`]
                  const long = isLongNote(n)
                  const status = n.asCard
                    ? rs
                      ? rs.phase === 'review'
                        ? `en révision, revient ${relativeDays(rs.due)}`
                        : 'en révision, en cours d’apprentissage'
                      : 'en révision, pas encore révisée'
                    : 'pas en révision'
                  const meta = `${SHORT.format(n.createdAt)} · ${g ? g.name : 'Général'}`
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
                          <TornPage meta={meta} sign={sign} rotate={rotate * 0.4} delay={delay}>
                            <NoteText note={n} />
                          </TornPage>
                        ) : (
                          <Sticky meta={meta} sign={sign} rotate={rotate} delay={delay}>
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
                          <TypedLink onClick={() => dispatch({ type: 'note:upsert', note: { ...n, pinned: !n.pinned, updatedAt: Date.now() } })}>
                            {n.pinned ? 'Désépingler' : 'Épingler'}
                            <span className="sr-only"> « {n.title} »</span>
                          </TypedLink>
                          <span className="dot" aria-hidden>
                            ·
                          </span>
                          <TypedLink onClick={() => setEditing(n)}>
                            Modifier<span className="sr-only"> « {n.title} »</span>
                          </TypedLink>
                          <span className="dot" aria-hidden>
                            ·
                          </span>
                          <TypedLink onClick={() => setDeleting(n)}>
                            Supprimer<span className="sr-only"> « {n.title} »</span>
                          </TypedLink>
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </Page>
      </Book>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Modifier la note">
        {editing && <NoteEditor note={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Supprimer cette note ?"
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
        <p className="modal-text">« {deleting?.title} » et sa carte de révision seront supprimées de cet appareil.</p>
      </Modal>

      <Modal
        open={!!shareUrl}
        onClose={() => setShareUrl(null)}
        title="Partager le carnet"
        actions={
          <>
            <TypedLink onClick={() => setShareUrl(null)}>Fermer</TypedLink>
            <TapeButton
              arrow={false}
              onClick={async () => {
                if (shareUrl && (await copyText(shareUrl))) toast('Lien copié')
              }}
            >
              Copier le lien
            </TapeButton>
          </>
        }
      >
        <p className="modal-text">
          Envoie ce lien : en l’ouvrant, l’autre appareil pourra importer les {total} note{total > 1 ? 's' : ''}. Celles qui existent déjà
          sont mises à jour, rien n’est effacé. Les notes voyagent dans le lien lui-même : aucun serveur ne les garde.
        </p>
        <textarea className="textarea share-url" readOnly value={shareUrl ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="Lien de partage" />
      </Modal>
    </>
  )
}
