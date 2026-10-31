import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/Layout'
import { Icon } from '../components/Icon'
import { GhostSigil, MasteryRing, Seg } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { formatDate } from '../engine/format'
import { activityByDay, buildReviewQueue, learnedCount, masteryLevel, streak } from '../engine/progress'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Bonne nuit'
  if (h < 18) return 'Bonjour'
  return 'Bonsoir'
}

function Welcome() {
  const { dispatch } = useStore()
  const [name, setName] = useState('')
  const [coachName, setCoachName] = useState('')
  const [role, setRole] = useState<'student' | 'coach'>('student')
  return (
    <div className="page narrow">
      <section className="card welcome">
        <BrandMark className="welcome-mark" />
        <div className="eyebrow">Bienvenue</div>
        <h1>Ton carnet d’entraînement Phasmophobia</h1>
        <p className="muted">
          Le codex des {GHOSTS.length} entités, des quiz, des mises en situation et une révision espacée qui retient ce que tu
          sais déjà, pour ne te reposer que ce qui commence à s’effacer. Tout reste sur cet appareil.
        </p>
        <form
          className="stack"
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
          <div className="grid grid-2">
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
          <button type="submit" className="btn btn-primary btn-lg">
            C’est parti
            <Icon name="arrowRight" size={18} />
          </button>
        </form>
      </section>
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
  const weak = useMemo(
    () => [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0)).slice(0, 4),
    [mastery],
  )
  const activity = useMemo(() => activityByDay(state, now, 14), [state, now])
  const maxAct = Math.max(1, ...activity.map((a) => a.count))
  const notes = state.notes.slice(0, 3)
  const recent = [...state.activity].reverse().slice(0, 5)
  const dueCount = queue.filter((c) => state.cards[c.id]).length
  const newCount = queue.length - dueCount

  if (!state.onboarded) return <Welcome />

  return (
    <div className="page">
      <section className="hero card">
        <div className="hero-text">
          <div className="eyebrow">{formatDate(now)}</div>
          <h1>
            {greeting()}
            {state.profile.name ? `, ${state.profile.name}` : ''}.
          </h1>
          <p className="muted">
            {queue.length > 0
              ? `${queue.length} carte${queue.length > 1 ? 's' : ''} au programme aujourd’hui${dueCount ? ` : ${dueCount} à revoir` : ''}${newCount ? `${dueCount ? ' et' : ' :'} ${newCount} nouvelle${newCount > 1 ? 's' : ''}` : ''}.`
              : 'Tout est révisé pour aujourd’hui. Une petite enquête pour garder la main ?'}
          </p>
          <div className="row" style={{ marginTop: 18 }}>
            {queue.length > 0 ? (
              <Link to="/revision" className="btn btn-primary btn-lg">
                <Icon name="layers" size={18} />
                Commencer la révision
              </Link>
            ) : (
              <Link to="/enquete" className="btn btn-primary btn-lg">
                <Icon name="search" size={18} />
                Lancer une enquête
              </Link>
            )}
            <Link to="/quiz" className="btn btn-lg">
              <Icon name="quiz" size={18} />
              Quiz rapide
            </Link>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <b>
              <Icon name="flame" size={20} style={{ color: 'var(--lantern)', verticalAlign: '-2px', marginRight: 4 }} />
              {days}
            </b>
            <span>jour{days > 1 ? 's' : ''} d’affilée</span>
          </div>
          <div className="stat">
            <b>
              {learned}
              <small className="faint">/{deck.length}</small>
            </b>
            <span>cartes apprises</span>
          </div>
          <div className="stat">
            <b>
              {mastered}
              <small className="faint">/{GHOSTS.length}</small>
            </b>
            <span>entités maîtrisées</span>
          </div>
          <div className="stat">
            <b>{quizAcc == null ? '—' : `${Math.round(quizAcc * 100)} %`}</b>
            <span>réussite récente aux quiz</span>
          </div>
        </div>
      </section>

      <div className="home-grid">
        <section className="card card-pad home-map">
          <div className="card-title">
            <h2>
              <Icon name="ghost" size={18} />
              Carte de maîtrise
            </h2>
            <Link to="/codex" className="btn btn-ghost btn-sm">
              Codex <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          <div className="mastery-map">
            {GHOSTS.map((g) => {
              const m = mastery[g.id] ?? 0
              const lvl = masteryLevel(m)
              return (
                <Link key={g.id} to={`/codex/${g.id}`} className={`map-tile tone-${lvl.tone}`} title={`${g.name} — ${lvl.label} (${Math.round(m * 100)} %)`}>
                  <span className="map-name">{g.name}</span>
                  <span className="map-bar">
                    <i style={{ width: `${Math.max(4, m * 100)}%` }} />
                  </span>
                </Link>
              )
            })}
          </div>
          <div className="map-legend">
            {(['none', 'low', 'mid', 'good', 'max'] as const).map((t, i) => (
              <span key={t} className={`tone-${t}`}>
                <i />
                {['À découvrir', 'Découverte', 'En cours', 'Solide', 'Maîtrisée'][i]}
              </span>
            ))}
          </div>
        </section>

        <div className="stack">
          <section className="card card-pad">
            <div className="card-title">
              <h2>
                <Icon name="train" size={18} />À travailler
              </h2>
            </div>
            <ul className="list-plain weak-list">
              {weak.map((g) => (
                <li key={g.id}>
                  <Link to={`/codex/${g.id}`} className="weak-item">
                    <GhostSigil ghost={g} mastery={mastery[g.id] ?? 0} size={36} />
                    <span className="weak-name">
                      <strong>{g.name}</strong>
                      <span className="faint">{masteryLevel(mastery[g.id] ?? 0).label}</span>
                    </span>
                    <MasteryRing value={mastery[g.id] ?? 0} size={34} />
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/quiz" className="btn btn-block" style={{ marginTop: 12 }}>
              Quiz sur mes points faibles
            </Link>
          </section>

          <section className="card card-pad">
            <div className="card-title">
              <h2>
                <Icon name="calendar" size={18} />
                14 derniers jours
              </h2>
            </div>
            <div className="act-bars" role="img" aria-label="Activité des 14 derniers jours">
              {activity.map((a) => (
                <span key={a.key} title={`${a.key} : ${a.count}`} style={{ '--h': `${(a.count / maxAct) * 100}%` } as CSSProperties} className={a.count ? 'on' : ''} />
              ))}
            </div>
            {recent.length > 0 && (
              <ul className="list-plain recent-list">
                {recent.map((r, i) => (
                  <li key={i}>
                    <span>{r.label}</span>
                    <span className="mono faint">
                      {r.kind === 'scenario' ? `${r.score} pts` : `${r.score}/${r.total}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="card card-pad" style={{ marginTop: 18 }}>
        <div className="card-title">
          <h2>
            <Icon name="notebook" size={18} />
            Derniers conseils du coach
          </h2>
          <Link to="/carnet" className="btn btn-ghost btn-sm">
            Carnet <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        {notes.length === 0 ? (
          <p className="muted">
            Aucun conseil pour l’instant. Le coach peut écrire ses explications dans le <Link to="/carnet">carnet</Link> : elles
            deviennent des cartes de révision, pour ne pas avoir à les répéter.
          </p>
        ) : (
          <div className="grid grid-3">
            {notes.map((n) => (
              <Link key={n.id} to="/carnet" className="note-preview">
                {n.ghostId && <span className="chip chip-accent tiny">{getGhost(n.ghostId)?.name}</span>}
                <strong>{n.title}</strong>
                <span className="muted">{n.body}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
