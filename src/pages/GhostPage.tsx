import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GhostStats } from '../components/GhostCard'
import { Icon } from '../components/Icon'
import { NoteEditor } from '../components/NoteEditor'
import { Empty, GhostEvidence, GhostSigil, MasteryRing, Seg } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { EVIDENCE } from '../data/evidence'
import type { TextItem } from '../data/types'
import { createFootsteps, type Footsteps } from '../engine/audio'
import { num } from '../engine/format'
import { masteryLevel } from '../engine/progress'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

type Tab = 'profil' | 'zero' | 'confusions' | 'notes'

function ItemList({ items, label }: { items: TextItem[]; label: string }) {
  if (!items.length) return null
  return (
    <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
      <h3 className="section-label">{label}</h3>
      <ul className="bullets">
        {items.map((i, k) => (
          <li key={k}>
            {i.text}
            {i.zeroEvidence && <span className="chip chip-accent tiny">0 preuve</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function GhostPage() {
  const { id = '' } = useParams()
  const ghost = getGhost(id)
  const navigate = useNavigate()
  const mastery = useMastery()
  const { state } = useStore()
  const [tab, setTab] = useState<Tab>('profil')
  const [playing, setPlaying] = useState<number | null>(null)
  const steps = useRef<Footsteps | null>(null)

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(null))
    return () => steps.current?.stop()
  }, [])
  useEffect(() => {
    setTab('profil')
    steps.current?.stop()
  }, [id])

  const notes = useMemo(() => state.notes.filter((n) => n.ghostId === id), [state.notes, id])

  if (!ghost) {
    return (
      <div className="page narrow">
        <Empty icon="ghost" title="Entité introuvable">
          <Link to="/codex" className="btn">
            Retour au codex
          </Link>
        </Empty>
      </div>
    )
  }

  const idx = GHOSTS.findIndex((g) => g.id === ghost.id)
  const prev = GHOSTS[(idx - 1 + GHOSTS.length) % GHOSTS.length]
  const next = GHOSTS[(idx + 1) % GHOSTS.length]
  const m = mastery[ghost.id] ?? 0
  const lvl = masteryLevel(m)
  const speeds = [ghost.speed.min, ghost.speed.max, ghost.speed.alt].filter((v): v is number => v != null && v > 0)

  const toggle = (v: number) => {
    if (playing === v) {
      steps.current?.stop()
      return
    }
    steps.current?.play(v, 8)
    setPlaying(v)
  }

  return (
    <div className="page">
      <Link to="/codex" className="back-link">
        <Icon name="chevronLeft" size={16} /> Codex
      </Link>

      <section className="ghost-hero card">
        <div className="ghost-hero-main">
          <GhostSigil ghost={ghost} mastery={m} size={64} />
          <div className="stack" style={{ '--gap': '8px', minWidth: 0 } as React.CSSProperties}>
            <div>
              <h1>{ghost.name}</h1>
              {ghost.nameEn !== ghost.name && <div className="faint">{ghost.nameEn}</div>}
            </div>
            <p className="ghost-summary">{ghost.summary}</p>
            <GhostEvidence ghost={ghost} />
          </div>
        </div>
        <div className="ghost-hero-side">
          <MasteryRing value={m} size={64} />
          <div>
            <div className="faint" style={{ fontSize: '0.75rem' }}>
              Maîtrise
            </div>
            <strong>{lvl.label}</strong>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/quiz?ghost=${ghost.id}`)}>
            <Icon name="quiz" size={18} />
            Quiz sur {ghost.name.length > 12 ? 'cette entité' : ghost.name}
          </button>
        </div>
      </section>

      {ghost.keyTells.length > 0 && (
        <section className="card card-pad key-tells">
          <div className="card-title">
            <h2>
              <Icon name="star" size={18} />À retenir en priorité
            </h2>
          </div>
          <ol className="key-list">
            {ghost.keyTells.map((t, i) => (
              <li key={i}>
                <span className="key-num">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="ghost-cols">
        <section className="card card-pad">
          <div className="card-title">
            <h2>
              <Icon name="zap" size={18} />
              Vitesse
            </h2>
            <span className="chip mono">{ghost.speed.summary}</span>
          </div>
          {speeds.length > 0 && (
            <div className="row speed-play">
              {speeds.map((v) => (
                <button key={v} type="button" className={`btn btn-sm${playing === v ? ' btn-primary' : ''}`} onClick={() => toggle(v)}>
                  <Icon name={playing === v ? 'stop' : 'footsteps'} size={16} />
                  {num(v)} m/s
                </button>
              ))}
              <span className="faint" style={{ fontSize: '0.78rem' }}>
                Écoute le rythme des pas
              </span>
            </div>
          )}
          {ghost.speed.details.length > 0 && (
            <ul className="bullets">
              {ghost.speed.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="card card-pad">
          <div className="card-title">
            <h2>
              <Icon name="pulse" size={18} />
              Seuil de chasse
            </h2>
            <span className="chip mono">{ghost.huntSanity.summary}</span>
          </div>
          {ghost.huntSanity.details.length > 0 ? (
            <ul className="bullets">
              {ghost.huntSanity.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Seuil standard, sans condition particulière.</p>
          )}
        </section>
      </div>

      <div className="tabs-head">
        <Seg
          label="Sections de la fiche"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'profil', label: 'Comportements' },
            { value: 'zero', label: 'Tests 0 preuve' },
            { value: 'confusions', label: `Confusions (${ghost.confusions.length})` },
            { value: 'notes', label: `Notes du coach (${notes.length})` },
          ]}
        />
      </div>

      {tab === 'profil' && (
        <section className="card card-pad stack">
          <ItemList label="Signes distinctifs" items={ghost.tells} />
          <ItemList label="Comportements" items={ghost.behaviors} />
          <ItemList label="Capacités" items={ghost.abilities} />
          {!ghost.tells.length && !ghost.behaviors.length && !ghost.abilities.length && (
            <p className="muted">Pas de comportement particulier documenté.</p>
          )}
          <GhostStats ghost={ghost} />
        </section>
      )}

      {tab === 'zero' && (
        <section className="card card-pad stack">
          <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
            <h3 className="section-label">Tests de confirmation</h3>
            {ghost.confirmationTests.length ? (
              ghost.confirmationTests.map((t, i) => (
                <div key={i} className={`test-item${t.definitive ? ' definitive' : ''}`}>
                  <Icon name={t.definitive ? 'check' : 'info'} size={18} />
                  <div>
                    <p>{t.text}</p>
                    <span className="faint" style={{ fontSize: '0.75rem' }}>
                      {t.definitive ? 'Confirmation définitive' : 'Indice, pas une preuve absolue'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">Aucun test de confirmation fiable : élimine les autres entités.</p>
            )}
          </div>
          <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
            <h3 className="section-label">Tests d’élimination</h3>
            {ghost.eliminationTests.length ? (
              ghost.eliminationTests.map((t, i) => (
                <div key={i} className="test-item elim">
                  <Icon name="x" size={18} />
                  <p>{t.text}</p>
                </div>
              ))
            ) : (
              <p className="muted">Aucun test d’élimination documenté.</p>
            )}
          </div>
          {ghost.id === 'the-mimic' || (
            <p className="faint" style={{ fontSize: '0.78rem' }}>
              Rappel : le Mimic peut imiter les comportements d’autres entités, et donc fausser un test de confirmation.
            </p>
          )}
        </section>
      )}

      {tab === 'confusions' && (
        <section className="stack">
          {ghost.confusions.length === 0 && (
            <div className="card">
              <Empty icon="ghost" title="Pas de confusion fréquente" />
            </div>
          )}
          {ghost.confusions.map((c, i) => {
            const other = getGhost(c.with)
            if (!other) return null
            const shared = other.evidence.filter((e) => ghost.evidence.includes(e))
            return (
              <Link key={i} to={`/codex/${other.id}`} className="card card-pad card-hover confusion">
                <div className="row between">
                  <div className="row">
                    <GhostSigil ghost={other} mastery={mastery[other.id] ?? 0} size={36} />
                    <div>
                      <h3>{other.name}</h3>
                      <span className="faint" style={{ fontSize: '0.78rem' }}>
                        {shared.length ? `En commun : ${shared.map((e) => EVIDENCE[e].short).join(', ')}` : 'Aucune preuve en commun'}
                      </span>
                    </div>
                  </div>
                  <Icon name="chevronRight" size={18} className="faint" />
                </div>
                <p className="muted">{c.why}</p>
              </Link>
            )
          })}
        </section>
      )}

      {tab === 'notes' && (
        <section className="stack">
          <NoteEditor ghostId={ghost.id} compact />
          {notes.length === 0 && <p className="muted">Aucune note pour cette entité. Ajoute le conseil du jour ci-dessus.</p>}
          {notes.map((n) => (
            <article key={n.id} className="card card-pad note-mini">
              <h3>{n.title}</h3>
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {n.body}
              </p>
              {n.asCard && (
                <span className="chip chip-accent tiny">
                  <Icon name="layers" size={12} />
                  Carte de révision
                </span>
              )}
            </article>
          ))}
        </section>
      )}

      {(ghost.changes.length > 0 || ghost.uncertain.length > 0) && (
        <details className="card card-pad data-notes">
          <summary>
            <Icon name="info" size={16} />
            Notes sur les données
          </summary>
          {ghost.changes.length > 0 && (
            <>
              <h3 className="section-label">Changements récents</h3>
              <ul className="bullets">
                {ghost.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {ghost.uncertain.length > 0 && (
            <>
              <h3 className="section-label">Points à confirmer en jeu</h3>
              <ul className="bullets">
                {ghost.uncertain.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}

      <nav className="ghost-nav" aria-label="Entité précédente et suivante">
        <Link to={`/codex/${prev.id}`} className="card card-pad card-hover">
          <span className="faint">
            <Icon name="chevronLeft" size={14} /> Précédente
          </span>
          <strong>{prev.name}</strong>
        </Link>
        <Link to={`/codex/${next.id}`} className="card card-pad card-hover" style={{ textAlign: 'right' }}>
          <span className="faint">
            Suivante <Icon name="chevronRight" size={14} />
          </span>
          <strong>{next.name}</strong>
        </Link>
      </nav>
    </div>
  )
}
