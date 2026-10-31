import { useMemo, type CSSProperties } from 'react'
import { Envelope, FileHead, Notebook, Page, RoughCircle, Tape, TapeButton } from '../components/journal/Journal'
import { GHOSTS, MECHANICS } from '../data'
import { NBSP, NNBSP, safeDate } from '../engine/format'
import { buildReviewQueue } from '../engine/progress'
import { cardMastery } from '../engine/srs'
import type { Activity } from '../store/schema'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'
import { EXHIBITS } from './exhibits'

type Style = CSSProperties & Record<`--${string}`, string | number>

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

function scoreOf(a: Activity): string {
  return a.kind === 'scenario' ? `${a.score}${NBSP}pts` : `${a.score}/${a.total}`
}

/** Le nom de l'exercice dans l'historique, quel que soit le libellé enregistré à l'époque. */
const KIND_LABEL: Record<string, string> = {
  review: 'Révision',
  quiz: EXHIBITS.quiz.title,
  ear: EXHIBITS.oreille.title,
  scenario: EXHIBITS.situation.title,
}

const piece = (n: number) => `Pièce n°${NBSP}${n}`
const COUNT = Object.keys(EXHIBITS).length

export function Train() {
  const { state, deck } = useStore()
  const mastery = useMastery()
  const due = useMemo(() => buildReviewQueue(state, deck, Date.now()).length, [state, deck])

  const lastOf = (kind: Activity['kind']) => [...state.activity].reverse().find((a) => a.kind === kind)
  const lastQuiz = lastOf('quiz')
  const lastScenario = lastOf('scenario')
  const lastEar = lastOf('ear')
  const recent = state.activity.slice(-4).reverse()
  const facts = MECHANICS.topics.flatMap((t) => t.facts)
  const factsLearned = facts.filter((f) => cardMastery(state.cards[`m:${f.id}`]) >= 0.35).length
  const acquired = GHOSTS.filter((g) => (mastery[g.id] ?? 0) >= 0.85).length
  const lastDate = recent[0] ? safeDate(SHORT, recent[0].t, '') : ''

  return (
    <div className="tr">
      <Notebook single>
        <Page section="4" label="S’entraîner">
          <FileHead>
            <span>
              Dossier <b>S’entraîner</b>
            </span>
            <span>{COUNT} pièces</span>
            <span>{lastDate ? `Dernier exercice le ${lastDate}` : 'Aucun exercice pour l’instant'}</span>
          </FileHead>

          <div className="tr-head">
            <div className="tr-intro">
              <h1 className="entry-date tr-title">
                <em>S’entraîner</em>
                Six pièces à étudier
              </h1>
              <div className="tr-memo">
                <p className="tr-memo-obj">
                  <b>Objet{NNBSP}:</b> l’entraînement du jour
                </p>
                <p>La révision fixe les connaissances{NNBSP}; les mises en situation apprennent à s’en servir.</p>
              </div>
              <div className="tr-go">
                {due > 0 ? (
                  <TapeButton to={EXHIBITS.revision.to}>Ouvrir la séance</TapeButton>
                ) : (
                  <TapeButton to={EXHIBITS.situation.to}>Ouvrir un contrat</TapeButton>
                )}
              </div>
              <p className="tr-down pencil-note" aria-hidden>
                les pièces sont juste en dessous
                <svg className="draw" width="46" height="52" viewBox="0 0 46 52">
                  <path d="M10 2 C 2 18, 8 34, 30 46" strokeWidth="2" pathLength={1} style={{ '--d': '.9s' } as Style} />
                  <path d="M19 47 L31 47 L27 36" strokeWidth="2" pathLength={1} style={{ '--d': '1.5s', '--dur': '.3s' } as Style} />
                </svg>
              </p>
            </div>

            <div className="libcard tr-libcard settle" style={{ '--r': '1.4deg', '--d': '.3s' } as Style}>
              <Tape />
              <h2>Derniers exercices</h2>
              <div className="cols">
                <span>Date</span>
                <span>Exercice</span>
                <span>Note</span>
              </div>
              <ol>
                {recent.length === 0 && (
                  <li>
                    <span className="d">—</span>
                    <span className="what">pas encore d’exercice</span>
                    <span className="res" />
                  </li>
                )}
                {recent.map((a, k) => (
                  <li key={`${a.t}-${k}`} style={{ '--r': `${[-2, 1, -1, 2][k]}deg` } as Style}>
                    <span className="d">{safeDate(SHORT, a.t)}</span>
                    <span className="what">{KIND_LABEL[a.kind] ?? a.label}</span>
                    <span className="res">{scoreOf(a)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Page>
      </Notebook>

      <section className="desk-shelf tr-shelf" aria-labelledby="h-tr-shelf">
        <h2 className="shelf-label" id="h-tr-shelf">
          Exercices · {COUNT} pièces
        </h2>
        <div className="envelopes">
          <Envelope
            to={EXHIBITS.revision.to}
            piece={piece(EXHIBITS.revision.n)}
            title={EXHIBITS.revision.title}
            text={
              due
                ? `${due} carte${due > 1 ? 's t’attendent' : ' t’attend'}. Les cartes reviennent juste avant d’être oubliées.`
                : 'À jour pour aujourd’hui.'
            }
            hand={
              due ? (
                <>
                  <RoughCircle seed="tr-due" padX={0.2} padY={0.08} delay={0.9}>
                    {due}
                  </RoughCircle>{' '}
                  à revoir
                </>
              ) : (
                'rien à revoir'
              )
            }
            rotate={-1.4}
            delay={0.15}
          />
          <Envelope
            to={EXHIBITS.situation.to}
            piece={piece(EXHIBITS.situation.n)}
            title={EXHIBITS.situation.title}
            text={`Un contrat simulé${NNBSP}: les rapports arrivent un à un, tu coches les preuves et tu élimines.`}
            hand={lastScenario ? `dernier contrat${NNBSP}: ${scoreOf(lastScenario)}` : 'jamais ouverte'}
            rotate={1.1}
            labelRotate={-0.8}
            delay={0.22}
          />
          <Envelope
            to={EXHIBITS.quiz.to}
            piece={piece(EXHIBITS.quiz.n)}
            title={EXHIBITS.quiz.title}
            text="Preuves, vitesses, seuils de chasse, comportements, tests sans preuve."
            hand={lastQuiz ? `dernier${NNBSP}: ${scoreOf(lastQuiz)}` : 'jamais ouvert'}
            rotate={-0.7}
            delay={0.29}
          />
          <Envelope
            to={EXHIBITS.oreille.to}
            piece={piece(EXHIBITS.oreille.n)}
            title={EXHIBITS.oreille.title}
            text="Reconnaître la vitesse d’une entité au rythme de ses pas."
            hand={lastEar ? `dernière série${NNBSP}: ${scoreOf(lastEar)}` : 'jamais ouverte'}
            rotate={1.6}
            labelRotate={0.4}
            delay={0.36}
          >
            <svg viewBox="0 0 170 22" className="steps-doodle" aria-hidden>
              <g fill="currentColor">
                {[8, 30, 52, 74, 91, 106, 119, 131, 142, 152, 162].map((x, i) => (
                  <ellipse key={x} cx={x} cy={i % 2 ? 7 : 15} rx="4.5" ry="2.6" />
                ))}
              </g>
            </svg>
          </Envelope>
          <Envelope
            to={EXHIBITS.mecaniques.to}
            piece={piece(EXHIBITS.mecaniques.n)}
            title={EXHIBITS.mecaniques.title}
            text="Chasses, encens, équipement et idées reçues."
            hand={
              factsLearned
                ? `${factsLearned} fait${factsLearned > 1 ? 's' : ''} retenu${factsLearned > 1 ? 's' : ''} sur ${facts.length}`
                : 'aucun fait retenu'
            }
            rotate={-1.1}
            labelRotate={-0.5}
            delay={0.43}
          />
          <Envelope
            to={EXHIBITS.codex.to}
            piece={piece(EXHIBITS.codex.n)}
            title={EXHIBITS.codex.title}
            text={`Les ${GHOSTS.length} fiches${NNBSP}: preuves, vitesses, seuils et tests sans preuve.`}
            hand={acquired ? `${acquired} acquise${acquired > 1 ? 's' : ''} sur ${GHOSTS.length}` : `${GHOSTS.length} fiches`}
            rotate={0.9}
            labelRotate={0.7}
            delay={0.5}
          />
        </div>
      </section>
    </div>
  )
}
