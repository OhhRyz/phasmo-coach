import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { Empty, Modal, Seg } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import type { CoachNote } from '../engine/cards'
import { platform } from '../engine/device'
import { fr, NNBSP, num, plural, relativeDays, safeDate, validTime } from '../engine/format'
import { coachNameOf, isCoachNote, isOwnNote, makesCard, sortNotes } from '../engine/notes'
import {
  appUrl,
  canShareNatively,
  copyText,
  decodePayload,
  downloadJson,
  encodePayload,
  importCounts,
  LONG_LINK,
  notesToShare,
  parseShareInput,
  readNotesPayload,
  readReportPayload,
  shareNatively,
  type NotesPayload,
} from '../engine/share'
import type { CardState } from '../engine/srs'
import { useStore } from '../store/store'

export type { NotesPayload } from '../engine/share'

type Style = CSSProperties & Record<`--${string}`, string | number>
type Hand = 'coach' | 'mine'

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })
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

/** Ce qu'un carnet reçu a changé, en une phrase (toast). */
export function importSummary(fresh: number, updated: number): string {
  if (!fresh && !updated) return 'Tout est déjà dans ton carnet'
  const parts: string[] = []
  if (fresh) parts.push(fresh > 1 ? `${fresh} nouvelles notes` : '1 nouvelle note')
  if (updated) parts.push(fresh ? plural(updated, 'mise à jour', 'mises à jour') : updated > 1 ? `${updated} notes mises à jour` : '1 note mise à jour')
  return `${parts.join(' et ')} dans ton carnet`
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
 * Le lien à envoyer : sélectionnable, copiable, envoyable par la feuille de partage du téléphone.
 * Si la copie échoue, le lien est sélectionné pour être copié à la main. `onUsed` : le lien est parti.
 */
export function useShareLink(url: string | null, onUsed?: () => void) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()
  const used = useRef(onUsed)
  used.current = onUsed
  const select = () => {
    const t = ref.current
    if (!t) return
    t.focus()
    t.setSelectionRange(0, t.value.length)
  }
  const copy = async () => {
    if (!url) return
    if (await copyText(url)) {
      toast('Lien copié')
      used.current?.()
    } else {
      select()
      toast(fr('Copie impossible : le lien est sélectionné, copie-le à la main'))
    }
  }
  const send = async () => {
    if (!url) return
    const r = await shareNatively(url)
    if (r === 'shared') used.current?.()
    else if (r === 'failed') await copy()
  }
  return { ref, copy, send, select, canSend: canShareNatively(), onCopy: () => used.current?.() }
}

/** Le lien lui-même, et l'avertissement au crayon s'il est trop long pour un message Discord. */
export function ShareUrl({ link, url, label }: { link: ReturnType<typeof useShareLink>; url: string | null; label: string }) {
  return (
    <>
      <textarea
        ref={link.ref}
        className="textarea share-url"
        readOnly
        value={url ?? ''}
        onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
        onCopy={link.onCopy}
        aria-label={label}
      />
      {url && url.length > LONG_LINK && (
        <p className="pencil-note share-long" role="note">
          {fr(`lien de ${num(url.length)} caractères : un message Discord n’en garde que ${num(2000)}. Envoie seulement les nouvelles notes, ou passe par le fichier.`)}
        </p>
      )}
    </>
  )
}

