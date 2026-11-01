import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EvidenceTracker, TrackerHow } from '../components/EvidenceTracker'
import { GhostRow } from '../components/GhostRow'
import { UvPrint } from '../components/journal/Charts'
import { Consigne, FileHead, H, Notebook, Page, RoughCircle, TapeButton, TypedLink } from '../components/journal/Journal'
import { Empty, Seg } from '../components/ui'
import { GHOSTS } from '../data'
import { EVIDENCE_IDS } from '../data/evidence'
import type { Ghost } from '../data/types'
import { le } from '../engine/cards'
import { EMPTY_FILTER, filterGhosts, marked, matchesEvidence, possibleEvidence, type FilterState } from '../engine/filter'
import { fr, NNBSP, type SpeedClass } from '../engine/format'
import { useMastery } from '../store/hooks'

const SPEEDS: { value: SpeedClass; label: string }[] = [
  { value: 'slow', label: 'Lente' },
  { value: 'normal', label: 'Normale' },
  { value: 'fast', label: 'Rapide' },
]
const HUNT_ABOVE: { value: number | null; label: string }[] = [
  { value: null, label: 'Pas d’info' },
  { value: 50, label: '50 %' },
  { value: 60, label: '60 %' },
  { value: 70, label: '70 %' },
]

const SESSION_KEY = 'phasmo-coach/codex-filter'

function loadSession(): { filter: FilterState; query: string } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      return { filter: { ...EMPTY_FILTER, ...v.filter, huntAbove: typeof v.filter?.huntAbove === 'number' ? v.filter.huntAbove : null }, query: typeof v.query === 'string' ? v.query : '' }
    }
  } catch {
    /* stockage indisponible */
  }
  return { filter: EMPTY_FILTER, query: '' }
}

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[\u00a0\u202f]/g, ' ')
    .toLowerCase()
}

/** Choix multiple : chaque option retenue est entourée au stylo (comme Seg). */
function Toggle<T extends string>({ items, value, onChange, label }: { items: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div className="opts" role="group" aria-label={label}>
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          className="opt"
          aria-pressed={value.includes(i.value)}
          onClick={() => onChange(value.includes(i.value) ? value.filter((v) => v !== i.value) : [...value, i.value])}
        >
          {i.label}
        </button>
      ))}
    </div>
  )
}

const s = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « le Mimic », « l’Esprit et le Spectre », « la Banshee, le Démon, l’Oni et 4 autres » */
function nameList(ghosts: readonly Ghost[], max = 3): string {
  const names = ghosts.map((g) => le(g.name))
  if (names.length <= max) return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : (names[0] ?? '')
  const rest = names.length - max
  return `${names.slice(0, max).join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`
}

/** Ce qui écarte des entités : les preuves cochées, les autres critères (vitesse, seuil, ligne de vue), ou les deux. */
function excludedBy(ghosts: readonly Ghost[], filter: FilterState): string {
  const count = filter.evidenceCount === 3 ? '' : ` (partie à ${s(filter.evidenceCount, 'preuve')})`
  if (ghosts.every((g) => !matchesEvidence(g, filter))) return `Tes preuves cochées${count}`
  if (ghosts.some((g) => !matchesEvidence(g, filter))) return `Tes preuves cochées${count} et tes critères de vitesse, de seuil ou de ligne de vue`
  return 'Tes critères de vitesse, de seuil ou de ligne de vue'
}

/** Que faire quand plus rien ne colle avec le carnet. */
function noneHint(ticked: boolean, moreCount: number): string {
  if (ticked && moreCount > 0) return 'vérifie tes preuves cochées et le nombre de preuves de la partie, ou retire un critère de vitesse, de seuil ou de ligne de vue'
  if (moreCount > 0) return 'retire un critère de vitesse, de seuil ou de ligne de vue'
  return 'vérifie le nombre de preuves de la partie, ou décoche une preuve'
}

const PHONE = '(max-width: 759px)'

/** Vrai tant que la fenêtre correspond à la requête (suit les changements de taille). */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia(query)
    const sync = () => setOn(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return on
}

