import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileHead, H, IndexCard, Notebook, Page, RoughCircle, Stamp, Tape, TypedLink } from '../components/journal/Journal'
import { Empty, Mastery } from '../components/ui'
import { GHOSTS } from '../data'
import { formatDate } from '../engine/format'
import { decodePayload } from '../engine/share'
import type { ReportPayload } from './Profile'

type Style = CSSProperties & Record<`--${string}`, string | number>

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** Mot du correcteur sous la moyenne (même barème que les fiches). */
function gradeWord(m: number): string {
  if (m === 0) return 'à commencer'
  if (m < 0.35) return 'on s’y met'
  if (m < 0.6) return 'ça vient'
  if (m < 0.85) return 'presque !'
  return 'acquis'
}

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
      <Notebook single className="bulletin">
        <Page section="1" label="Lien de progression invalide">
          <FileHead>
            <span>Bulletin de progression</span>
            <span>Illisible</span>
          </FileHead>
          <Empty title="Lien de progression invalide">
            <p>Le lien est peut-être incomplet. Demande à le renvoyer.</p>
            <p>
              <TypedLink to="/">Accueil</TypedLink>
            </p>
          </Empty>
        </Page>
      </Notebook>
    )
  }
  if (!data) {
    return (
      <Notebook single className="bulletin">
        <Page section="1" label="Ouverture du bulletin">
          <FileHead>
            <span>Bulletin de progression</span>
            <span>Ouverture…</span>
          </FileHead>
        </Page>
      </Notebook>
    )
  }

  const values = GHOSTS.map((g) => ({ g, m: (data.mastery[g.id] ?? 0) / 100 })).sort((a, b) => a.m - b.m)
  const avg = values.reduce((s, v) => s + v.m, 0) / Math.max(1, values.length)
  const name = data.name || 'l’élève'
  const acquired = GHOSTS.filter((g) => (data.mastery[g.id] ?? 0) >= 85).length
  const untouched = GHOSTS.filter((g) => (data.mastery[g.id] ?? 0) === 0).length
  const started = values.filter((v) => v.m > 0 && v.m < 0.85)
  const weak = (started.length ? started : values.filter((v) => v.m < 0.85)).slice(0, 8)

  return (
    <Notebook className="bulletin">
      {/* ===================== page de gauche : le bulletin ===================== */}
      <Page side="left" section="1" label={`Progression de ${name}`}>
        <FileHead>
          <span>Bulletin de progression</span>
          <span>
            Établi le <b>{SHORT.format(data.at)}</b>
          </span>
          <span>Lecture seule</span>
        </FileHead>

        <div className="entry">
          <h1 className="entry-date">
            <em>Bulletin</em>
            Progression de {name}
          </h1>
          <Stamp tone="ink" rotate={-6} thunk delay={0.4}>
            Copie
          </Stamp>
          <p className="entry-line">Bilan partagé le {formatDate(data.at)}, en lecture seule : il ne modifie rien sur cet appareil.</p>
        </div>

        <IndexCard className="averages settle" head="Moyennes" right={`au ${SHORT.format(data.at)}`} clip rotate={-0.5}>
          <dl className="avg">
            <div>
              <dt>Maîtrise moyenne</dt>
              <dd>
                <span className="avg-grade">
                  <RoughCircle seed={`avg-${data.at}`} padX={0.12} padY={0.16} width={2.2} delay={0.9}>
                    {Math.round(avg * 100)} %
                  </RoughCircle>
                </span>
                <span className="hand avg-word">{gradeWord(avg)}</span>
              </dd>
            </div>
            <div>
              <dt>Série</dt>
              <dd>
                {data.streak} <small>jour{data.streak > 1 ? 's' : ''} d’affilée</small>
              </dd>
            </div>
            <div>
              <dt>Cartes apprises</dt>
              <dd>
                {data.learned} <small>sur {data.total}</small>
              </dd>
            </div>
          </dl>
        </IndexCard>

        <div className="libcard sessions settle" style={{ '--r': '1deg', '--d': '.5s' } as Style}>
          <Tape />
          <h2>Dernières séances</h2>
          <div className="cols">
            <span>Date</span>
            <span>Séance</span>
            <span>Note</span>
          </div>
          <ol>
            {data.activity.length === 0 && (
              <li>
                <span className="d">—</span>
                <span className="res empty">Aucune séance enregistrée.</span>
              </li>
            )}
            {[...data.activity].reverse().map((a, i) => {
              const bad = a.kind !== 'scenario' && a.total > 0 && a.score / a.total < 0.5
              return (
                <li key={i} style={{ '--r': `${[-2, 1, -1, 2, -1.5, 0.5][i % 6]}deg` } as Style}>
                  <span className="d">{SHORT.format(a.t)}</span>
                  <span className="lbl">{a.label}</span>
                  <span className={`res${bad ? ' bad' : ''}`}>{a.kind === 'scenario' ? `${a.score} pts` : `${a.score}/${a.total}`}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </Page>

      {/* ===================== page de droite : le registre ===================== */}
      <Page side="right" section="1" label="Registre des entités">
        <FileHead>
          <span>Registre</span>
          <span>{name}</span>
        </FileHead>

        <section aria-labelledby="h-reg">
          <H id="h-reg" count={`${acquired} acquise${acquired > 1 ? 's' : ''} sur ${GHOSTS.length}`}>
            Les {GHOSTS.length} entités
          </H>
          <p className="registry-legend">La maîtrise est surlignée ; les entités acquises sont entourées.</p>
          <ol className="registry">
            {GHOSTS.map((g, i) => {
              const m = (data.mastery[g.id] ?? 0) / 100
              const ok = m >= 0.85
              const cls = ok ? 'ok' : m === 0 ? 'zero' : m < 0.4 ? 'weak' : undefined
              return (
                <li key={g.id} className={cls} style={{ '--m': m } as Style}>
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <Link className="nm" to={`/codex/${g.id}`} style={{ '--i': i } as Style}>
                    {ok ? (
                      <RoughCircle seed={g.id} delay={1.1 + i * 0.03}>
                        {g.name}
                      </RoughCircle>
                    ) : (
                      g.name
                    )}
                  </Link>
                  <span className="pct">{m === 0 ? '–' : Math.round(m * 100)}</span>
                </li>
              )
            })}
          </ol>
          <div className="registry-sum">
            <span>
              <b>{acquired}</b> acquise{acquired > 1 ? 's' : ''}
            </span>
            <span>
              <b>{GHOSTS.length - acquired - untouched}</b> en cours
            </span>
            <span>
              <b>{untouched}</b> pas encore ouverte{untouched > 1 ? 's' : ''}
            </span>
          </div>
        </section>

        {weak.length > 0 && (
          <section aria-labelledby="h-weak">
            <H id="h-weak" count={`les ${weak.length} plus fragiles`}>
              À retravailler
            </H>
            <ol className="weak-list">
              {weak.map(({ g, m }) => (
                <li key={g.id}>
                  <Link to={`/codex/${g.id}`}>{g.name}</Link>
                  <Mastery value={m} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </Page>
    </Notebook>
  )
}