export function Notebook() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const profile = state.profile
  const isCoach = profile.role === 'coach'
  const coach = coachNameOf(profile)
  const holder = profile.name.trim()
  const coachCount = useMemo(() => (isCoach ? 0 : state.notes.filter((n) => isCoachNote(n, profile)).length), [state.notes, profile, isCoach])

  const [query, setQuery] = useState('')
  const [ghost, setGhost] = useState('')
  const [editing, setEditing] = useState<CoachNote | null>(null)
  const [deleting, setDeleting] = useState<CoachNote | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* ---------- coller un lien reçu ---------- */
  const [wantPaste] = useState(() => params.get('coller') === '1')
  const [pasteOpen, setPasteOpen] = useState(() => wantPaste || (!isCoach && coachCount === 0))
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pasteBusy, setPasteBusy] = useState(false)
  const pasteRef = useRef<HTMLInputElement>(null)
  const reopenRef = useRef<HTMLParagraphElement>(null)
  const focusPaste = useRef(wantPaste)
  const focusReopen = useRef(false)

  // ouvert : le curseur dans le champ si on l'a demandé ; replié : le focus revient sur « Coller un lien reçu »
  useEffect(() => {
    if (pasteOpen && focusPaste.current) {
      focusPaste.current = false
      pasteRef.current?.focus()
    }
    if (!pasteOpen && focusReopen.current) {
      focusReopen.current = false
      reopenRef.current?.querySelector('button')?.focus()
    }
  }, [pasteOpen])

  const foldPaste = () => {
    focusReopen.current = true
    setPasteOpen(false)
    setPasteError(null)
  }

  const paste = async (e: FormEvent) => {
    e.preventDefault()
    const bad = fr('Ce lien n’est pas reconnu : copie-le en entier, depuis « https » jusqu’à la fin.')
    const input = parseShareInput(pasteText)
    if (!input) return setPasteError(bad)
    if (input.kind === 'report') return navigate(`/rapport?d=${input.d}`)
    setPasteBusy(true)
    let raw: unknown = null
    try {
      raw = await decodePayload<unknown>(input.d)
    } catch {
      /* lien abîmé */
    }
    setPasteBusy(false)
    if (readReportPayload(raw)) return navigate(`/rapport?d=${input.d}`)
    const p = readNotesPayload(raw)
    if (!p) return setPasteError(bad)
    const { fresh, updated } = importCounts(state.notes, p.notes)
    dispatch({ type: 'notes:import', notes: p.notes })
    toast(importSummary(fresh, updated))
    setPasteText('')
    foldPaste()
  }

  /* ---------- partager ---------- */
  const own = useMemo(() => notesToShare(state.notes, profile, undefined, true), [state.notes, profile])
  const [sharing, setSharing] = useState<{ since: number | undefined } | null>(null)
  const [shareAll, setShareAll] = useState(false)
  const [share, setShare] = useState<{ url: string; at: number; count: number } | null>(null)

  const openShare = () => {
    const since = validTime(state.settings.lastSharedAt) ?? undefined
    setShareAll(since == null || notesToShare(state.notes, profile, since).length === 0)
    setShare(null)
    setSharing({ since })
  }

  const toSend = useMemo(
    () => (sharing ? notesToShare(state.notes, profile, sharing.since, shareAll) : []),
    [sharing, shareAll, state.notes, profile],
  )
  const freshCount = useMemo(() => (sharing ? notesToShare(state.notes, profile, sharing.since).length : 0), [sharing, state.notes, profile])

  useEffect(() => {
    if (!sharing || !toSend.length) {
      setShare(null)
      return
    }
    let current = true
    const at = Date.now()
    const payload: NotesPayload = { kind: 'phasmo-coach/notes', from: holder, at, notes: toSend }
    void encodePayload(payload).then((d) => current && setShare({ url: appUrl(`/importer?d=${d}`), at, count: toSend.length }))
    return () => {
      current = false
    }
  }, [sharing, toSend, holder])

  // le lien est parti : la prochaine fois, seules les notes écrites ou modifiées depuis seront proposées
  const link = useShareLink(share?.url ?? null, () => share && dispatch({ type: 'settings', settings: { lastSharedAt: share.at } }))

  // liens internes : ?partager=1 ouvre directement l'envoi, ?coller=1 le champ « Coller un lien reçu »
  useEffect(() => {
    const p = params.get('partager') === '1'
    const c = params.get('coller') === '1'
    if (!p && !c) return
    if (p) openShare()
    if (c) {
      focusPaste.current = true
      setPasteOpen(true)
      pasteRef.current?.focus()
    }
    setParams({}, { replace: true })
  }, [params]) // seuls les paramètres du lien déclenchent ces ouvertures

  /* ---------- fichier ---------- */
  const filePayload = (): NotesPayload => ({ kind: 'phasmo-coach/notes', from: holder, at: Date.now(), notes: state.notes })

  const importFile = async (file: File) => {
    try {
      const p = readNotesPayload(JSON.parse(await file.text()))
      if (!p) throw new Error('format')
      const { fresh, updated } = importCounts(state.notes, p.notes)
      dispatch({ type: 'notes:import', notes: p.notes })
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

  // élève : « De Ryz » (au stylo rouge) puis « Mes notes » ; coach : ses notes ; puis les notes d'autres carnets
  const groups = useMemo(() => {
    const out: { key: string; title: string; notes: CoachNote[] }[] = []
    const fromCoach = shown.filter((n) => isCoachNote(n, profile))
    const mine = shown.filter((n) => !isCoachNote(n, profile) && (isOwnNote(n, profile) || !n.author))
    if (isCoach) out.push({ key: 'mine', title: 'Mes notes', notes: shown.filter((n) => isCoachNote(n, profile) || isOwnNote(n, profile) || !n.author) })
    else {
      out.push({ key: 'coach', title: coach ? `De ${coach}` : 'Du coach', notes: fromCoach })
      out.push({ key: 'mine', title: 'Mes notes', notes: mine })
    }
    const others = new Map<string, CoachNote[]>()
    for (const n of shown) {
      if (isCoachNote(n, profile) || isOwnNote(n, profile) || !n.author) continue
      others.set(n.author, [...(others.get(n.author) ?? []), n])
    }
    for (const [author, notes] of others) out.push({ key: `from-${author}`, title: `De ${author}`, notes })
    return out
  }, [shown, profile, isCoach, coach])

  const total = state.notes.length
  const inReview = state.notes.filter(makesCard).length
  const pinned = state.notes.filter((n) => n.pinned).length
  const filtering = !!query.trim() || !!activeGhost
  const now = Date.now()
  const coachLabel = coach || 'ton coach'

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
            <TypedLink onClick={() => dispatch({ type: 'note:upsert', note: { ...n, pinned: !n.pinned, updatedAt: Date.now() } })}>
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

  const sinceLabel = sharing?.since != null ? safeDate(LONG, sharing.since, '') : ''

  return (
    <>
      <Book className="carnet">
        {/* ===================== page de gauche : écrire ===================== */}
        <Page side="left" section="6" label="Écrire une note">
          <FileHead>
            <span>
              {isCoach ? (
                <>
                  Carnet du coach{holder && <> · <b>{holder}</b></>}
                </>
              ) : (
                <>
                  Carnet{holder && <> de <b>{holder}</b></>}
                  {coach && <> · coach <b>{coach}</b></>}
                </>
              )}
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
                  <em>Le carnet de</em>
                  {holder}
                </>
              ) : isCoach ? (
                <>
                  <em>Le carnet</em>du coach
                </>
              ) : (
                <>
                  <em>Le carnet</em>de notes
                </>
              )}
            </h1>
            <p className="entry-line">
              {isCoach
                ? fr('Tout ce que tu expliques, au même endroit. Écris-le une fois et envoie le lien : une note ajoutée à la révision reviendra d’elle-même au bon moment, plus besoin de la répéter.')
                : fr(`Les notes de ${coachLabel} arrivent ici par lien, à côté des tiennes. Une note ajoutée à la révision reviendra d’elle-même au bon moment.`)}
            </p>
          </div>

          {pasteOpen ? (
            <section className="carnet-paste" aria-labelledby="h-paste">
              <form onSubmit={paste} noValidate>
                <h2 className="carnet-share-h" id="h-paste">
                  Coller un lien reçu
                </h2>
                <p className="pencil-note carnet-paste-hint">
                  {fr(
                    platform() === 'ios'
                      ? 'sur iPhone, un lien touché dans Discord ou Messages s’ouvre dans Safari, pas dans le carnet installé : copie-le et colle-le ici'
                      : 'un lien de notes ou un bilan reçu par message : colle-le ici',
                  )}
                </p>
                <label className="field">
                  <span>Le lien reçu</span>
                  <input
                    ref={pasteRef}
                    className="input typed"
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={pasteText}
                    onChange={(e) => {
                      setPasteText(e.target.value)
                      setPasteError(null)
                    }}
                    placeholder="https://…/#/importer?d=…"
                    aria-invalid={!!pasteError}
                    aria-describedby={pasteError ? 'paste-error' : undefined}
                  />
                </label>
                {pasteError && (
                  <p className="pencil-note carnet-paste-error" id="paste-error" role="alert">
                    {pasteError}
                  </p>
                )}
                <div className="carnet-paste-btns">
                  <PaperButton type="submit" disabled={!pasteText.trim() || pasteBusy} rotate={-0.8}>
                    Ouvrir le lien
                  </PaperButton>
                  <TypedLink onClick={foldPaste}>Replier</TypedLink>
                </div>
              </form>
            </section>
          ) : (
            <p className="carnet-paste-open" ref={reopenRef}>
              <TypedLink
                onClick={() => {
                  focusPaste.current = true
                  setPasteOpen(true)
                }}
              >
                Coller un lien reçu
              </TypedLink>
            </p>
          )}

          <NoteEditor autoFocus={!pasteOpen} />

          <section className="carnet-share" aria-labelledby="h-share">
            <h2 className="carnet-share-h" id="h-share">
              Partager et sauvegarder
            </h2>
            <p>
              {fr(
                own.length
                  ? 'Le lien emporte les notes que tu as écrites : par défaut, seulement les nouvelles depuis le dernier envoi. Le fichier garde tout le carnet, en copie de sécurité.'
                  : 'Le lien emportera les notes que tu écris ici. Le fichier garde tout le carnet, en copie de sécurité.',
              )}
            </p>
            <div className="carnet-share-btns">
              <PaperButton onClick={openShare} disabled={!own.length} rotate={-1}>
                Partager par lien
              </PaperButton>
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
              <Empty title="Le carnet est vide">
                {isCoach ? (
                  <p>{fr('Écris le premier conseil : une astuce, une erreur à éviter, un test à retenir.')}</p>
                ) : (
                  <p>
                    {fr(
                      `Quand ${coachLabel} t’envoie un lien, ouvre-le ou colle-le dans « Coller un lien reçu » : ses notes arriveront ici. Tu peux aussi écrire les tiennes.`,
                    )}
                  </p>
                )}
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
                    <h3 className="carnet-group-h" id={`h-${grp.key}`}>
                      <span>{grp.title}</span>
                      <span className="h-count">{grp.notes.length ? plural(grp.notes.length, 'note', 'notes') : 'aucune note'}</span>
                    </h3>
                    {grp.notes.length ? (
                      <ol className="carnet-board">{grp.notes.map(renderNote)}</ol>
                    ) : (
                      <p className="pencil-note carnet-group-empty">{fr(`rien de ${coachLabel} pour l’instant : ses notes arrivent par lien`)}</p>
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
        <p className="modal-text">
          «{NNBSP}
          {deleting?.title}
          {NNBSP}»{deleting && makesCard(deleting) ? ' et sa carte de révision seront supprimées' : ' sera supprimée'} de cet appareil.
        </p>
      </Modal>

      <Modal
        open={!!sharing}
        onClose={() => setSharing(null)}
        title="Envoyer mes notes"
        actions={
          <>
            <TypedLink onClick={() => setSharing(null)}>Fermer</TypedLink>
            {link.canSend && (
              <PaperButton onClick={link.send} disabled={!share} rotate={-0.8}>
                Envoyer…
              </PaperButton>
            )}
            <TapeButton arrow={false} onClick={link.copy} disabled={!share}>
              Copier le lien
            </TapeButton>
          </>
        }
      >
        {own.length === 0 ? (
          <p className="modal-text">
            {fr('Tu n’as encore écrit aucune note dans ce carnet : le lien emporte seulement les notes que tu as écrites.')}
          </p>
        ) : (
          <>
            {sharing?.since != null && (
              <div className="share-choice">
                <Seg
                  label="Notes à envoyer"
                  value={shareAll ? 'all' : 'new'}
                  onChange={(v) => setShareAll(v === 'all')}
                  options={[
                    { value: 'new', label: freshCount ? `Les nouvelles (${freshCount})` : 'Les nouvelles (aucune)' },
                    { value: 'all', label: `Tout mon carnet (${own.length})` },
                  ]}
                />
                {sinceLabel && <p className="pencil-note share-since">nouvelles ou modifiées depuis ton dernier envoi, le {sinceLabel}</p>}
              </div>
            )}
            {toSend.length === 0 ? (
              <p className="modal-text">{fr('Rien de nouveau depuis le dernier envoi. Choisis « Tout mon carnet » pour tout renvoyer.')}</p>
            ) : (
              <>
                <p className="modal-text">
                  {fr(
                    `Envoie ce lien : en l’ouvrant, l’autre appareil pourra importer ${toSend.length > 1 ? `les ${toSend.length} notes` : 'la note'}. Celles qui existent déjà sont mises à jour, rien n’est effacé. Les notes voyagent dans le lien lui-même : aucun serveur ne les garde.`,
                  )}
                </p>
                <ShareUrl link={link} url={share?.url ?? null} label="Lien de partage" />
                <p className="pencil-note share-ios">
                  {fr('sur iPhone, le lien s’ouvre dans Safari : si le carnet est installé, il faut le coller dans Carnet, « Coller un lien reçu »')}
                </p>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  )
}
