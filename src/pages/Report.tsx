import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Empty, Mastery, PageHead } from '../components/ui'
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
    let current = true
    setError(false)
    setData(null)
    const d = params.get('d')
    if (!d) {
      setError(true)
      return
    }
    decodePayload<ReportPayload>(d)
      .then((p) => current && (p.kind === 'phasmo-coach/report' ? setData(p) : setError(true)))
      .catch(() => current && setError(true))
    return () => {
      current = false
    }
  }, [params])

  if (error) {
    return (
      <div className="page narrow">
        <Empty title="Lien de progression invalide">
          <p>Le lien est peut-être incomplet. Demande à le renvoyer.</p>
          <div className="row">
            <Link to="/" className="btn">
              Accueil
            </Link>
          </div>
        </Empty>
      </div>
    )
  }
  if (!data) return <div className="page narrow" />

  const values = GHOSTS.map((g) => ({ g, m: (data.mastery[g.id] ?? 0) / 100 })).sort((a, b) => a.m - b.m)
  const avg = values.reduce((s, v) => s + v.m, 0) / Math.max(1, values.length)

  return (
    <div className="page">
      <PageHead title={`Progression de ${data.name || 'l’élève'}`}>
        Bilan partagé le {formatDate(data.at)}, en lecture seule : il ne modifie rien sur cet appareil.
      </PageHead>
      <dl className="figures">
        <div>
          <dt>Maîtrise moyenne</dt>
          <dd>{Math.round(avg * 100)} %</dd>
        </div>
        <div>
          <dt>Série</dt>
          <dd>
            {data.streak} jour{data.streak > 1 ? 's' : ''}
          </dd>
        </div>
        <div>
          <dt>Cartes apprises</dt>
          <dd>
            {data.learned} <span className="faint">sur {data.total}</span>
          </dd>
        </div>
      </dl>

      <div className="grid-2" style={{ '--gap': '40px' } as React.CSSProperties}>
        <section className="section">
          <h2>Points faibles</h2>
          <ul className="list">
            {values.slice(0, 8).map(({ g, m }) => (
              <li key={g.id} className="row between">
                <Link to={`/codex/${g.id}`}>{g.name}</Link>
                <Mastery value={m} />
              </li>
            ))}
          </ul>
        </section>
        <section className="section">
          <h2>Dernières séances</h2>
          {data.activity.length === 0 ? (
            <p className="muted">Aucune séance enregistrée.</p>
          ) : (
            <ul className="list small">
              {[...data.activity].reverse().map((a, i) => (
                <li key={i} className="row between">
                  <span>
                    {a.label} <span className="faint">· {new Date(a.t).toLocaleDateString('fr-FR')}</span>
                  </span>
                  <span className="pct">{a.kind === 'scenario' ? `${a.score} pts` : `${a.score}/${a.total}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="section">
        <h2>Toutes les entités</h2>
        <ul className="mastery-grid">
          {GHOSTS.map((g) => {
            const m = (data.mastery[g.id] ?? 0) / 100
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
    </div>
  )
}
