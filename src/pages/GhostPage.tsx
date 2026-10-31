import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { losText } from '../components/GhostRow'
import { NoteEditor } from '../components/NoteEditor'
import { Empty, Evidence, GhostEvidence, Mastery } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { EVIDENCE } from '../data/evidence'
import type { TextItem } from '../data/types'
import { createFootsteps, type Footsteps } from '../engine/audio'
import { formatDate, num } from '../engine/format'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

function Items({ items }: { items: TextItem[] }) {
  return (
    <ul className="bullets">
      {items.map((i, k) => (
        <li key={k}>
          {i.text}
          {i.zeroEvidence && <span className="tag accent zero-tag">0 preuve</span>}
        </li>
      ))}
    </ul>
  )
}

export function GhostPage() {
  const { id = '' } = useParams()
  const ghost = getGhost(id)
  const mastery = useMastery()
  const { state } = useStore()
  const [playing, setPlaying] = useState<number | null>(null)
  const steps = useRef<Footsteps | null>(null)

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(null))
    return () => steps.current?.stop()
  }, [])
  useEffect(() => {
    steps.current?.stop()
  }, [id])

  const notes = useMemo(() => state.notes.filter((n) => n.ghostId === id), [state.notes, id])

  if (!ghost) {
    return (
      <div className="page narrow">
        <Empty title="Entité introuvable">
          <div className="row">
            <Link to="/codex" className="btn">
              Retour au codex
            </Link>
          </div>
        </Empty>
      </div>
    )
  }

  const idx = GHOSTS.findIndex((g) => g.id === ghost.id)
  const prev = GHOSTS[(idx - 1 + GHOSTS.length) % GHOSTS.length]
  const next = GHOSTS[(idx + 1) % GHOSTS.length]
  const speeds = [...new Set([ghost.speed.min, ghost.speed.max, ghost.speed.alt].filter((v): v is number => v != null && v > 0))]
  const behaviours = [...ghost.tells, ...ghost.behaviors, ...ghost.abilities]

  const toggle = (v: number) => {
    if (playing === v) {
      steps.current?.stop()
      return
    }
    steps.current?.play(v, 8)
    setPlaying(v)
  }

  return (
    <div className="page narrow ghost-page">
      <Link to="/codex" className="crumb">
        ← Codex
      </Link>
      <header className="ghost-head">
        <h1>{ghost.name}</h1>
        {ghost.nameEn !== ghost.name && <p className="faint ghost-en">{ghost.nameEn} dans la version anglaise</p>}
        <p className="lead">{ghost.summary}</p>
      </header>

      <dl className="facts">
        <div>
          <dt>Preuves</dt>
          <dd>
            <GhostEvidence ghost={ghost} />
          </dd>
        </div>
        {ghost.forcedEvidence && (
          <div>
            <dt>Preuve forcée</dt>
            <dd>
              <Evidence id={ghost.forcedEvidence} /> <span className="faint small">toujours visible en Cauchemar et en Démence</span>
            </dd>
          </div>
        )}
        <div>
          <dt>Vitesse</dt>
          <dd>{ghost.speed.summary}</dd>
        </div>
        <div>
          <dt>Accélère en ligne de vue</dt>
          <dd>{losText(ghost)}</dd>
        </div>
        <div>
          <dt>Seuil de chasse</dt>
          <dd>{ghost.huntSanity.summary}</dd>
        </div>
        <div>
          <dt>Ta maîtrise</dt>
          <dd>
            <Mastery value={mastery[ghost.id] ?? 0} showLabel />
          </dd>
        </div>
      </dl>

      <div className="row ghost-actions">
        <Link to={`/quiz?ghost=${ghost.id}`} className="btn btn-primary">
          Quiz sur cette entité
        </Link>
        {speeds.map((v) => (
          <button key={v} type="button" className="btn" onClick={() => toggle(v)} aria-pressed={playing === v}>
            {playing === v ? 'Arrêter' : `Écouter ses pas à ${num(v)} m/s`}
          </button>
        ))}
      </div>

      {ghost.keyTells.length > 0 && (
        <section className="section">
          <h2>À retenir</h2>
          <ol className="numbered">
            {ghost.keyTells.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </section>
      )}

      {ghost.speed.details.length > 0 && (
        <section className="section">
          <h2>Vitesse</h2>
          <ul className="bullets">
            {ghost.speed.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Seuil de chasse</h2>
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

      {behaviours.length > 0 && (
        <section className="section">
          <h2>Signes et comportements</h2>
          {ghost.tells.length > 0 && <Items items={ghost.tells} />}
          {ghost.behaviors.length > 0 && (
            <>
              <h3 className="sub">Comportements</h3>
              <Items items={ghost.behaviors} />
            </>
          )}
          {ghost.abilities.length > 0 && (
            <>
              <h3 className="sub">Capacités</h3>
              <Items items={ghost.abilities} />
            </>
          )}
        </section>
      )}

      <section className="section">
        <h2>Sans preuve</h2>
        <h3 className="sub">Pour confirmer</h3>
        {ghost.confirmationTests.length ? (
          <ul className="tests">
            {ghost.confirmationTests.map((t, i) => (
              <li key={i}>
                <span className={`tag ${t.definitive ? 'ok' : ''}`}>{t.definitive ? 'Définitif' : 'Indice'}</span>
                <p>{t.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Pas de test de confirmation fiable : il faut éliminer les autres entités.</p>
        )}
        <h3 className="sub">Pour éliminer</h3>
        {ghost.eliminationTests.length ? (
          <ul className="tests">
            {ghost.eliminationTests.map((t, i) => (
              <li key={i}>
                <span className="tag bad">Élimine</span>
                <p>{t.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Pas de test d’élimination documenté.</p>
        )}
        {ghost.id !== 'the-mimic' && (
          <p className="faint small" style={{ marginTop: 14 }}>
            Le Mimic peut copier les comportements d’autres entités : il peut donc faire réussir un test de confirmation.
          </p>
        )}
      </section>

      {ghost.confusions.length > 0 && (
        <section className="section">
          <h2>À ne pas confondre avec</h2>
          <ul className="list">
            {ghost.confusions.map((c, i) => {
              const other = getGhost(c.with)
              if (!other) return null
              const shared = other.evidence.filter((e) => ghost.evidence.includes(e))
              return (
                <li key={i} className="confusion">
                  <div className="row between">
                    <Link to={`/codex/${other.id}`} className="ghost-link">
                      {other.name}
                    </Link>
                    <span className="faint small">
                      {shared.length ? `En commun : ${shared.map((e) => EVIDENCE[e].short).join(', ')}` : 'Aucune preuve en commun'}
                    </span>
                  </div>
                  <p className="muted">{c.why}</p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Notes du coach</h2>
        {notes.length > 0 && (
          <ul className="list" style={{ marginBottom: 16 }}>
            {notes.map((n) => (
              <li key={n.id}>
                <h3>{n.title}</h3>
                {n.body && <p className="muted pre">{n.body}</p>}
                <p className="faint small">
                  {n.author ? `${n.author}, ` : ''}
                  {formatDate(n.createdAt)}
                  {n.asCard ? ' · en révision' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        <NoteEditor ghostId={ghost.id} compact />
      </section>

      {(ghost.changes.length > 0 || ghost.uncertain.length > 0) && (
        <details className="section data-notes">
          <summary>Notes sur les données de cette fiche</summary>
          {ghost.changes.length > 0 && (
            <>
              <h3 className="sub">Changements récents dans le jeu</h3>
              <ul className="bullets">
                {ghost.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {ghost.uncertain.length > 0 && (
            <>
              <h3 className="sub">À vérifier en partie</h3>
              <p className="faint small">Ces points n’ont pas pu être confirmés par deux sources : ils ne sont pas utilisés dans les quiz.</p>
              <ul className="bullets">
                {ghost.uncertain.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}

      <nav className="pager" aria-label="Entités voisines">
        <Link to={`/codex/${prev.id}`}>← {prev.name}</Link>
        <Link to={`/codex/${next.id}`}>{next.name} →</Link>
      </nav>
    </div>
  )
}
