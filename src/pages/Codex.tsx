import { useEffect, useMemo, useState } from 'react'
import { EvidenceTracker } from '../components/EvidenceTracker'
import { GhostRow } from '../components/GhostRow'
import { Empty, PageHead, Seg } from '../components/ui'
import { GHOSTS } from '../data'
import { EMPTY_FILTER, filterGhosts, possibleEvidence, type FilterState } from '../engine/filter'
import type { SanityClass, SpeedClass } from '../engine/format'
import { useMastery } from '../store/hooks'

const SPEEDS: { value: SpeedClass; label: string }[] = [
  { value: 'slow', label: 'Lente' },
  { value: 'normal', label: 'Normale' },
  { value: 'fast', label: 'Rapide' },
]
const SANITY: { value: SanityClass; label: string }[] = [
  { value: 'early', label: 'Au-dessus de 50 %' },
  { value: 'normal', label: 'À 50 %' },
  { value: 'late', label: 'Sous 50 %' },
]

const SESSION_KEY = 'phasmo-coach/codex-filter'

function loadSession(): { filter: FilterState; query: string } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      return { filter: { ...EMPTY_FILTER, ...v.filter }, query: typeof v.query === 'string' ? v.query : '' }
    }
  } catch {
    /* stockage indisponible */
  }
  return { filter: EMPTY_FILTER, query: '' }
}

function normalizeText(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function Toggle<T extends string>({ items, value, onChange, label }: { items: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          aria-pressed={value.includes(i.value)}
          onClick={() => onChange(value.includes(i.value) ? value.filter((v) => v !== i.value) : [...value, i.value])}
        >
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Codex() {
  const mastery = useMastery()
  const [initial] = useState(loadSession)
  const [filter, setFilter] = useState<FilterState>(initial.filter)
  const [query, setQuery] = useState(initial.query)
  const [showOut, setShowOut] = useState(false)
  const [showMore, setShowMore] = useState(
    initial.filter.speed.length > 0 || initial.filter.sanity.length > 0 || initial.filter.los !== null,
  )

  // les filtres survivent à l'ouverture d'une fiche puis au retour
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ filter, query }))
    } catch {
      /* stockage indisponible */
    }
  }, [filter, query])

  const active =
    Object.values(filter.evidence).some((m) => m && m !== 'unknown') ||
    filter.speed.length > 0 ||
    filter.sanity.length > 0 ||
    filter.los !== null ||
    filter.evidenceCount !== 3

  const { matching, out } = useMemo(() => {
    const q = normalizeText(query.trim())
    const byQuery = q
      ? GHOSTS.filter((g) => [g.name, g.nameEn, g.summary, ...g.keyTells].some((t) => normalizeText(t).includes(q)))
      : GHOSTS
    const m = filterGhosts(byQuery, filter)
    return { matching: m, out: byQuery.filter((g) => !m.includes(g)) }
  }, [filter, query])

  const possible = useMemo(() => possibleEvidence(matching), [matching])

  return (
    <div className="page">
      <PageHead title="Codex">
        Les {GHOSTS.length} entités, leurs preuves, vitesses et seuils de chasse. Coche les preuves comme sur le terrain : la liste
        ne garde que les entités encore possibles.
      </PageHead>

      <section className="codex-filters" aria-label="Filtres">
        <div className="filters-top">
          <input
            className="input"
            type="search"
            placeholder="Chercher une entité ou un comportement"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher"
          />
          <div className="field-inline">
            <span className="faint small">Preuves dans la partie</span>
            <Seg
              label="Nombre de preuves de la partie"
              value={filter.evidenceCount}
              onChange={(v) => setFilter({ ...filter, evidenceCount: v })}
              options={[
                { value: 3, label: '3' },
                { value: 2, label: '2' },
                { value: 1, label: '1' },
                { value: 0, label: '0' },
              ]}
            />
          </div>
        </div>

        <EvidenceTracker value={filter.evidence} onChange={(evidence) => setFilter({ ...filter, evidence })} possible={possible} />

        <div className="row between filters-foot">
          <span className="faint small">Un clic : trouvée. Deux : exclue. Trois : on efface.</span>
          <span className="row" style={{ '--gap': '16px' } as React.CSSProperties}>
            <button type="button" className="link-btn muted-link" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
              {showMore ? 'Masquer' : 'Vitesse, seuil et ligne de vue'}
            </button>
            {active && (
              <button type="button" className="link-btn" onClick={() => setFilter(EMPTY_FILTER)}>
                Tout effacer
              </button>
            )}
          </span>
        </div>

        {showMore && (
          <div className="codex-more">
            <div className="field">
              <span>Vitesse observée</span>
              <Toggle label="Vitesse" items={SPEEDS} value={filter.speed} onChange={(speed) => setFilter({ ...filter, speed })} />
            </div>
            <div className="field">
              <span>Première chasse</span>
              <Toggle label="Première chasse" items={SANITY} value={filter.sanity} onChange={(sanity) => setFilter({ ...filter, sanity })} />
            </div>
            <div className="field">
              <span>Accélère en ligne de vue</span>
              <Seg
                label="Ligne de vue"
                value={filter.los === null ? 'any' : filter.los ? 'yes' : 'no'}
                onChange={(v) => setFilter({ ...filter, los: v === 'any' ? null : v === 'yes' })}
                options={[
                  { value: 'any', label: 'Peu importe' },
                  { value: 'yes', label: 'Oui' },
                  { value: 'no', label: 'Non' },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      <div className="section-head codex-count">
        <h2>
          {active || query
            ? `${matching.length} entité${matching.length > 1 ? 's' : ''} possible${matching.length > 1 ? 's' : ''}`
            : `${matching.length} entités`}
        </h2>
        {out.length > 0 && (active || query) && (
          <button type="button" className="link-btn muted-link" onClick={() => setShowOut((v) => !v)}>
            {showOut ? 'Masquer' : 'Voir'} les {out.length} éliminée{out.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {matching.length === 0 ? (
        <Empty title="Aucune entité ne correspond">
          <p>Vérifie le nombre de preuves de la partie, ou retire un filtre.</p>
        </Empty>
      ) : (
        <table className="index">
          <thead>
            <tr>
              <th scope="col">Entité</th>
              <th scope="col">Preuves</th>
              <th scope="col">Vitesse</th>
              <th scope="col">Accél. LdV</th>
              <th scope="col">Seuil</th>
              <th scope="col">Maîtrise</th>
            </tr>
          </thead>
          <tbody>
            {matching.map((g) => (
              <GhostRow key={g.id} ghost={g} mastery={mastery[g.id] ?? 0} />
            ))}
            {showOut && out.map((g) => <GhostRow key={g.id} ghost={g} mastery={mastery[g.id] ?? 0} dimmed />)}
          </tbody>
        </table>
      )}
    </div>
  )
}
