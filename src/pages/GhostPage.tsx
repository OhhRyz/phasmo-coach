import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { HatchDefs, SanityChart, SpeedChart, UvPrint } from '../components/journal/Charts'
import {
  CircledNumber,
  FileHead,
  H,
  JournalBox,
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
import { NoteEditor } from '../components/NoteEditor'
import { Empty } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { Ghost, ObservationKind, TextItem } from '../data/types'
import { createFootsteps, type Footsteps } from '../engine/audio'
import { num } from '../engine/format'
import { masteryLevel } from '../engine/progress'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

type Style = CSSProperties & Record<`--${string}`, string | number>

const KIND: Record<ObservationKind, string> = {
  behavior: 'Comportement',
  hunt: 'Chasse',
  interaction: 'Interaction',
  event: 'Événement',
  tell: 'Signe',
}
const GRADE_WORD = { 1: 'raté', 2: 'hésité', 3: 'bon', 4: 'facile' } as const
const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** Un mot tamponné qui résume l'entité, tiré de ses données. */
function stampFor(g: Ghost): string | null {
  if (g.id === 'the-mimic') return 'Imitateur'
  if (g.huntSanity.high >= 70 && g.huntSanity.normal >= 60) return 'Très agressif'
  if (g.forcedEvidence) return 'Preuve forcée'
  if (!g.speed.los && !g.speed.losVaries) return 'Vitesse spéciale'
  if (g.huntSanity.high > 50) return 'Chasse tôt'
  if (g.huntSanity.normal >= 0 && g.huntSanity.normal < 50) return 'Chasse tard'
  return null
}

/** Mot du correcteur sous la note de maîtrise. */
function gradeWord(m: number): string {
  if (m === 0) return 'à ouvrir'
  if (m < 0.35) return 'on s’y met'
  if (m < 0.6) return 'ça vient'
  if (m < 0.85) return 'presque !'
  return 'acquise'
}

function Lines({ items }: { items: TextItem[] }) {
  return (
    <ul className="lines">
      {items.map((i, k) => (
        <li key={k}>
          {i.text}
          {i.zeroEvidence && <span className="pencil-note zero-mark"> marche sans preuve</span>}
        </li>
      ))}
    </ul>
  )
}

export function GhostPage() {
  const { id = '' } = useParams()
  const ghost = getGhost(id)
  const mastery = useMastery()
  const { state, deck } = useStore()
  const [playing, setPlaying] = useState<number | null>(null)
  const [moreConf, setMoreConf] = useState(false)
  const steps = useRef<Footsteps | null>(null)

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(null))
    return () => steps.current?.stop()
  }, [])
  useEffect(() => {
    steps.current?.stop()
    setMoreConf(false)
  }, [id])

  const notes = useMemo(() => state.notes.filter((n) => n.ghostId === id), [state.notes, id])
  const history = useMemo(() => {
    const prefix = `g:${id}:`
    return state.log.filter((l) => l.id.startsWith(prefix)).slice(-4)
  }, [state.log, id])
  const ghostCards = useMemo(() => deck.filter((c) => c.ghostId === id && c.deck === 'ghost'), [deck, id])
  const nextDue = useMemo(() => {
    const dues = ghostCards.map((c) => state.cards[c.id]?.due).filter((d): d is number => d != null)
    return dues.length ? Math.min(...dues) : null
  }, [ghostCards, state.cards])

  if (!ghost) {
    return (
      <Notebook single>
        <Page section="3">
          <Empty title="Fiche introuvable">
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
  const coach = state.profile.role === 'coach' ? state.profile.name : state.profile.coachName

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
        <Page side="left" section="3" label={`Fiche : ${ghost.name}`}>
          <FileHead>
            <Link to="/codex">‹ Codex</Link>
            <span>
              Fiche <b>{idx + 1}</b> / {GHOSTS.length}
            </span>
            <span>
              <Link to={`/codex/${prev.id}`}>‹ {prev.name}</Link> · <Link to={`/codex/${next.id}`}>{next.name} ›</Link>
            </span>
          </FileHead>

          <header className="ghost-head">
            <h1 className="ghost-name">{ghost.name}</h1>
            {stamp && (
              <Stamp thunk rotate={8} delay={0.55}>
                {stamp}
              </Stamp>
            )}
            {ghost.nameEn !== ghost.name && <span className="ghost-alias">« {ghost.nameEn} » en version anglaise</span>}
            <MarginNote className="grade" style={{ left: -110, top: 6, width: 92, '--r': '-8deg' }}>
              <span className="grade-n">
                <RoughCircle seed={`grade-${ghost.id}`} padX={0.1} padY={0.12} width={2.2} delay={0.9}>
                  {Math.round(m * 100)} %
                </RoughCircle>
              </span>
              <small>{gradeWord(m)}</small>
            </MarginNote>
          </header>

          <p className="lead">{ghost.summary}</p>

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
                      <JournalBox state={has || fake ? 'yes' : 'empty'} color={ev.color} seed={`${ghost.id}-${e}`} delay={0.2 + k * 0.05} />
                      <span className="ev-text">
                        <span className="ev-name">
                          <span className="l">{ev.label}</span>
                          <span className="s">{ev.short}</span>
                        </span>
                        {has && (
                          <span className="side">
                            {ghost.forcedEvidence === e ? 'toujours visible, même en Cauchemar' : ev.side}
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
                <p key={k}>{d}</p>
              ))}
            </div>
            <div className="measure">
              <div className="measure-head">
                <h3>Vitesse en chasse</h3>
                <span className="val">{ghost.speed.summary}</span>
              </div>
              <SpeedChart ghost={ghost} />
              {ghost.speed.details.map((d, k) => (
                <p key={k}>{d}</p>
              ))}
              {speeds.length > 0 && (
                <p className="listen">
                  {speeds.map((v) => (
                    <PaperButton key={v} onClick={() => toggle(v)} pressed={playing === v}>
                      {playing === v ? 'Arrêter' : `Écouter ses pas · ${num(v)} m/s`}
                    </PaperButton>
                  ))}
                </p>
              )}
            </div>
          </section>

          <div className="ghost-actions">
            <TapeButton to={`/quiz?ghost=${ghost.id}`}>Me tester sur {ghost.name.length > 14 ? 'cette entité' : ghost.name}</TapeButton>
            <TypedLink to="/revision">
              {ghostCards.length} carte{ghostCards.length > 1 ? 's' : ''} dans ta pile
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

          {ghost.keyTells.length > 0 && (
            <section aria-labelledby="h-tells">
              <H id="h-tells">À retenir</H>
              <ol className="tells">
                {ghost.keyTells.map((t, k) => (
                  <li key={k}>
                    <CircledNumber n={k + 1} delay={0.5 + k * 0.15} />
                    <p>{t}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="h-zero">
            <H id="h-zero" count={definitive ? `${definitive} test${definitive > 1 ? 's' : ''} définitif${definitive > 1 ? 's' : ''}` : undefined}>
              Sans preuve
            </H>
            <p className="zero-intro">Ce qui {ghost.name.startsWith('Les ') ? 'les trahit' : 'la trahit'} même quand ton journal est vide.</p>
            {ghost.confirmationTests.length === 0 && <p className="muted">Pas de test de confirmation fiable : il faut éliminer les autres entités.</p>}
            {ghost.confirmationTests.map((t, k) => (
              <article className="protocol" key={k}>
                <div className="protocol-top">
                  <h3>Test n° {k + 1}</h3>
                  {t.definitive ? (
                    <Stamp small rotate={k % 2 ? 3 : -4}>
                      Définitif
                    </Stamp>
                  ) : (
                    <Stamp small tone="pencil" rotate={-1}>
                      Indice
                    </Stamp>
                  )}
                </div>
                <p>{t.text}</p>
              </article>
            ))}
            {ghost.eliminationTests.map((t, k) => (
              <p className="elim" key={k}>
                <b>Élimine</b>
                <span>{t.text}</span>
              </p>
            ))}
            {ghost.id !== 'the-mimic' && (
              <p className="mimic-note">Rappel : le Mimic peut copier ces comportements. Ses orbes, toujours présents, le trahissent.</p>
            )}
          </section>
          {confusions.length > 0 && (
            <div className="turn">
              la suite : ses sosies
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
      <Notebook className="notebook--cont">
        <Page side="left" section="3" label="Ne pas confondre">
          <FileHead>
            <span>{ghost.name} · suite</span>
            <span>
              Fiche <b>{idx + 1}</b> / {GHOSTS.length}
            </span>
          </FileHead>
          <section aria-labelledby="h-conf">
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
                      <p>{c.why}</p>
                    </li>
                  ))}
                </ul>
                {twoShared.length > 4 && (
                  <button className="link conf-more" type="button" aria-expanded={moreConf} onClick={() => setMoreConf((v) => !v)}>
                    {moreConf ? 'Replier la liste' : `Voir les ${twoShared.length - 4} autres`}
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
                      <p>{c.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {ghost.tells.length + ghost.behaviors.length + ghost.abilities.length > 0 && (
            <section aria-labelledby="h-signs">
              <H id="h-signs">Signes et comportements</H>
              {ghost.tells.length > 0 && (
                <div className="conf-group">
                  <h3>Signes distinctifs</h3>
                  <Lines items={ghost.tells} />
                </div>
              )}
              {ghost.behaviors.length > 0 && (
                <div className="conf-group">
                  <h3>Comportements</h3>
                  <Lines items={ghost.behaviors} />
                </div>
              )}
              {ghost.abilities.length > 0 && (
                <div className="conf-group">
                  <h3>Capacités</h3>
                  <Lines items={ghost.abilities} />
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
                    <p>{o.text}</p>
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

          <section aria-labelledby="h-coach">
            <H id="h-coach">{coach ? `Notes de ${coach}` : 'Notes du coach'}</H>
            <div className="ghost-side">
              {notes.map((n, k) => (
                <Sticky key={n.id} rotate={k % 2 ? 1.6 : -1.8} meta={`${SHORT.format(n.createdAt)}${n.asCard ? ' · en révision' : ''}`} sign={n.author ? `— ${n.author}` : undefined}>
                  <strong className="sticky-title">{n.title}</strong>
                  {n.body && <span className="pre sticky-body">{n.body}</span>}
                </Sticky>
              ))}
              <NoteEditor key={ghost.id} ghostId={ghost.id} compact />

              <div className="libcard settle" style={{ '--r': '1.6deg', '--d': '.6s' } as Style}>
                <Tape />
                <h3>Fiche de suivi</h3>
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
                      <span className="d">{DATE.format(h.t)}</span>
                      <span className={`res${h.g === 1 ? ' bad' : ''}`}>{GRADE_WORD[h.g]}</span>
                    </li>
                  ))}
                  {nextDue && (
                    <li className="next" style={{ '--r': '-3deg' } as Style}>
                      <span className="d">À revoir le {SHORT.format(Math.max(nextDue, Date.now()))}</span>
                      <span className="res" />
                    </li>
                  )}
                </ol>
              </div>
            </div>
          </section>

          <p className="sources">
            {masteryLevel(m).label} · {ghost.sources.length} source{ghost.sources.length > 1 ? 's' : ''} consultée{ghost.sources.length > 1 ? 's' : ''}
            {ghost.changes.length > 0 && <> · Changements récents : {ghost.changes.join(' ')}</>}
            {ghost.uncertain.length > 0 && <> · À vérifier en partie : {ghost.uncertain.join(' ')}</>}
          </p>
          <nav className="pager" aria-label="Fiches voisines">
            <TypedLink to={`/codex/${prev.id}`}>‹ {prev.name}</TypedLink>
            <TypedLink to={`/codex/${next.id}`}>{next.name} ›</TypedLink>
          </nav>
          <span className="folio">— {folio + 3} —</span>
        </Page>
      </Notebook>
    </div>
  )
}
