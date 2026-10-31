import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mastery, Seg } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { formatDate } from '../engine/format'
import { buildReviewQueue, learnedCount, masteryLevel, streak } from '../engine/progress'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'
import { WEAK_COUNT } from './Quiz'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Bonne nuit'
  if (h < 18) return 'Bonjour'
  return 'Bonsoir'
}

function planText(due: number, fresh: number): string {
  const s = (n: number) => (n > 1 ? 's' : '')
  if (due && fresh) return `${due + fresh} cartes, dont ${fresh} nouvelle${s(fresh)}.`
  if (fresh) return `${fresh} nouvelle${s(fresh)} carte${s(fresh)} à découvrir.`
  return `${due} carte${s(due)} à revoir.`
}

function Welcome() {
  const { dispatch } = useStore()
  const [name, setName] = useState('')
  const [coachName, setCoachName] = useState('')
  const [role, setRole] = useState<'student' | 'coach'>('student')
  return (
    <div className="page narrow">
      <header className="page-head welcome-head">
        <h1>Un carnet pour apprendre les entités, et les retenir.</h1>
        <p className="lead">
          Le codex des {GHOSTS.length} entités, des quiz, des enquêtes simulées, et une révision qui garde en mémoire ce que tu sais
          déjà pour ne te reposer que ce qui commence à s’effacer. Tout reste sur cet appareil.
        </p>
      </header>
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault()
          dispatch({ type: 'onboard', profile: { name: name.trim(), coachName: coachName.trim(), role } })
        }}
      >
        <div className="field">
          <span className="field-label">Qui utilise l’app sur cet appareil ?</span>
          <Seg
            label="Rôle"
            value={role}
            onChange={setRole}
            options={[
              { value: 'student', label: 'Je m’entraîne' },
              { value: 'coach', label: 'Je suis le coach' },
            ]}
          />
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Ton prénom</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom ou pseudo" autoFocus />
          </label>
          {role === 'student' && (
            <label className="field">
              <span>Ton coach (facultatif)</span>
              <input className="input" value={coachName} onChange={(e) => setCoachName(e.target.value)} placeholder="Prénom ou pseudo du coach" />
            </label>
          )}
        </div>
        <div>
          <button type="submit" className="btn btn-primary btn-lg">
            Commencer
          </button>
        </div>
      </form>
    </div>
  )
}

export function Home() {
  const { state, deck } = useStore()
  const mastery = useMastery()
  const now = useMemo(() => Date.now(), [])

  const queue = useMemo(() => buildReviewQueue(state, deck, now), [state, deck, now])
  const days = streak(state, now)
  const learned = learnedCount(deck, state.cards)
  const mastered = GHOSTS.filter((g) => (mastery[g.id] ?? 0) >= 0.85).length
  const quizAcc = useMemo(() => {
    const recent = Object.entries(state.answers)
      .filter(([k]) => k.startsWith('topic:'))
      .flatMap(([, v]) => v.recent)
    return recent.length >= 3 ? recent.reduce((a, b) => a + b, 0) / recent.length : null
  }, [state.answers])
  const weak = useMemo(() => [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0)).slice(0, WEAK_COUNT), [mastery])
  const notes = state.notes.slice(0, 3)
  const recent = [...state.activity].reverse().slice(0, 5)
  const dueCount = queue.filter((c) => state.cards[c.id]).length
  const newCount = queue.length - dueCount
  const minutes = Math.max(1, Math.round(queue.length * 0.4))

  if (!state.onboarded) return <Welcome />

  return (
    <div className="page">
      <header className="page-head">
        <p className="faint small">{formatDate(now)}</p>
        <h1>
          {greeting()}
          {state.profile.name ? `, ${state.profile.name}` : ''}.
        </h1>
        <p className="lead">
          {queue.length > 0
            ? `Aujourd’hui : ${planText(dueCount, newCount)} Compte environ ${minutes} minute${minutes > 1 ? 's' : ''}.`
            : 'Tout est révisé pour aujourd’hui. Une enquête pour garder la main ?'}
        </p>
        <div className="row actions">
          {queue.length > 0 ? (
            <Link to="/revision" className="btn btn-primary btn-lg">
              Commencer la révision
            </Link>
          ) : (
            <Link to="/enquete" className="btn btn-primary btn-lg">
              Lancer une enquête
            </Link>
          )}
          <Link to="/quiz" className="btn btn-lg">
            Quiz rapide
          </Link>
        </div>
      </header>

      <dl className="figures">
        <div>
          <dt>Série</dt>
          <dd>
            {days} jour{days > 1 ? 's' : ''}
          </dd>
        </div>
        <div>
          <dt>Cartes apprises</dt>
          <dd>
            {learned} <span className="faint">sur {deck.length}</span>
          </dd>
        </div>
        <div>
          <dt>Entités maîtrisées</dt>
          <dd>
            {mastered} <span className="faint">sur {GHOSTS.length}</span>
          </dd>
        </div>
        <div>
          <dt>Réussite récente</dt>
          <dd>{quizAcc == null ? '—' : `${Math.round(quizAcc * 100)} %`}</dd>
        </div>
      </dl>

      <div className="home-cols">
        <section className="section">
          <div className="section-head">
            <h2>Où tu en es</h2>
            <Link to="/codex" className="small">
              Ouvrir le codex
            </Link>
          </div>
          <ul className="mastery-grid">
            {GHOSTS.map((g) => {
              const m = mastery[g.id] ?? 0
              return (
                <li key={g.id}>
                  <Link to={`/codex/${g.id}`} className={`mg-item lvl-${masteryLevel(m).tone}`} title={masteryLevel(m).label}>
                    <span className="mg-name">{g.name}</span>
                    <span className="pct">{Math.round(m * 100)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <aside>
          <section className="section">
            <h2>À travailler</h2>
            <ol className="weak">
              {weak.map((g) => (
                <li key={g.id}>
                  <Link to={`/codex/${g.id}`}>{g.name}</Link>
                  <Mastery value={mastery[g.id] ?? 0} />
                </li>
              ))}
            </ol>
            <Link to="/quiz?pool=weak" className="btn btn-block" style={{ marginTop: 14 }}>
              Quiz sur ces points faibles
            </Link>
          </section>

          {recent.length > 0 && (
            <section className="section">
              <h2>Dernières séances</h2>
              <ul className="list small">
                {recent.map((r, i) => (
                  <li key={i} className="row between">
                    <span>{r.label}</span>
                    <span className="pct">{r.kind === 'scenario' ? `${r.score} pts` : `${r.score}/${r.total}`}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Derniers conseils du coach</h2>
          <Link to="/carnet" className="small">
            Tout le carnet
          </Link>
        </div>
        {notes.length === 0 ? (
          <p className="muted">
            Pas encore de conseil. Le coach peut écrire ses explications dans le <Link to="/carnet">carnet</Link> : elles deviennent
            des cartes de révision, et n’ont plus besoin d’être répétées.
          </p>
        ) : (
          <ul className="list">
            {notes.map((n) => (
              <li key={n.id}>
                <Link to="/carnet" className="note-line">
                  <strong>{n.title}</strong>
                  {n.ghostId && <span className="faint"> · {getGhost(n.ghostId)?.name}</span>}
                </Link>
                {n.body && <p className="muted small clamp-2">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
