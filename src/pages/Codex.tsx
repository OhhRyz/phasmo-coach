import { useEffect, useMemo, useState } from 'react'
import { EvidenceTracker } from '../components/EvidenceTracker'
import { GhostCard } from '../components/GhostCard'
import { Icon } from '../components/Icon'
import { Empty, PageHeader, Seg } from '../components/ui'
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
  { value: 'early', label: 'Précoce (> 50 %)' },
  { value: 'normal', label: '50 %' },
  { value: 'late', label: 'Tardive (< 50 %)' },
]

function normalizeText(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function Toggle<T extends string>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="seg">
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

export function Codex() {
  const mastery = useMastery()
  const [initial] = useState(loadSession)
  const [filter, setFilter] = useState<FilterState>(initial.filter)
  const [query, setQuery] = useState(initial.query)

  // les filtres survivent à l'ouverture d'une fiche puis au retour
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ filter, query }))
    } catch {
      /* stockage indisponible */
    }
  }, [filter, query])
  const [showOut, setShowOut] = useState(false)
  const [showMore, setShowMore] = useState(
    initial.filter.speed.length > 0 || initial.filter.sanity.length > 0 || initial.filter.los !== null,
  )

  const active =
    Object.values(filter.evidence).some((m) => m && m !== 'unknown') ||
    filter.speed.length > 0 ||
    filter.sanity.length > 0 ||
    filter.los !== null ||
    filter.evidenceCount !== 3

  const { matching, out } = useMemo(() => {
    const q = normalizeText(query.trim())
    const byQuery = q
      ? GHOSTS.filter((g) =>
          [g.name, g.nameEn, g.summary, ...g.keyTells].some((t) => normalizeText(t).includes(q)),
        )
      : GHOSTS
    const m = filterGhosts(byQuery, filter)
    return { matching: m, out: byQuery.filter((g) => !m.includes(g)) }
  }, [filter, query])

  const possible = useMemo(() => possibleEvidence(matching), [matching])

  return (
    <div className="page">
      <PageHeader eyebrow="Codex" title="Les entités" actions={null}>
        {GHOSTS.length} entités, avec leurs preuves, vitesses, seuils de chasse et tests 0 preuve. Utilise les filtres
        comme sur le terrain pour éliminer les entités impossibles.
      </PageHeader>

      <section className="card card-pad codex-filters" aria-label="Filtres">
        <div className="row between">
          <div className="search" style={{ flex: '1 1 260px' }}>
            <Icon name="search" size={17} />
            <input
              className="input"
              type="search"
              placeholder="Rechercher une entité, un comportement…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher"
            />
          </div>
          <Seg
            label="Nombre de preuves de la partie"
            value={filter.evidenceCount}
            onChange={(v) => setFilter({ ...filter, evidenceCount: v })}
            options={[
              { value: 3, label: '3 preuves' },
              { value: 2, label: '2' },
              { value: 1, label: '1' },
              { value: 0, label: '0' },
            ]}
          />
        </div>

        <EvidenceTracker value={filter.evidence} onChange={(evidence) => setFilter({ ...filter, evidence })} possible={possible} />

        <div className="row between">
          <p className="faint" style={{ fontSize: '0.8rem' }}>
            Clic : trouvée → exclue → non testée. Clic droit : exclure directement.
          </p>
          <div className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
              <Icon name="filter" size={16} />
              Vitesse, seuil, LdV
              <Icon name="chevronDown" size={14} style={{ transform: showMore ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
            </button>
            {active && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter(EMPTY_FILTER)}>
                <Icon name="refresh" size={16} />
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {showMore && (
          <div className="codex-more">
            <div className="field">
              <span>Vitesse observée</span>
              <Toggle items={SPEEDS} value={filter.speed} onChange={(speed) => setFilter({ ...filter, speed })} />
            </div>
            <div className="field">
              <span>Première chasse</span>
              <Toggle items={SANITY} value={filter.sanity} onChange={(sanity) => setFilter({ ...filter, sanity })} />
            </div>
            <div className="field">
              <span>Accélération en ligne de vue</span>
              <Seg
                label="Ligne de vue"
                value={filter.los === null ? 'any' : filter.los ? 'yes' : 'no'}
                onChange={(v) => setFilter({ ...filter, los: v === 'any' ? null : v === 'yes' })}
                options={[
                  { value: 'any', label: 'Indifférent' },
                  { value: 'yes', label: 'Oui' },
                  { value: 'no', label: 'Non' },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      <div className="row between codex-count">
        <h2>
          {matching.length} entité{matching.length > 1 ? 's' : ''} {active || query ? 'possible' + (matching.length > 1 ? 's' : '') : ''}
        </h2>
        {out.length > 0 && (active || query) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowOut((v) => !v)}>
            <Icon name={showOut ? 'eyeOff' : 'eye'} size={16} />
            {showOut ? 'Masquer' : 'Afficher'} les éliminées ({out.length})
          </button>
        )}
      </div>

      {matching.length === 0 ? (
        <div className="card">
          <Empty icon="ghost" title="Aucune entité ne correspond">
            <p>Vérifie le nombre de preuves de la partie ou retire un filtre.</p>
          </Empty>
        </div>
      ) : (
        <div className="ghost-grid">
          {matching.map((g) => (
            <GhostCard key={g.id} ghost={g} mastery={mastery[g.id] ?? 0} />
          ))}
        </div>
      )}

      {showOut && out.length > 0 && (
        <>
          <h2 className="codex-out-title">Éliminées</h2>
          <div className="ghost-grid">
            {out.map((g) => (
              <GhostCard key={g.id} ghost={g} mastery={mastery[g.id] ?? 0} dimmed />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
