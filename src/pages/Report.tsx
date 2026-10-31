import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileHead, H, IndexCard, JournalBox, Notebook, Page, RoughCircle, Stamp, Tape, TapeButton, TypedLink } from '../components/journal/Journal'
import { Mastery } from '../components/ui'
import { GHOSTS } from '../data'
import { formatDate, fr, NBSP, num, safeDate } from '../engine/format'
import { masteryLevel, WEAK_COUNT } from '../engine/progress'
import { decodePayload, readReportPayload, type ReportNote, type ReportPayload } from '../engine/share'

type Style = CSSProperties & Record<`--${string}`, string | number>

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const GRADE: Record<1 | 2 | 3 | 4, string> = { 1: 'À revoir', 2: 'Difficile', 3: 'Bien', 4: 'Facile' }

/** Une note du coach est retenue quand sa carte est apprise et que la dernière réponse était juste. */
const isKept = (n: ReportNote) => n.phase === 'review' && (n.grade == null || n.grade >= 3)

/** Le détail au crayon sous une note : dernière réponse, oublis, prochaine révision. */
function noteDetail(n: ReportNote): string {
  const parts: string[] = []
  if (n.grade != null) parts.push(`dernière réponse : ${GRADE[n.grade]}`)
  if (n.lapses > 0) parts.push(`oubliée ${n.lapses} fois`)
  if (n.due != null) parts.push(`prochaine révision le ${safeDate(SHORT, n.due)}`)
  return fr(parts.join(' · '))
}

/** À reprendre : la dernière réponse était fausse ou hésitante, ou la note a déjà été oubliée. */
const isRedo = (n: ReportNote) => !isKept(n) && n.phase !== 'new' && (n.grade === 1 || n.grade === 2 || (n.grade == null && n.lapses > 0))

/** Le mot du correcteur, au stylo, en face d'une note à reprendre. */
function redoMark(n: ReportNote): string {
  if (n.grade === 2) return 'difficile'
  return 'à revoir'
}

