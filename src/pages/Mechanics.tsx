import { useRef, useState, type CSSProperties } from 'react'
import { FileHead, H, Notebook, Page, RoughCircle, TapeButton, TypedLink } from '../components/journal/Journal'
import { Empty } from '../components/ui'
import { MECHANICS } from '../data'
import { NNBSP } from '../engine/format'
import { cardMastery } from '../engine/srs'
import { useStore } from '../store/store'

type Style = CSSProperties & Record<`--${string}`, string | number>

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']
const SLIP_TILT = [-0.6, 0.45, -0.25, 0.7, -0.45, 0.3]

export function MechanicsPage() {
  const { state } = useStore()
  const topics = MECHANICS.topics
  const [active, setActive] = useState(topics[0]?.id ?? '')
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const topic = topics.find((t) => t.id === active)
  const factsRef = useRef<HTMLElement>(null)

  if (!topics.length) {
    return (
      <Notebook single>
        <Page section="5">
          <Empty title="Contenu en préparation" />
        </Page>
      </Notebook>
    )
  }

  const learnedIn = (t: (typeof topics)[number]) => t.facts.filter((f) => cardMastery(state.cards[`m:${f.id}`]) >= 0.35).length
  const totalFacts = topics.reduce((n, t) => n + t.facts.length, 0)
  const totalLearned = topics.reduce((n, t) => n + learnedIn(t), 0)
  const idx = topics.findIndex((t) => t.id === active)
  const prev = idx > 0 ? topics[idx - 1] : null
  const next = idx >= 0 && idx < topics.length - 1 ? topics[idx + 1] : null
  const learned = topic ? learnedIn(topic) : 0

  /** Change de chapitre, puis ramène la page de droite sous les yeux si elle n'y est plus. */
  const open = (id: string) => {
    setActive(id)
    requestAnimationFrame(() => {
      const el = factsRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      const stacked = matchMedia('(max-width: 1180px)').matches
      if (top < 0 || (stacked && top > innerHeight * 0.5)) {
        const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
      }
    })
  }

  return (
    <Notebook className="mech">
      {/* ===================== page de gauche : le sommaire ===================== */}
      <Page side="left" section="5" label="Sommaire des mécaniques">
        <FileHead>
          <span>Mécaniques</span>
          <span>Manuel de terrain</span>
          <span>
            {totalLearned ? (
              <>
                <b>{totalLearned}</b> / {totalFacts} {totalLearned > 1 ? 'faits retenus' : 'fait retenu'}
              </>
            ) : (
              <>aucun fait retenu sur {totalFacts}</>
            )}
          </span>
        </FileHead>

        <header className="mech-entry">
          <h1 className="entry-date mech-title">
            <em>Mécaniques</em>
            Le manuel de terrain
          </h1>
          <p className="mech-lead">
            Ce qui ne dépend pas d’une entité précise mais change tout{NNBSP}: chasses, encens, équipement, idées reçues.{' '}
            {state.settings.includeMechanics
              ? 'Ces faits font aussi partie de ta révision.'
              : 'Ces faits ne sont pas dans ta révision (option du profil).'}
          </p>
        </header>

        <div className="mech-side">
          <nav className="mech-toc" aria-labelledby="h-mech-toc">
            <H id="h-mech-toc" count={`${topics.length} chapitres`}>
              Sommaire
            </H>
            <p className="mech-toc-legend">
              <span className="pencil-note">au crayon</span> : les faits déjà retenus en révision
            </p>
            <ol>
              {topics.map((t, k) => {
                const on = t.id === active
                const n = learnedIn(t)
                return (
                  <li key={t.id}>
                    <button type="button" className={`mech-toc-btn${on ? ' is-on' : ''}`} onClick={() => open(t.id)} aria-pressed={on}>
                      <span className="mech-toc-n">{ROMAN[k] ?? k + 1}.</span>
                      <span className="mech-toc-t">
                        {on ? (
                          <RoughCircle seed={`toc-${t.id}`} padX={0.02} padY={0.3} delay={0.05}>
                            {t.title}
                          </RoughCircle>
                        ) : (
                          t.title
                        )}
                      </span>
                      <span className="mech-toc-dots" aria-hidden />
                      <span className="mech-toc-c pencil-note">
                        {n}/{t.facts.length}
                        <span className="sr-only"> retenus</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>

          {MECHANICS.trueFalse.length > 0 && (
            <div className="mech-quiz">
              <TapeButton to="/quiz?topic=mechanics">Vrai ou faux ({MECHANICS.trueFalse.length})</TapeButton>
            </div>
          )}
        </div>
        <span className="folio">— sommaire —</span>
      </Page>

      {/* ===================== page de droite : le chapitre ===================== */}
      <Page side="right" section="5" label={topic ? `Chapitre${NNBSP}: ${topic.title}` : 'Chapitre'}>
        <FileHead>
          <span>
            Chapitre <b>{ROMAN[idx] ?? idx + 1}</b> / {ROMAN[topics.length - 1] ?? topics.length}
          </span>
          <span>{topic ? `${topic.facts.length} faits à retenir` : ''}</span>
        </FileHead>

        <section className="mech-chapter" ref={factsRef} aria-labelledby="h-mech-facts">
          <H id="h-mech-facts" count={topic ? (learned ? `${learned} retenu${learned > 1 ? 's' : ''} sur ${topic.facts.length}` : `aucun retenu sur ${topic.facts.length}`) : undefined}>
            {topic?.title}
          </H>
          <p className="mech-hint pencil-note">Sous chaque fait, sa question{NNBSP}: déplie le papier pour la réponse.</p>
          <ol className="mech-facts">
            {topic?.facts.map((f, k) => (
              <li key={f.id}>
                <span className="mech-fact-n" aria-hidden>
                  § {k + 1}
                </span>
                <div className="mech-fact-body">
                  <p className="mech-fact">{f.text}</p>
                  <div className={`slip${shown[f.id] ? ' is-open' : ''}`} style={{ '--r': `${SLIP_TILT[k % SLIP_TILT.length]}deg` } as Style}>
                    <button
                      type="button"
                      className="slip-q"
                      onClick={() => setShown((s) => ({ ...s, [f.id]: !s[f.id] }))}
                      aria-expanded={!!shown[f.id]}
                      aria-controls={`slip-a-${f.id}`}
                    >
                      <span className="slip-tag" aria-hidden>
                        Q.
                      </span>
                      <span className="slip-text">{f.q}</span>
                      <span className="slip-fold" aria-hidden>
                        {shown[f.id] ? 'replier' : 'déplier'}
                      </span>
                    </button>
                    {shown[f.id] && (
                      <p className="slip-a" id={`slip-a-${f.id}`}>
                        <span className="slip-tag" aria-hidden>
                          R.
                        </span>
                        <span>{f.a}</span>
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <nav className="mech-pager" aria-label="Chapitres voisins">
          {prev ? <TypedLink onClick={() => open(prev.id)}>‹ {prev.title}</TypedLink> : <span />}
          {next ? <TypedLink onClick={() => open(next.id)}>{next.title} ›</TypedLink> : <span />}
        </nav>
        <span className="folio">— {idx + 1} —</span>
      </Page>
    </Notebook>
  )
}
