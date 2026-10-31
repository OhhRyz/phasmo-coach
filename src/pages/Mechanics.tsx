import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Empty, PageHeader } from '../components/ui'
import { MECHANICS } from '../data'
import type { TopicIcon } from '../data/types'
import { cardMastery } from '../engine/srs'
import { useStore } from '../store/store'

const TOPIC_ICON: Record<TopicIcon, IconName> = {
  hunt: 'skull',
  smudge: 'candle',
  equipment: 'emf',
  evidence: 'search',
  myth: 'bulb',
  cursed: 'sparkles',
  sanity: 'pulse',
  speed: 'zap',
}

export function MechanicsPage() {
  const { state } = useStore()
  const topics = MECHANICS.topics
  const [active, setActive] = useState(topics[0]?.id ?? '')
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const topic = topics.find((t) => t.id === active)

  if (!topics.length) {
    return (
      <div className="page narrow">
        <PageHeader eyebrow="Savoir" title="Mécaniques" />
        <Empty icon="compass" title="Contenu en préparation" />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Savoir"
        title="Mécaniques du jeu"
        actions={
          <Link to="/quiz?topic=mechanics" className="btn btn-primary">
            <Icon name="quiz" size={18} />
            Vrai ou faux
          </Link>
        }
      >
        Ce qui ne dépend pas d’une entité précise mais change tout : chasses, encens, équipement, idées reçues. Ces fiches sont
        aussi dans ta révision espacée.
      </PageHeader>

      <div className="mech-layout">
        <nav className="mech-nav" aria-label="Thèmes">
          {topics.map((t) => {
            const learned = t.facts.filter((f) => cardMastery(state.cards[`m:${f.id}`]) >= 0.35).length
            return (
              <button key={t.id} type="button" className={`mech-tab${t.id === active ? ' active' : ''}`} onClick={() => setActive(t.id)}>
                <Icon name={TOPIC_ICON[t.icon] ?? 'compass'} size={18} />
                <span>{t.title}</span>
                <span className="faint mono">
                  {learned}/{t.facts.length}
                </span>
              </button>
            )
          })}
        </nav>

        <section className="stack">
          {topic?.facts.map((f) => (
            <article key={f.id} className="card card-pad fact">
              <p>{f.text}</p>
              <button type="button" className="fact-q" onClick={() => setShown((s) => ({ ...s, [f.id]: !s[f.id] }))} aria-expanded={!!shown[f.id]}>
                <Icon name="layers" size={14} />
                <span>{f.q}</span>
                <Icon name="chevronDown" size={14} style={{ marginLeft: 'auto', transform: shown[f.id] ? 'rotate(180deg)' : undefined }} />
              </button>
              {shown[f.id] && <p className="fact-a">{f.a}</p>}
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}
