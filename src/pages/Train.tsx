import { useMemo, type CSSProperties } from 'react'
import { Consigne, Envelope, FileHead, Notebook, Page, RoughCircle, Tape, TapeButton } from '../components/journal/Journal'
import { GHOSTS, MECHANICS } from '../data'
import { fr, NBSP, NNBSP, safeDate } from '../engine/format'
import { buildReviewQueue } from '../engine/progress'
import { cardMastery } from '../engine/srs'
import type { Activity } from '../store/schema'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'
import { EXHIBITS } from './exhibits'
import { isRetained } from '../engine/cards'

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
const NOT_YET = 'pas encore fait'

/** « 10 questions · ≈ 3 min » : chaque morceau reste d'un bloc, la ligne ne se coupe qu'après un « · ». */
const metaLine = (meta: string) =>
  meta
    .split(' · ')
    .map((seg) => seg.replace(/ /g, NBSP))
    .join(`${NBSP}· `)

/**
 * #/entrainement, « Exercices » : ce qu'on fait (révision, contrat, quiz, oreille), puis ce qu'on lit
 * (mécaniques, codex). Chaque enveloppe dit ce qu'on y fait, combien de temps, et le geste pour l'ouvrir.
 */
export function Train() {
  const { state, deck } = useStore()
  const mastery = useMastery()
  const due = useMemo(() => buildReviewQueue(state, deck, Date.now()).length, [state, deck])

  const lastOf = (kind: Activity['kind']) => [...state.activity].reverse().find((a) => a.kind === kind)
  const lastQuiz = lastOf('quiz')
  const lastScenario = lastOf('scenario')
  const lastEar = lastOf('ear')
  const recent = state.activity.slice(-4).reverse()
  // seulement les faits à retenir : ceux « bons à savoir » (relever les preuves) ne comptent pas
  const facts = MECHANICS.topics.flatMap((t) => t.facts).filter(isRetained)
  const factsLearned = facts.filter((f) => cardMastery(state.cards[`m:${f.id}`]) >= 0.35).length
  const acquired = GHOSTS.filter((g) => (mastery[g.id] ?? 0) >= 0.85).length
  const lastDate = recent[0] ? safeDate(SHORT, recent[0].t, '') : ''

  return (
    <div className="tr">
      <Notebook single>
        <Page section="4" label="Exercices">
          <FileHead>
            <span>
              Dossier <b>Exercices</b>
            </span>
            <span>4 exercices · 2 à lire</span>
            <span>{lastDate ? `Dernier exercice le ${lastDate}` : 'Aucun exercice pour l’instant'}</span>
          </FileHead>

          {/* titre et consigne à gauche, historique à droite ; la bande Dymo a toute la largeur en dessous */}
          <div className="tr-head tr-grid">
            <h1 className="entry-date tr-title">
              <em>Le tiroir des</em>
              exercices
            </h1>
            <Consigne className="tr-consigne">{fr('choisis une enveloppe et touche-la pour l’ouvrir ; pas d’idée ? commence par la révision du jour')}</Consigne>
            <div className="tr-go">
              {due > 0 ? (
                <TapeButton to={EXHIBITS.revision.to}>
                  Réviser mes {due} question{due > 1 ? 's' : ''}
                </TapeButton>
              ) : (
                <TapeButton to={EXHIBITS.situation.to}>Prendre un contrat</TapeButton>
              )}
            </div>
            <p className="tr-down pencil-note" aria-hidden>
              les enveloppes sont juste en dessous
              <svg className="draw" width="46" height="52" viewBox="0 0 46 52">
                <path d="M10 2 C 2 18, 8 34, 30 46" strokeWidth="2" pathLength={1} style={{ '--d': '.9s' } as Style} />
                <path d="M19 47 L31 47 L27 36" strokeWidth="2" pathLength={1} style={{ '--d': '1.5s', '--dur': '.3s' } as Style} />
              </svg>
            </p>

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

      <div className="desk-shelf tr-shelf tr-shelves">
        {/* ===================== à faire : les exercices ===================== */}
        <section className="tr-row" aria-labelledby="h-tr-do">
          <h2 className="shelf-label" id="h-tr-do">
            À faire · exercices
          </h2>
          <div className="envelopes">
            <Envelope
              to={EXHIBITS.revision.to}
              piece={piece(EXHIBITS.revision.n)}
              title={EXHIBITS.revision.title}
              text={fr(EXHIBITS.revision.what)}
              meta={metaLine(EXHIBITS.revision.meta)}
              action={EXHIBITS.revision.action}
              hand={
                due ? (
                  <>
                    <RoughCircle seed="tr-due" padX={0.2} padY={0.08} delay={0.9}>
                      {due}
                    </RoughCircle>{' '}
                    question{due > 1 ? 's' : ''} aujourd’hui
                  </>
                ) : (
                  'à jour pour aujourd’hui'
                )
              }
              rotate={-1.4}
              delay={0.15}
            />
            <Envelope
              to={EXHIBITS.situation.to}
              piece={piece(EXHIBITS.situation.n)}
              title={EXHIBITS.situation.title}
              text={fr(EXHIBITS.situation.what)}
              meta={metaLine(EXHIBITS.situation.meta)}
              action={EXHIBITS.situation.action}
              hand={lastScenario ? `dernier contrat${NNBSP}: ${scoreOf(lastScenario)}` : NOT_YET}
              rotate={1.1}
              labelRotate={-0.8}
              delay={0.22}
            />
            <Envelope
              to={EXHIBITS.quiz.to}
              piece={piece(EXHIBITS.quiz.n)}
              title={EXHIBITS.quiz.title}
              text={fr(EXHIBITS.quiz.what)}
              meta={metaLine(EXHIBITS.quiz.meta)}
              action={EXHIBITS.quiz.action}
              hand={lastQuiz ? `dernier${NNBSP}: ${scoreOf(lastQuiz)}` : NOT_YET}
              rotate={-0.7}
              delay={0.29}
            />
            <Envelope
              to={EXHIBITS.oreille.to}
              piece={piece(EXHIBITS.oreille.n)}
              title={EXHIBITS.oreille.title}
              text={fr(EXHIBITS.oreille.what)}
              meta={metaLine(EXHIBITS.oreille.meta)}
              action={EXHIBITS.oreille.action}
              hand={lastEar ? `dernière série${NNBSP}: ${scoreOf(lastEar)}` : NOT_YET}
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
          </div>
        </section>

        {/* ===================== à lire : les références ===================== */}
        <section className="tr-row tr-row--read" aria-labelledby="h-tr-read">
          <div className="tr-row-head">
            <h2 className="shelf-label" id="h-tr-read">
              À lire · références
            </h2>
            {/* sur téléphone, Mécaniques n'a pas d'onglet : c'est ici qu'on le trouve */}
            <p className="pencil-note tr-phone-only">{fr('sur téléphone, les Mécaniques n’ont pas d’onglet : elles sont rangées ici')}</p>
          </div>
          <div className="envelopes">
            <Envelope
              to={EXHIBITS.mecaniques.to}
              piece={piece(EXHIBITS.mecaniques.n)}
              title={EXHIBITS.mecaniques.title}
              text={fr(EXHIBITS.mecaniques.what)}
              meta={metaLine(EXHIBITS.mecaniques.meta)}
              action={EXHIBITS.mecaniques.action}
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
              text={fr(EXHIBITS.codex.what)}
              meta={metaLine(EXHIBITS.codex.meta)}
              action={EXHIBITS.codex.action}
              hand={acquired ? `${acquired} acquise${acquired > 1 ? 's' : ''} sur ${GHOSTS.length}` : undefined}
              rotate={0.9}
              labelRotate={0.7}
              delay={0.5}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
