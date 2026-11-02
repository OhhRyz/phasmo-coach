import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { cameFromCodex } from './codexReturn'
import { HatchDefs, SanityChart, SpeedChart, UvPrint } from '../components/journal/Charts'
import {
  CircledNumber,
  FileHead,
  H,
  MarginNote,
  Notebook,
  Page,
  PaperButton,
  Polaroid,
  RoughCircle,
  Stamp,
  Sticky,
  Tape,
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { roughLine, roughRng, tickPath } from '../components/journal/rough'
import { NoteActionLinks, useNoteActions } from '../components/NoteActions'
import { NoteEditor } from '../components/NoteEditor'
import { ReportDialog } from '../components/ReportDialog'
import { NoteText } from './Notebook'
import { Empty, useMedia } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { Ghost, ObservationKind, TextItem } from '../data/types'
import { createFootsteps, type Footsteps } from '../engine/audio'
import type { CoachNote } from '../engine/cards'
import { fr, NBSP, NNBSP, num, safeDate, spellLdV, validTime } from '../engine/format'
import { coachNameOf, coachNotes, isCoachNote, isOwnNote, makesCard, skipsOwnReview, sortNotes } from '../engine/notes'
import { entityMentions } from '../engine/mentions'
import { lowerFirst, pairZeroVariants, testException } from '../engine/fiche'
import { masteryLevel } from '../engine/progress'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'
import { START_REVIEW } from './reviewSession'

type Style = CSSProperties & Record<`--${string}`, string | number>

const KIND: Record<ObservationKind, string> = {
  behavior: 'Comportement',
  hunt: 'Chasse',
  interaction: 'Interaction',
  event: 'Événement',
  tell: 'Signe',
}
/** Les mêmes mots que les tampons de la révision (« Exact » / « À revoir ») ; « difficile » vient d'anciennes séances. */
const GRADE_WORD = { 1: 'à revoir', 2: 'difficile', 3: 'exact', 4: 'exact' } as const
/** Pages empilées (tablette, téléphone) : la fiche se lit d'un seul fil, « À retenir » remonte sous la description. */
const STACKED = '(max-width: 1180px)'
const PHONE = '(max-width: 759px)'

/**
 * Le relevé des preuves de la fiche : une coche à la main (dans la couleur de la preuve) ou un tiret au
 * crayon. Pas de case : rien à cocher ici, les cases à toucher sont celles du carnet de preuves.
 */
function EvMark({ has, color, seed, delay }: { has: boolean; color: string; seed: string; delay: number }) {
  const r = roughRng(seed)
  return (
    <span className={`box ev-mark${has ? '' : ' ev-mark--no'}`} style={{ '--c': color } as Style} aria-hidden>
      <svg className="draw" viewBox="0 0 38 38">
        {has ? (
          <path className="t" d={tickPath(22, r)} pathLength={1} strokeWidth={3.6} style={{ '--d': `${delay}s`, '--dur': '.45s' } as Style} />
        ) : (
          <path d={roughLine(12, 19 + r() * 2, 27, 18 + r() * 2, r, 0.8)} pathLength={1} strokeWidth={2} style={{ '--d': `${delay}s`, '--dur': '.3s' } as Style} />
        )}
      </svg>
    </span>
  )
}

/** Amène une partie de la fiche sous les yeux et y place le focus (clavier, lecteurs d'écran). */
function jumpTo(id: string) {
  const el = document.getElementById(id)?.closest('section')
  if (!el) return
  const smooth = typeof matchMedia !== 'undefined' && !matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  el.focus({ preventScroll: true })
}

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** Un mot tamponné qui résume l'entité, tiré de ses données. */
function stampFor(g: Ghost): string | null {
  if (g.id === 'the-mimic') return 'Imitateur'
  if (g.huntSanity.high >= 70 && g.huntSanity.normal >= 60) return 'Chasse très tôt'
  if (g.forcedEvidence) return 'Preuve forcée'
  if (!g.speed.los && !g.speed.losVaries) return 'Vitesse spéciale'
  if (g.huntSanity.high > 50) return 'Chasse tôt'
  if (g.huntSanity.normal >= 0 && g.huntSanity.normal < 50) return 'Chasse tard'
  return null
}

/**
 * « Winter’s Jest v0.15.1.0 (16 décembre 2025) : la Banshee… » → la version datée à part, puis le texte.
 * Seulement quand l'en-tête est court et porte une date ou un numéro de version.
 */
function splitChange(text: string): { when: string | null; text: string } {
  const m = /^(.{6,64}?)[\u202f\u00a0 ]:\s+(.+)$/su.exec(text)
  if (!m || !/\d/.test(m[1])) return { when: null, text }
  const rest = m[2]
  return { when: m[1], text: rest.charAt(0).toLocaleUpperCase('fr') + rest.slice(1) }
}

/**
 * En-tête tapé d'un post-it : date et, si la note revient en révision, « en révision » (côté coach, une note
 * qui part en carte chez l'élève sans revenir dans sa révision à lui : « carte pour l'élève »).
 */
function noteMeta(n: CoachNote, forStudent = false): string {
  return `${safeDate(SHORT, n.createdAt)}${makesCard(n) ? (forStudent ? ' · carte pour l’élève' : ' · en révision') : ''}`
}

/** Un texte de la fiche où les autres entités citées (« l'Obambo », « un Gallu ») mènent à leur fiche. */
function Linked({ text, skip }: { text: string; skip: readonly string[] }) {
  return (
    <>
      {entityMentions(text, GHOSTS, skip).map((m, k) =>
        typeof m === 'string' ? (
          <Fragment key={k}>{m}</Fragment>
        ) : (
          <Link key={k} className="gh-mention" to={`/codex/${m.id}`}>
            {m.text}
          </Link>
        ),
      )}
    </>
  )
}

/**
 * Une liste de signes ou de capacités. Une ligne redite pour la partie sans preuve (le Spectre laisse « un EMF 2
 * ou un EMF 5 », et sans preuve « un EMF 2 ») se range sous la ligne qu'elle adapte, annoncée comme telle : elle
 * ne se lit plus comme un doublon qui se contredit.
 */
function Lines({ items, self }: { items: TextItem[]; self: string }) {
  return (
    <ul className="lines">
      {pairZeroVariants(items).map(({ item, variant }, k) => (
        <li key={k}>
          <Linked text={item.text} skip={[self]} />
          {item.zeroEvidence && <span className="pencil-note zero-mark"> marche sans preuve</span>}
          {variant && (
            <span className="zero-variant">
              <span className="pencil-note zero-variant-k">en partie sans preuve{NNBSP}:</span> <Linked text={lowerFirst(variant.text)} skip={[self]} />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function GhostPage() {
  const { id = '' } = useParams()
  // ouverte depuis le registre ou la recherche du Codex : « ‹ Codex » y revient en arrière, la recherche avec
  const location = useLocation()
  const navigate = useNavigate()
  const backToCodex = cameFromCodex(location.state, typeof window === 'undefined' ? null : window.history.state?.idx)
  const ghost = getGhost(id)
  const mastery = useMastery()
  const { state, deck } = useStore()
  const [playing, setPlaying] = useState<number | null>(null)
  const [moreConf, setMoreConf] = useState(false)
  const [reporting, setReporting] = useState(false)
  const steps = useRef<Footsteps | null>(null)
  const stacked = useMedia(STACKED)
  const nameRef = useRef<HTMLHeadingElement>(null)
  // les notes de la fiche se modifient et se suppriment comme dans « Mes notes » (même confirmation)
  const noteActions = useNoteActions()

  // téléphone : le nom tient sur sa ligne, à côté de la maîtrise entourée (un nom long rapetisse au lieu de déborder)
  useLayoutEffect(() => {
    const el = nameRef.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      if (typeof matchMedia === 'undefined' || !matchMedia(PHONE).matches || el.scrollWidth <= el.clientWidth) return
      const size = parseFloat(getComputedStyle(el).fontSize)
      el.style.fontSize = `${Math.floor(size * (el.clientWidth / el.scrollWidth) * 0.97)}px`
    }
    fit()
    let live = true
    document.fonts?.ready.then(() => live && fit())
    window.addEventListener('resize', fit)
    return () => {
      live = false
      window.removeEventListener('resize', fit)
    }
  }, [id])

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(null))
    return () => steps.current?.stop()
  }, [])
  useEffect(() => {
    steps.current?.stop()
    setMoreConf(false)
    setReporting(false)
  }, [id])

  // stylo rouge : les vraies notes du coach ; « Mes notes » : celles de la personne qui tient le carnet
  const fromCoach = useMemo(() => coachNotes(state.notes, state.profile, id), [state.notes, state.profile, id])
  const mine = useMemo(
    () => sortNotes(state.notes.filter((n) => n.ghostId === id && !isCoachNote(n, state.profile))),
    [state.notes, state.profile, id],
  )
  const history = useMemo(() => {
    const prefix = `g:${id}:`
    return state.log.filter((l) => l.id.startsWith(prefix)).slice(-4)
  }, [state.log, id])
  const ghostCards = useMemo(() => deck.filter((c) => c.ghostId === id && c.deck === 'ghost'), [deck, id])
  const nextDue = useMemo(() => {
    const dues = ghostCards.map((c) => validTime(state.cards[c.id]?.due)).filter((d): d is number => d != null)
    return dues.length ? Math.min(...dues) : null
  }, [ghostCards, state.cards])

  if (!ghost) {
    return (
      <Notebook single>
        <Page section="3">
          <Empty title="Fiche introuvable" as="h1">
            <p>
              <TypedLink to="/codex">Retour au codex</TypedLink>
            </p>
          </Empty>
        </Page>
      </Notebook>
    )
  }

  const idx = GHOSTS.findIndex((g) => g.id === ghost.id)
  const prev = GHOSTS[(idx - 1 + GHOSTS.length) % GHOSTS.length]
  const next = GHOSTS[(idx + 1) % GHOSTS.length]
  const m = mastery[ghost.id] ?? 0
  const stamp = stampFor(ghost)
  const speeds = [...new Set([ghost.speed.min, ghost.speed.max, ghost.speed.alt].filter((v): v is number => v != null && v > 0))]
  const definitive = ghost.confirmationTests.filter((t) => t.definitive).length
  const shared = (o: Ghost) => o.evidence.filter((e) => ghost.evidence.includes(e))
  const confusions = ghost.confusions.map((c) => ({ ...c, other: getGhost(c.with) })).filter((c) => c.other)
  const twoShared = confusions.filter((c) => shared(c.other!).length >= 2)
  const others = confusions.filter((c) => shared(c.other!).length < 2)
  const folio = idx * 4 + 2
  const coach = coachNameOf(state.profile)
  const isCoach = state.profile.role === 'coach'
  const level = masteryLevel(m)
  const now = Date.now()
  // l'entité de la fiche ne se lie pas à elle-même
  const self = [ghost.id]

  const hasSigns = ghost.tells.length + ghost.behaviors.length + ghost.abilities.length > 0
  const notesId = isCoach ? 'h-coach' : 'h-mine'
  // les parties de la fiche, dans l'ordre de lecture : au choix dans « Signaler une erreur »
  const parts = [
    'Résumé',
    'Preuves',
    'Seuil de chasse',
    'Vitesse en chasse',
    ghost.keyTells.length > 0 && 'À retenir',
    'Sans preuve',
    'Ne pas confondre',
    hasSigns && 'Signes et comportements',
    ghost.observations.length > 0 && 'Ce que tu verras',
    ghost.changes.length > 0 && 'Changements récents',
    ghost.uncertain.length > 0 && 'À vérifier en partie',
  ].filter((p): p is string => !!p)
  // le sommaire de la fiche : les parties les plus utiles, dans l'ordre de lecture
  const contents = [
    ghost.keyTells.length > 0 && { id: 'h-tells', label: 'À retenir' },
    { id: 'h-zero', label: 'Sans preuve' },
    { id: 'h-conf', label: 'Ne pas confondre' },
    hasSigns && { id: 'h-signs', label: 'Signes' },
    { id: notesId, label: isCoach ? 'Notes' : 'Mes notes' },
  ].filter((c): c is { id: string; label: string } => !!c)
  // une erreur repérée en lisant : la fenêtre s'ouvre d'ici, sans descendre au bas de la fiche
  const tocLinks = [
    ...contents.map((c) => ({ key: c.id, label: c.label, go: () => jumpTo(c.id) })),
    { key: 'report', label: 'Signaler une erreur', go: () => setReporting(true) },
  ]

  // « À retenir » : sur la page de droite côte à côte, juste sous la description quand les pages s'empilent
  const tells =
    ghost.keyTells.length > 0 ? (
      <section aria-labelledby="h-tells" tabIndex={-1} className="gh-tells">
        <H id="h-tells">À retenir</H>
        <ol className="tells">
          {ghost.keyTells.map((t, k) => (
            <li key={k}>
              <CircledNumber n={k + 1} delay={0.5 + k * 0.15} />
              <p>
                <Linked text={t} skip={self} />
              </p>
            </li>
          ))}
        </ol>
      </section>
    ) : null

  const toggle = (v: number) => {
    if (playing === v) {
      steps.current?.stop()
      return
    }
    steps.current?.play(v, 8)
    setPlaying(v)
  }

  return (
    <div className="ghost-file">
      <HatchDefs />
      {/* ===================== double page 1 ===================== */}
      <Notebook>
        <Page side="left" section="3" label={`Fiche${NNBSP}: ${ghost.name}`}>
          <FileHead>
            <Link
              to="/codex"
              onClick={(e) => {
                if (!backToCodex || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                navigate(-1)
              }}
            >
              ‹ Codex
            </Link>
            <span>
              Fiche <b>{idx + 1}</b> / {GHOSTS.length}
            </span>
            <span>
              <Link to={`/codex/${prev.id}`}>‹ {prev.name}</Link> · <Link to={`/codex/${next.id}`}>{next.name} ›</Link>
            </span>
          </FileHead>

          <header className="ghost-head">
            <h1 className="ghost-name" ref={nameRef}>
              {ghost.name}
            </h1>
            {stamp && (
              <Stamp thunk rotate={8} delay={0.55}>
                {stamp}
              </Stamp>
            )}
            {/* le tampon s'explique en une ligne : le terme reste, le débutant sait ce qu'il veut dire */}
            {stamp === 'Preuve forcée' && ghost.forcedEvidence && (
              <p className="gh-stamp-why">
                {fr(
                  `${ghost.name.startsWith('Les ') ? 'Leur' : 'Sa'} preuve ${EVIDENCE[ghost.forcedEvidence].label} fait toujours partie des preuves visibles, même en difficulté Cauchemar ou Démence.`,
                )}
              </p>
            )}
            {ghost.nameEn !== ghost.name && (
              <span className="ghost-alias">
                «{NNBSP}
                {ghost.nameEn}
                {NNBSP}» en version anglaise
              </span>
            )}
            <MarginNote className="grade" style={{ left: -110, top: 6, width: 92, '--r': '-8deg' }}>
              <span className="grade-n">
                <RoughCircle seed={`grade-${ghost.id}`} padX={0.1} padY={0.12} width={2.2} delay={0.9}>
                  {Math.round(m * 100)}
                  {NBSP}%
                </RoughCircle>
              </span>
              <small className="grade-k">ta maîtrise</small>
              {level.tone !== 'none' && <small className={level.tone === 'max' ? 'is-max' : undefined}>{level.label.toLocaleLowerCase('fr')}</small>}
            </MarginNote>
          </header>

          <p className="lead">{ghost.summary}</p>

          <nav className="gh-toc" aria-label="Sur cette fiche">
            <span className="gh-toc-k">Sur cette fiche{NNBSP}:</span>
            {tocLinks.map((c, k) => (
              <span key={c.key} className="gh-toc-item">
                <TypedLink onClick={c.go}>{c.label}</TypedLink>
                {k < tocLinks.length - 1 && (
                  <span className="gh-toc-sep" aria-hidden>
                    ·
                  </span>
                )}
              </span>
            ))}
          </nav>

          {stacked && tells}

          <div className="ghost-hero">
            <Polaroid ghostId={ghost.id} caption={ghost.name} small={`n° ${idx + 1}`} rotate={-2.6} delay={0.1} />
            <section aria-labelledby="h-ev">
              <H id="h-ev" count={`${ghost.evidence.length} sur 7`}>
                Preuves
              </H>
              <ul className="ev-list">
                {EVIDENCE_IDS.map((e, k) => {
                  const ev = EVIDENCE[e]
                  const has = ghost.evidence.includes(e)
                  const fake = ghost.fakeEvidence === e
                  return (
                    <li key={e} className={`ev ${has || fake ? 'yes' : 'no'}`} data-ev={e} style={{ '--c': ev.color } as Style}>
                      <EvMark has={has || fake} color={ev.color} seed={`${ghost.id}-${e}`} delay={0.2 + k * 0.05} />
                      <span className="ev-text">
                        <span className="ev-name">
                          <span className="l">{ev.label}</span>
                          <span className="s">{ev.short}</span>
                          <span className="sr-only">{has || fake ? `${NNBSP}: oui` : `${NNBSP}: non`}</span>
                        </span>
                        {has && (
                          <span className="side">
                            {ghost.forcedEvidence === e ? 'toujours visible, même en difficulté Cauchemar' : ev.side}
                          </span>
                        )}
                        {fake && <span className="side">fausse preuve, toujours présente</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>

          <section aria-labelledby="h-mes">
            <H id="h-mes">Mesures</H>
            <div className="measure">
              <div className="measure-head">
                <h3>Seuil de chasse</h3>
                <span className="val">{ghost.huntSanity.summary}</span>
              </div>
              <SanityChart ghost={ghost} />
              {ghost.huntSanity.details.map((d, k) => (
                <p key={k}>
                  <Linked text={d} skip={self} />
                </p>
              ))}
            </div>
            <div className="measure">
              <div className="measure-head">
                <h3>Vitesse en chasse</h3>
                <span className="val">{spellLdV(ghost.speed.summary)}</span>
              </div>
              <SpeedChart ghost={ghost} />
              {ghost.speed.details.map((d, k) => (
                <p key={k}>
                  <Linked text={d} skip={self} />
                </p>
              ))}
              {speeds.length > 0 && (
                <p className="listen">
                  {speeds.map((v) => (
                    <PaperButton key={v} onClick={() => toggle(v)} pressed={playing === v}>
                      {playing === v ? 'Arrêter' : `Écouter ses pas · ${num(v)}${NBSP}m/s`}
                    </PaperButton>
                  ))}
                </p>
              )}
            </div>
          </section>

          <div className="ghost-actions">
            <TapeButton to={`/quiz?ghost=${ghost.id}`}>Me tester sur {ghost.name.length > 14 ? 'cette entité' : ghost.name}</TapeButton>
            <TypedLink to={START_REVIEW}>
              {ghostCards.length === 0
                ? 'aucune question dans ta révision'
                : `${ghostCards.length} question${ghostCards.length > 1 ? 's' : ''} dans ta révision`}
            </TypedLink>
          </div>
          <UvPrint style={{ left: 4, top: 470, width: 150, transform: 'rotate(-18deg)', ['--ur' as string]: '230px' }} />
          <span className="folio">— {folio} —</span>
        </Page>

        <Page side="right" section="3" label="À retenir et tests sans preuve">
          <FileHead>
            <span>{ghost.name} · sur le terrain</span>
            <span>Vérifié en oct. 2026</span>
          </FileHead>

          {!stacked && tells}

          <section aria-labelledby="h-zero" tabIndex={-1}>
            <H
              id="h-zero"
              count={
                definitive
                  ? `${definitive} test${definitive > 1 ? 's' : ''} définitif${definitive > 1 ? 's' : ''}`
                  : ghost.confirmationTests.length
                    ? 'aucun test définitif'
                    : undefined
              }
            >
              Sans preuve
            </H>
            <p className="zero-intro">Ce qui {ghost.name.startsWith('Les ') ? 'les trahit' : 'la trahit'} même quand ton journal est vide.</p>
            {ghost.confirmationTests.length === 0 && (
              <p className="muted">Pas de test de confirmation fiable{NNBSP}: il faut éliminer les autres entités.</p>
            )}
            {ghost.confirmationTests.map((t, k) => {
              // le test nomme lui-même une exception (« Seul un Gallu enragé… fait pareil ») : le tampon y renvoie
              const exception = t.definitive ? testException(t.text, GHOSTS) : null
              return (
                <article className="protocol" key={k}>
                  <div className="protocol-top">
                    <h3>Test n° {k + 1}</h3>
                    {t.definitive ? (
                      <span className="protocol-verdict">
                        <Stamp small rotate={k % 2 ? 3 : -4}>
                          Définitif
                        </Stamp>
                        {exception && <span className="pencil-note protocol-except">sauf {exception}, voir ci-dessous</span>}
                      </span>
                    ) : (
                      <Stamp small tone="pencil" rotate={-1}>
                        Indice
                      </Stamp>
                    )}
                  </div>
                  <p>
                    <Linked text={t.text} skip={self} />
                  </p>
                </article>
              )
            })}
            {ghost.eliminationTests.map((t, k) => (
              <p className="elim" key={k}>
                <b>Élimine</b>
                <span>
                  <Linked text={t.text} skip={self} />
                </span>
              </p>
            ))}
            {ghost.id !== 'the-mimic' && (
              <p className="mimic-note">Rappel{NNBSP}: le Mimic peut copier ces comportements. Ses orbes, toujours présents, le trahissent.</p>
            )}
          </section>
          {confusions.length > 0 && (
            <div className="turn">
              la suite{NNBSP}: ses sosies
              <svg className="draw" width="40" height="44" viewBox="0 0 40 44" aria-hidden>
                <path d="M8 2 C 2 18, 10 30, 26 38" strokeWidth="2" pathLength={1} style={{ '--d': '2.2s' } as Style} />
                <path d="M16 38 L27 39 L24 28" strokeWidth="2" pathLength={1} style={{ '--d': '2.6s', '--dur': '.3s' } as Style} />
              </svg>
            </div>
          )}
          <span className="folio">— {folio + 1} —</span>
        </Page>
      </Notebook>

      {/* ===================== double page 2 ===================== */}
      <Notebook as="section" className="notebook--cont">
        <Page side="left" section="3" label="Ne pas confondre">
          <FileHead>
            <span>{ghost.name} · suite</span>
            <span>
              Fiche <b>{idx + 1}</b> / {GHOSTS.length}
            </span>
          </FileHead>
          <section aria-labelledby="h-conf" tabIndex={-1}>
            <H id="h-conf" count={confusions.length ? `${confusions.length} entité${confusions.length > 1 ? 's' : ''}` : undefined}>
              Ne pas confondre
            </H>
            {confusions.length === 0 && <p className="muted">Pas de confusion fréquente.</p>}
            {twoShared.length > 0 && (
              <div className="conf-group">
                <h3>Deux preuves en commun</h3>
                <ul className={`conf${moreConf ? ' open' : ''}`}>
                  {twoShared.map((c, k) => (
                    <li key={c.with} className={k >= 4 ? 'extra' : undefined}>
                      <b>
                        <Link to={`/codex/${c.with}`}>{c.other!.name}</Link>
                      </b>
                      <span className="shared">
                        {shared(c.other!).map((e) => (
                          <span key={e} className="evw" style={{ '--c': EVIDENCE[e].color } as Style}>
                            {EVIDENCE[e].short}
                          </span>
                        ))}
                      </span>
                      <p>
                        <Linked text={c.why} skip={[ghost.id, c.with]} />
                      </p>
                    </li>
                  ))}
                </ul>
                {twoShared.length > 4 && (
                  <button className="link link-btn conf-more" type="button" aria-expanded={moreConf} onClick={() => setMoreConf((v) => !v)}>
                    {moreConf ? 'Replier la liste' : twoShared.length - 4 === 1 ? 'Voir l’autre' : `Voir les ${twoShared.length - 4} autres`}
                  </button>
                )}
              </div>
            )}
            {others.length > 0 && (
              <div className="conf-group">
                <h3>Autres ressemblances</h3>
                <ul className="conf">
                  {others.map((c) => (
                    <li key={c.with}>
                      <b>
                        <Link to={`/codex/${c.with}`}>{c.other!.name}</Link>
                      </b>
                      <p>
                        <Linked text={c.why} skip={[ghost.id, c.with]} />
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {hasSigns && (
            <section aria-labelledby="h-signs" tabIndex={-1}>
              <H id="h-signs">Signes et comportements</H>
              {ghost.tells.length > 0 && (
                <div className="conf-group">
                  <h3>Signes distinctifs</h3>
                  <Lines items={ghost.tells} self={ghost.id} />
                </div>
              )}
              {ghost.behaviors.length > 0 && (
                <div className="conf-group">
                  <h3>Comportements</h3>
                  <Lines items={ghost.behaviors} self={ghost.id} />
                </div>
              )}
              {ghost.abilities.length > 0 && (
                <div className="conf-group">
                  <h3>Capacités</h3>
                  <Lines items={ghost.abilities} self={ghost.id} />
                </div>
              )}
            </section>
          )}
          <span className="folio">— {folio + 2} —</span>
        </Page>

        <Page side="right" section="3" label="Sur le terrain, notes et suivi">
          <FileHead>
            <span>{ghost.name} · suite</span>
            <span>Rapports, notes, suivi</span>
          </FileHead>

          {ghost.observations.length > 0 && (
            <section aria-labelledby="h-obs">
              <H id="h-obs" count={`${ghost.observations.length} rapport${ghost.observations.length > 1 ? 's' : ''}`}>
                Ce que tu verras
              </H>
              <ol className="obs">
                {ghost.observations.map((o, k) => (
                  <li key={k}>
                    <span className="kind">{KIND[o.kind]}</span>
                    <p>
                      <Linked text={o.text} skip={self} />
                    </p>
                    {o.strength === 'definitive' ? (
                      <Stamp small rotate={k % 2 ? 3 : -4}>
                        Définitif
                      </Stamp>
                    ) : o.strength === 'strong' ? (
                      <Stamp small tone="violet" rotate={2}>
                        Fort
                      </Stamp>
                    ) : (
                      <Stamp small tone="pencil" rotate={-1}>
                        Indice
                      </Stamp>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {(fromCoach.length > 0 || isCoach) && (
            <section aria-labelledby="h-coach" tabIndex={-1}>
              <H id="h-coach" count={fromCoach.length ? `${fromCoach.length} note${fromCoach.length > 1 ? 's' : ''}` : undefined}>
                {coach ? `Notes de ${coach}` : 'Notes du coach'}
              </H>
              <div className="ghost-notes">
                {fromCoach.map((n, k) => (
                  <div key={n.id} className="gh-note">
                    <Sticky
                      hand="coach"
                      rotate={k % 2 ? 1.6 : -1.8}
                      meta={noteMeta(n, skipsOwnReview(n, state.profile, state.settings))}
                      sign={n.author ? `— ${n.author}` : undefined}
                    >
                      <NoteText note={n} />
                    </Sticky>
                    <NoteActionLinks note={n} actions={noteActions} className="gh-note-acts" />
                  </div>
                ))}
                {isCoach && <NoteEditor key={ghost.id} ghostId={ghost.id} compact />}
              </div>
            </section>
          )}

          {(!isCoach || mine.length > 0) && (
            <section aria-labelledby="h-mine" tabIndex={-1}>
              <H id="h-mine" count={mine.length ? `${mine.length} note${mine.length > 1 ? 's' : ''}` : undefined}>
                {isCoach ? 'Autres notes' : 'Mes notes'}
              </H>
              <div className="ghost-notes">
                {mine.map((n, k) => (
                  <div key={n.id} className="gh-note">
                    <Sticky
                      hand="mine"
                      rotate={k % 2 ? -1.2 : 1.4}
                      meta={noteMeta(n, skipsOwnReview(n, state.profile, state.settings))}
                      // une note d'une autre personne garde sa signature
                      sign={n.author && !isOwnNote(n, state.profile) ? `— ${n.author}` : undefined}
                    >
                      <NoteText note={n} />
                    </Sticky>
                    <NoteActionLinks note={n} actions={noteActions} className="gh-note-acts" />
                  </div>
                ))}
                {!isCoach && <NoteEditor key={ghost.id} ghostId={ghost.id} compact />}
              </div>
            </section>
          )}

          <div className="ghost-side">
            <div className="libcard libcard--what settle" style={{ '--r': '1.6deg', '--d': '.6s' } as Style}>
              <Tape />
              <h3>Fiche de suivi</h3>
              <p className="libcard-what">Tes dernières révisions de cette entité, et quand elle revient.</p>
              <div className="cols">
                <span>Révisé le</span>
                <span>Résultat</span>
              </div>
              <ol>
                {history.length === 0 && (
                  <li>
                    <span className="d">—</span>
                    <span className="res">pas encore révisée</span>
                  </li>
                )}
                {history.map((h, k) => (
                  <li key={k} style={{ '--r': `${[-2, 1, -1, 2][k]}deg` } as Style}>
                    <span className="d">{safeDate(DATE, h.t)}</span>
                    <span className={`res${h.g === 1 ? ' bad' : ''}`}>{GRADE_WORD[h.g] ?? '—'}</span>
                  </li>
                ))}
                {nextDue != null && (
                  <li className="next" style={{ '--r': '-3deg' } as Style}>
                    <span className="d">{nextDue <= now ? 'À revoir aujourd’hui' : `À revoir le ${safeDate(SHORT, nextDue)}`}</span>
                  </li>
                )}
              </ol>
            </div>
          </div>

          {(ghost.changes.length > 0 || ghost.uncertain.length > 0) && (
            <section className="gh-updates" aria-labelledby={ghost.changes.length ? 'h-changes' : 'h-unsure'}>
              {ghost.changes.length > 0 && (
                <>
                  <H id="h-changes">Changements récents</H>
                  <ul className="gh-changes">
                    {ghost.changes.map((c, k) => {
                      const { when, text } = splitChange(c)
                      return (
                        <li key={k}>
                          {when && <span className="gh-change-when">{when}</span>}
                          <p>
                            <Linked text={text} skip={self} />
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
              {ghost.uncertain.length > 0 && (
                <div className="gh-unsure">
                  {ghost.changes.length > 0 ? (
                    <h3 className="gh-unsure-h" id="h-unsure">
                      À vérifier en partie
                    </h3>
                  ) : (
                    <h2 className="gh-unsure-h" id="h-unsure">
                      À vérifier en partie
                    </h2>
                  )}
                  <ul className="pencil-note">
                    {ghost.uncertain.map((u, k) => (
                      <li key={k}>
                        <Linked text={u} skip={self} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <p className="sources">
            {ghost.sources.length === 0
              ? 'Aucune source listée'
              : `${ghost.sources.length} source${ghost.sources.length > 1 ? 's' : ''} consultée${ghost.sources.length > 1 ? 's' : ''}`}
          </p>
          {/* une erreur repérée : une fenêtre de l'app (texte à copier pour Discord, GitHub en second choix) */}
          <p className="gh-report">
            <TypedLink onClick={() => setReporting(true)}>Signaler une erreur sur cette fiche</TypedLink>
          </p>
          <nav className="pager" aria-label="Fiches voisines">
            <TypedLink to={`/codex/${prev.id}`}>‹ {prev.name}</TypedLink>
            <TypedLink to={`/codex/${next.id}`}>{next.name} ›</TypedLink>
          </nav>
          <span className="folio">— {folio + 3} —</span>
        </Page>
      </Notebook>
      {noteActions.modals}
      <ReportDialog key={ghost.id} open={reporting} onClose={() => setReporting(false)} fiche={ghost.name} parts={parts} />
    </div>
  )
}