export function Codex() {
  const mastery = useMastery()
  const [initial] = useState(loadSession)
  const [filter, setFilter] = useState<FilterState>(initial.filter)
  const [query, setQuery] = useState(initial.query)
  // sur ordinateur, les éliminées restent dans le registre, barrées au crayon (on peut les masquer) ; tant
  // qu'on n'a rien choisi, elles s'effacent d'elles-mêmes quand il n'en reste que trois ou moins. Sur
  // téléphone, le registre est loin sous les preuves : on n'y montre d'emblée que ce qui reste possible.
  const [outPref, setOutPref] = useState<boolean | null>(null)
  const phone = useMedia(PHONE)
  const regRef = useRef<HTMLElement>(null)
  const [showMore, setShowMore] = useState(
    initial.filter.speed.length > 0 || initial.filter.huntAbove != null || initial.filter.los !== null,
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
    filter.huntAbove != null ||
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

  // ce que dit le carnet de preuves seul, sans la recherche (le compte du carnet et sa conclusion)
  const pool = useMemo(() => filterGhosts(GHOSTS, filter), [filter])
  const possible = useMemo(() => possibleEvidence(pool, filter), [pool, filter])
  // la recherche ne trouve que des entités écartées par le carnet : on les montre barrées, avec la raison
  const searchedOut = query.trim() !== '' && matching.length === 0 && out.length > 0
  const showOut = outPref ?? (searchedOut || (phone ? false : matching.length > 3))

  // le registre garde l'ordre du journal du jeu ; les éliminées y restent, barrées
  const rows = useMemo(() => {
    const keep = new Set([...matching, ...(showOut ? out : [])])
    return GHOSTS.map((g, i) => ({ g, n: i + 1 })).filter(({ g }) => keep.has(g))
  }, [matching, out, showOut])

  // sur ordinateur, le carnet de preuves reste à l'écran pendant qu'on parcourt le registre (s'il tient en hauteur)
  const stickyRef = useRef<HTMLDivElement>(null)
  const [fits, setFits] = useState(false)
  useLayoutEffect(() => {
    const el = stickyRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setFits(el.offsetHeight + 40 <= window.innerHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const found = marked(filter, 'found').length
  const excluded = marked(filter, 'excluded').length
  const searching = active || query.trim() !== ''
  const only = searching && matching.length === 1 ? matching[0] : null
  const moreCount = filter.speed.length + (filter.huntAbove != null ? 1 : 0) + (filter.los !== null ? 1 : 0)
  // la réponse du carnet, lisible juste sous le titre (sur téléphone le registre est loin en dessous)
  const marks = [found > 0 && s(found, 'trouvée'), excluded > 0 && s(excluded, 'absente')].filter(Boolean)
  const headCount = marks.length
    ? `${marks.join(' · ')} · ${pool.length === 0 ? 'aucune possible' : s(pool.length, 'possible')}`
    : 'rien de coché'
  const ticked = found + excluded > 0
  // une preuve encore non testée mais impossible avec les entités qui restent : grisée dans le carnet
  const greyed = ticked && EVIDENCE_IDS.some((id) => (filter.evidence[id] ?? 'unknown') === 'unknown' && !possible.has(id))

  /** « voir la liste » : amène le registre sous les yeux et y place le focus (lecteurs d'écran, clavier). */
  const toRegistry = () => {
    const el = regRef.current
    if (!el) return
    const smooth = typeof matchMedia !== 'undefined' && !matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    el.focus({ preventScroll: true })
  }

  return (
    <Notebook className="cx-book">
      {/* ===================== page de gauche : le carnet de preuves ===================== */}
      <Page side="left" section="3" label="Mon carnet de preuves" className="cx-left">
        <div className={`cx-sticky${fits ? ' is-fit' : ''}`} ref={stickyRef}>
          <FileHead>
            <span>
              <b>Codex</b> · carnet de preuves
            </span>
            <span>
              Partie à <b>{filter.evidenceCount}</b> preuve{filter.evidenceCount > 1 ? 's' : ''}
            </span>
          </FileHead>

          <H as="h1" count={headCount}>
            Mon carnet de preuves
          </H>
          <p className="cx-intro">
            Pendant une partie, coche ici les preuves que tu trouves{NNBSP}: le registre barre les entités qui ne collent plus. Touche un
            nom pour lire sa fiche.
          </p>

          <div className="cx-count-field">
            <span className="typed-label">
              Preuves dans la partie
            </span>
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
            <span className="pencil-note cx-count-hint">Cauchemar : 2 · Démence : 1</span>
          </div>

          <div className="cx-tracker">
            <Consigne className="cx-how">
              <TrackerHow />
            </Consigne>
            <EvidenceTracker value={filter.evidence} onChange={(evidence) => setFilter({ ...filter, evidence })} possible={possible} />
            {(ticked || moreCount > 0) && matching.length > 1 && (
              <button type="button" className="link-btn pencil-note cx-see" onClick={toRegistry}>
                {phone ? '↓' : '→'} {matching.length} entités encore possibles{NNBSP}: voir la liste
              </button>
            )}
            {greyed && <p className="cx-tracker-hint pencil-note">preuve grisée{NNBSP}: impossible avec ce qui reste</p>}
          </div>

          {/* la conclusion arrive là où l'œil se trouve : juste sous les preuves */}
          {active && pool.length === 0 && <p className="pencil-note cx-none">{fr(`aucune entité ne colle : ${noneHint(ticked, moreCount)}`)}</p>}
          {only && (
            <div className="cx-actions cx-actions--verdict">
              <p className="cx-verdict">
                <span className="typed-label">Il ne reste que</span>
                <RoughCircle seed={`only-${only.id}`} padX={0.08} padY={0.22} delay={0.2}>
                  <span className="cx-verdict-name">{only.name}</span>
                </RoughCircle>
              </p>
              <TapeButton to={`/codex/${only.id}`}>Ouvrir sa fiche</TapeButton>
            </div>
          )}

          <label className="field cx-search">
            <span>Chercher dans le codex</span>
            <input
              className="input"
              type="search"
              placeholder="un nom, un comportement…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <div className="cx-more-bar">
            <button
              type="button"
              className="link link-btn cx-more-toggle"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              aria-controls="cx-more"
            >
              {showMore ? 'Replier vitesse, seuil et ligne de vue' : 'Vitesse, seuil et ligne de vue'}
              {!showMore && moreCount > 0 && <span className="cx-more-n"> ({moreCount})</span>}
            </button>
            {active && <TypedLink onClick={() => setFilter(EMPTY_FILTER)}>Tout effacer</TypedLink>}
          </div>

          {/* toujours rendu (masqué quand replié) : aria-controls pointe vers un élément qui existe */}
          <div className="cx-more" id="cx-more" hidden={!showMore}>
            <div className="field">
              <span>Vitesse en chasse</span>
              <Toggle label="Vitesse" items={SPEEDS} value={filter.speed} onChange={(speed) => setFilter({ ...filter, speed })} />
              <span className="pencil-note cx-field-hint">plusieurs choix possibles · normale = 1,7 m/s</span>
            </div>
            <div className="field">
              <span>Une chasse a démarré au-dessus de</span>
              <Seg
                label="Chasse observée au-dessus de cette santé moyenne"
                value={filter.huntAbove ?? -1}
                onChange={(v) => setFilter({ ...filter, huntAbove: v < 0 ? null : v })}
                options={HUNT_ABOVE.map((h) => ({ value: h.value ?? -1, label: h.label }))}
              />
              <span className="pencil-note cx-field-hint">de santé mentale moyenne</span>
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
        </div>
        <span className="folio">— ii —</span>
      </Page>

      {/* ===================== page de droite : le registre ===================== */}
      <Page side="right" section="3" label="Registre des entités" className="cx-right">
        {/* au-dessus du registre : la marge plus bas porte les remarques au crayon des lignes */}
        <UvPrint style={{ right: 2, top: 150, width: 104, transform: 'rotate(14deg)', ['--ur' as string]: '200px' }} />
        <FileHead>
          <span>Registre</span>
          <span>Ordre du journal du jeu</span>
        </FileHead>

        <section aria-labelledby="cx-h-reg" className="cx-reg-section" ref={regRef} tabIndex={-1}>
          <H id="cx-h-reg">Les {GHOSTS.length} entités</H>

          <div className="cx-count" aria-live="polite">
            <span className="cx-count-n">
              {only ? (
                <RoughCircle seed="cx-count-one" padX={0.1} padY={0.1} delay={0.15}>
                  <b>1</b> possible
                </RoughCircle>
              ) : (
                <>
                  <b>{matching.length === 0 ? 'Aucune' : matching.length}</b> {!active && query.trim() ? 'trouvée' : 'possible'}
                  {matching.length > 1 ? 's' : ''}
                </>
              )}
            </span>
            {out.length > 0 && (
              <span className="cx-count-out">
                <span id="cx-out-n">{s(out.length, 'éliminée')}</span>
                <button type="button" className="link link-btn cx-out-toggle" aria-describedby="cx-out-n" onClick={() => setOutPref(!showOut)}>
                  {out.length === 1 ? (showOut ? 'la masquer' : 'la revoir') : showOut ? 'les masquer' : 'les revoir'}
                </button>
              </span>
            )}
            {!searching && <span className="pencil-note cx-count-note">coche une preuve : ce qui ne colle plus sera barré</span>}
          </div>

          {searchedOut ? (
            <Empty title={out.length === 1 ? 'Entité écartée par ton carnet' : 'Entités écartées par ton carnet'}>
              <p>
                {excludedBy(out, filter)} écartent {nameList(out)}
                {showOut ? (
                  <>. {out.length === 1 ? 'Sa ligne reste barrée' : 'Leurs lignes restent barrées'} ci-dessous.</>
                ) : (
                  <>
                    {NNBSP}:{' '}
                    <button type="button" className="link link-btn" onClick={() => setOutPref(true)}>
                      {out.length === 1 ? 'revoir sa ligne barrée' : 'revoir leurs lignes barrées'}
                    </button>
                  </>
                )}
              </p>
              <p className="cx-empty-act">
                <TypedLink onClick={() => setFilter(EMPTY_FILTER)}>Tout effacer</TypedLink>
              </p>
            </Empty>
          ) : (
            matching.length === 0 &&
            (query.trim() && out.length === 0 ? (
              <Empty title="Aucune entité ne correspond à ta recherche">
                <p>Essaie un autre mot{NNBSP}: un nom ou un comportement.</p>
              </Empty>
            ) : (
              <Empty title="Aucune entité ne correspond">
                <p>{fr(`${noneHint(ticked, moreCount).replace(/^./, (c) => c.toUpperCase())}.`)}</p>
                {active && (
                  <p className="cx-empty-act">
                    <TypedLink onClick={() => setFilter(EMPTY_FILTER)}>Tout effacer</TypedLink>
                  </p>
                )}
              </Empty>
            ))
          )}

          {rows.length > 0 && (
            <>
              <div className="cx-cols" aria-hidden>
                <span>N°</span>
                <span>Entité · preuves</span>
                <span>Maîtrise</span>
                <span>Vitesse · seuil</span>
              </div>
              <ol className="cx-reg">
                {rows.map(({ g, n }) => (
                  <GhostRow key={g.id} ghost={g} n={n} mastery={mastery[g.id] ?? 0} dimmed={!matching.includes(g)} circled={only === g} />
                ))}
              </ol>
            </>
          )}

          {rows.length > 0 && <p className="cx-foot pencil-note">chaque ligne ouvre la fiche de l’entité</p>}
        </section>

        {/* s'exercer, une fois le registre parcouru : le carnet se remplit sur un contrat simulé */}
        <p className="cx-train">
          <TypedLink to="/enquete">S’entraîner sur un contrat simulé</TypedLink>
          <span className="pencil-note cx-train-hint">pour apprendre à remplir ce carnet de preuves, rapport après rapport</span>
        </p>
        <span className="folio">— iii —</span>
      </Page>
    </Notebook>
  )
}
