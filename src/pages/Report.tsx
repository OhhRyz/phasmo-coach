import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty, MasteryRing, PageHeader } from '../components/ui'
import { GHOSTS } from '../data'
import { formatDate } from '../engine/format'
import { masteryLevel } from '../engine/progress'
import { decodePayload } from '../engine/share'
import type { ReportPayload } from './Profile'

export function Report() {
  const [params] = useSearchParams()
  const [data, setData] = useState<ReportPayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const d = params.get('d')
    if (!d) {
      setError(true)
      return
    }
    decodePayload<ReportPayload>(d)
      .then((p) => (p.kind === 'phasmo-coach/report' ? setData(p) : setError(true)))
      .catch(() => setError(true))
  }, [params])

  if (error) {
    return (
      <div className="page narrow">
        <Empty icon="link" title="Lien de progression invalide">
          <p>Le lien est peut-être incomplet. Demande à le renvoyer.</p>
          <Link to="/" className="btn">
            Accueil
          </Link>
        </Empty>
      </div>
    )
  }
  if (!data) return <div className="page narrow" />

  const values = GHOSTS.map((g) => ({ g, m: (data.mastery[g.id] ?? 0) / 100 })).sort((a, b) => a.m - b.m)
  const avg = values.reduce((s, v) => s + v.m, 0) / Math.max(1, values.length)

  return (
    <div className="page">
      <PageHeader eyebrow={`Bilan partagé le ${formatDate(data.at)}`} title={`Progression de ${data.name || 'l’élève'}`}>
        Lecture seule. Ce bilan ne modifie rien sur cet appareil.
      </PageHeader>
      <section className="card card-pad report-stats">
        <div className="row">
          <MasteryRing value={avg} size={64} />
          <div className="stat">
            <b>{Math.round(avg * 100)} %</b>
            <span>maîtrise moyenne</span>
          </div>
        </div>
        <div className="stat">
          <b>{data.streak}</b>
          <span>jours d’affilée</span>
        </div>
        <div className="stat">
          <b>
            {data.learned}
            <small className="faint">/{data.total}</small>
          </b>
          <span>cartes apprises</span>
        </div>
      </section>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>
            <Icon name="train" size={18} style={{ color: 'var(--accent)', verticalAlign: '-3px', marginRight: 6 }} />
            Points faibles
          </h2>
          <ul className="list-plain report-list">
            {values.slice(0, 8).map(({ g, m }) => (
              <li key={g.id}>
                <Link to={`/codex/${g.id}`}>{g.name}</Link>
                <span className={`chip tiny tone-${masteryLevel(m).tone}`}>{Math.round(m * 100)} %</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>
            <Icon name="calendar" size={18} style={{ color: 'var(--accent)', verticalAlign: '-3px', marginRight: 6 }} />
            Dernières séances
          </h2>
          {data.activity.length === 0 ? (
            <p className="muted">Aucune séance enregistrée.</p>
          ) : (
            <ul className="list-plain report-list">
              {[...data.activity].reverse().map((a, i) => (
                <li key={i}>
                  <span>
                    {a.label} <span className="faint">· {new Date(a.t).toLocaleDateString('fr-FR')}</span>
                  </span>
                  <span className="mono faint">{a.kind === 'scenario' ? `${a.score} pts` : `${a.score}/${a.total}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 12 }}>Toutes les entités</h2>
        <div className="mastery-map">
          {GHOSTS.map((g) => {
            const m = (data.mastery[g.id] ?? 0) / 100
            return (
              <Link key={g.id} to={`/codex/${g.id}`} className={`map-tile tone-${masteryLevel(m).tone}`} title={`${g.name} — ${Math.round(m * 100)} %`}>
                <span className="map-name">{g.name}</span>
                <span className="map-bar">
                  <i style={{ width: `${Math.max(4, m * 100)}%` }} />
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
