import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, PageHead } from '../components/ui'
import { MECHANICS } from '../data'
import { cardMastery } from '../engine/srs'
import { useStore } from '../store/store'

export function MechanicsPage() {
  const { state } = useStore()
  const topics = MECHANICS.topics
  const [active, setActive] = useState(topics[0]?.id ?? '')
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const topic = topics.find((t) => t.id === active)

  if (!topics.length) {
    return (
      <div className="page narrow">
        <Empty title="Contenu en préparation" />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHead
        title="Mécaniques"
        actions={
          <Link to="/quiz?topic=mechanics" className="btn">
            Vrai ou faux sur les mécaniques
          </Link>
        }
      >
        Ce qui ne dépend pas d’une entité précise mais change tout : chasses, encens, équipement, idées reçues. Ces fiches font
        aussi partie de ta révision.
      </PageHead>

      <div className="mech-layout">
        <nav className="mech-nav" aria-label="Thèmes">
          {topics.map((t) => {
            const learned = t.facts.filter((f) => cardMastery(state.cards[`m:${f.id}`]) >= 0.35).length
            return (
              <button key={t.id} type="button" className={t.id === active ? 'active' : undefined} onClick={() => setActive(t.id)} aria-pressed={t.id === active}>
                <span>{t.title}</span>
                <span className="pct">
                  {learned}/{t.facts.length}
                </span>
              </button>
            )
          })}
        </nav>

        <section>
          <h2 style={{ marginBottom: 14 }}>{topic?.title}</h2>
          <ol className="facts-list">
            {topic?.facts.map((f) => (
              <li key={f.id}>
                <p>{f.text}</p>
                <p className="small">
                  <button type="button" className="link-btn muted-link" onClick={() => setShown((s) => ({ ...s, [f.id]: !s[f.id] }))} aria-expanded={!!shown[f.id]}>
                    {f.q}
                  </button>
                  {shown[f.id] && <span className="fact-a"> {f.a}</span>}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
