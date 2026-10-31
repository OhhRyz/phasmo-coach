import { useMemo, type CSSProperties } from 'react'
import { Envelope, FileHead, Notebook, Page, RoughCircle, Tape } from '../components/journal/Journal'
import { GHOSTS, MECHANICS } from '../data'
import { buildReviewQueue } from '../engine/progress'
import { cardMastery } from '../engine/srs'
import type { Activity } from '../store/schema'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

type Style = CSSProperties & Record<`--${string}`, string | number>

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

function scoreOf(a: Activity): string {
  return a.kind === 'scenario' ? `${a.score} pts` : `${a.score}/${a.total}`
}

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

  return (
    <div className="tr">
      <Notebook single>
        <Page section="4" label="S’entraîner">
          <FileHead>
            <span>
              Dossier <b>S’entraîner</b>
            </span>
            <span>6 pièces</span>
            <span>{recent[0] ? `Dernier exercice le ${SHORT.format(recent[0].t)}` : 'Aucun exercice encore'}</span>
          </FileHead>

          <div className="tr-head">
            <div className="tr-intro">
              <h1 className="entry-date tr-title">
                <em>S’entraîner</em>
                Six pièces à étudier
              </h1>
              <div className="tr-memo">
                <p className="tr-memo-obj">
                  <b>Objet :</b> l’entraînement du jour
                </p>
                <p>
                  La révision fixe les connaissances, les enquêtes apprennent à s’en servir. Un peu des deux chaque jour, c’est
                  l’idéal.
                </p>
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
                <span>Le</span>
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
                    <span className="d">{SHORT.format(a.t)}</span>
                    <span className="what">{a.label}</span>
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
          Exercices · 6 pièces
        </h2>
        <div className="envelopes">
          <Envelope
            to="/revision"
            piece="Pièce n° 1"
            title="Révision du jour"
            text={
              due ? `${due} carte${due > 1 ? 's' : ''} t’attendent. Les cartes reviennent juste avant d’être oubliées.` : 'À jour pour aujourd’hui.'
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
                'rien d’échu'
              )
            }
            rotate={-1.4}
            delay={0.15}
          />
          <Envelope
            to="/enquete"
            piece="Pièce n° 2"
            title="Mise en situation"
            text="Une enquête simulée : indices au fil du contrat, carnet de preuves, élimination."
            hand={lastScenario ? `dernière : ${lastScenario.score} pts` : 'jamais ouverte'}
            rotate={1.1}
            labelRotate={-0.8}
            delay={0.22}
          />
          <Envelope
            to="/quiz"
            piece="Pièce n° 3"
            title="Quiz"
            text="Preuves, vitesses, seuils de chasse, comportements, tests sans preuve."
            hand={lastQuiz ? `dernier : ${lastQuiz.score}/${lastQuiz.total}` : 'jamais ouvert'}
            rotate={-0.7}
            delay={0.29}
          />
          <Envelope
            to="/oreille"
            piece="Pièce n° 4"
            title="À l’oreille"
            text="Reconnaître la vitesse d’une entité au rythme de ses pas."
            hand={lastEar ? `dernière : ${lastEar.score}/${lastEar.total}` : 'au casque, c’est mieux'}
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
            to="/mecaniques"
            piece="Pièce n° 5"
            title="Mécaniques"
            text="Chasses, encens, équipement et idées reçues."
            hand={`${factsLearned}/${facts.length} faits retenus`}
            rotate={-1.1}
            labelRotate={-0.5}
            delay={0.43}
          />
          <Envelope
            to="/codex"
            piece="Pièce n° 6"
            title="Codex"
            text={`Les ${GHOSTS.length} fiches : preuves, vitesses, seuils et tests sans preuve.`}
            hand={acquired ? `${acquired} acquise${acquired > 1 ? 's' : ''} sur ${GHOSTS.length}` : 'tout est dedans'}
            rotate={0.9}
            labelRotate={0.7}
            delay={0.5}
          />
        </div>
      </section>
    </div>
  )
}