function NotesBlock({ notes, name }: { notes: ReportNote[]; name: string }) {
  const kept = notes.filter(isKept)
  const fresh = notes.filter((n) => n.phase === 'new')
  const redo = notes.filter(isRedo)
  // bien répondu mais encore en apprentissage : ni retenue, ni à reprendre
  const learning = notes.filter((n) => !isKept(n) && !isRedo(n) && n.phase !== 'new')
  return (
    <section className="rp-notes" aria-labelledby="h-rp-notes">
      <H
        id="h-rp-notes"
        count={notes.length ? `${kept.length ? `${kept.length} retenue${kept.length > 1 ? 's' : ''}` : 'aucune retenue'} · ${redo.length ? redo.length : 'aucune'} à reprendre` : 'aucune'}
      >
        Tes notes
      </H>
      {notes.length === 0 ? (
        <p className="pencil-note rp-empty">{fr(`aucune de tes notes n’est encore dans la révision de ${name}`)}</p>
      ) : (
        <>
          {kept.length > 0 && (
            <>
              <h3 className="pencil-note rp-label">retenues</h3>
              <ol className="rp-list">
                {kept.map((n, i) => (
                  <li key={i}>
                    <span className="rp-mark">
                      <JournalBox state="yes" seed={`rp-${i}-${n.title}`} delay={0.6 + i * 0.08} />
                      <span className="sr-only">Retenue : </span>
                    </span>
                    <span className="rp-t">{n.title}</span>
                    {noteDetail(n) && <span className="pencil-note rp-d">{noteDetail(n)}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {redo.length > 0 && (
            <>
              <h3 className="pencil-note rp-label">à reprendre</h3>
              <ol className="rp-list">
                {redo.map((n, i) => (
                  <li key={i} className="is-redo">
                    <span className="rp-mark hand">{redoMark(n)}</span>
                    <span className="rp-t">{n.title}</span>
                    {noteDetail(n) && <span className="pencil-note rp-d">{noteDetail(n)}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {learning.length > 0 && (
            <>
              <h3 className="pencil-note rp-label">en cours d’apprentissage</h3>
              <ol className="rp-list is-fresh">
                {learning.map((n, i) => (
                  <li key={i}>
                    <span className="rp-mark" aria-hidden>
                      –
                    </span>
                    <span className="rp-t">{n.title}</span>
                    {noteDetail(n) && <span className="pencil-note rp-d">{noteDetail(n)}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {fresh.length > 0 && (
            <>
              <h3 className="pencil-note rp-label">pas encore révisée{fresh.length > 1 ? 's' : ''}</h3>
              <ol className="rp-list is-fresh">
                {fresh.map((n, i) => (
                  <li key={i}>
                    <span className="rp-mark" aria-hidden>
                      –
                    </span>
                    <span className="rp-t">{n.title}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  )
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
    decodePayload<unknown>(d)
      .then((raw) => {
        if (!current) return
        const p = readReportPayload(raw)
        if (p) setData(p)
        else setError(true)
      })
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
          <div className="empty-note">
            <H as="h1">Lien de progression invalide</H>
            <p>Le lien est peut-être incomplet. Demande à le renvoyer.</p>
            <p>
              <TypedLink to="/">Accueil</TypedLink>
            </p>
          </div>
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
          <h1 className="sr-only">Ouverture du bulletin</h1>
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
  // une entité jamais travaillée n'est pas un point faible : elle est « à découvrir »
  const weak = (started.length ? started : values.filter((v) => v.m === 0)).slice(0, WEAK_COUNT)
  const shared = safeDate(SHORT, data.at, '')
  const scoreText = (a: ReportPayload['activity'][number]) => (a.kind === 'scenario' ? `${num(a.score)}${NBSP}pts` : `${a.score}/${a.total}`)
  const labelText = (a: ReportPayload['activity'][number]) =>
    fr(a.kind === 'scenario' ? a.label.replace(/^Enquête\s*:\s*/, 'Mise en situation : ') : a.label) || '—'

  return (
    <Notebook className="bulletin">
      {/* ===================== page de gauche : le bulletin ===================== */}
      <Page side="left" section="1" label={`Progression de ${name}`}>
        <FileHead>
          <span>Bulletin de progression</span>
          {shared && (
            <span>
              Établi le <b>{shared}</b>
            </span>
          )}
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
          <p className="entry-line">
            {data.at != null ? `Bilan partagé le ${formatDate(data.at)}, en lecture seule` : 'Bilan en lecture seule'}
            {fr(' : il ne modifie rien sur cet appareil.')}
          </p>
        </div>

        <IndexCard className="averages settle" head="Moyennes" right={shared ? `au ${shared}` : undefined} clip rotate={-0.5}>
          <dl className="avg">
            <div>
              <dt>Maîtrise moyenne</dt>
              <dd>
                <span className="avg-grade">
                  <RoughCircle seed={`avg-${data.at ?? 0}`} padX={0.12} padY={0.16} width={2.2} delay={0.9}>
                    {Math.round(avg * 100)}
                    {NBSP}%
                  </RoughCircle>
                </span>
                <span className="pencil-note avg-word">{masteryLevel(avg).label.toLowerCase()}</span>
              </dd>
            </div>
            <div>
              <dt>Série</dt>
              <dd>
                {data.streak ? (
                  <>
                    {data.streak} <small>jour{data.streak > 1 ? 's' : ''} d’affilée</small>
                  </>
                ) : (
                  <small>aucune en cours</small>
                )}
              </dd>
            </div>
            <div>
              <dt>Cartes apprises</dt>
              <dd>
                {data.learned ? data.learned : <small>aucune</small>} <small>sur {num(data.total)}</small>
              </dd>
            </div>
          </dl>
        </IndexCard>

        {data.notes && <NotesBlock notes={data.notes} name={name} />}

        <p className="rp-action">
          <TapeButton to="/carnet">{data.name ? `Écrire une note à ${data.name}` : 'Écrire une note'}</TapeButton>
        </p>

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
                  <span className="d">{safeDate(SHORT, a.t)}</span>
                  <span className="lbl">{labelText(a)}</span>
                  <span className={`res${bad ? ' bad' : ''}`}>{scoreText(a)}</span>
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
          <H id="h-reg" count={`${acquired ? `${acquired} acquise${acquired > 1 ? 's' : ''}` : 'aucune acquise'} sur ${GHOSTS.length}`}>
            Les {GHOSTS.length} entités
          </H>
          <p className="registry-legend">{fr('La maîtrise est surlignée ; les entités acquises sont entourées.')}</p>
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
            <span>{acquired ? <><b>{acquired}</b> acquise{acquired > 1 ? 's' : ''}</> : 'aucune acquise'}</span>
            <span>
              {GHOSTS.length - acquired - untouched ? <><b>{GHOSTS.length - acquired - untouched}</b> en cours</> : 'aucune en cours'}
            </span>
            <span>
              {untouched ? <><b>{untouched}</b> pas encore travaillée{untouched > 1 ? 's' : ''}</> : 'toutes travaillées'}
            </span>
          </div>
        </section>

        {weak.length > 0 && (
          <section aria-labelledby="h-weak">
            <H id="h-weak" count={started.length ? (weak.length === 1 ? 'la plus fragile' : `les ${weak.length} plus fragiles`) : `${weak.length} à découvrir`}>
              {started.length ? 'À retravailler' : 'À découvrir'}
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
