import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { EvidenceTracker, TrackerHow } from '../components/EvidenceTracker'
import { GhostRow } from '../components/GhostRow'
import { FROM_CODEX } from './codexReturn'
import { useToast } from '../components/Toast'
import { UvPrint } from '../components/journal/Charts'
import { Consigne, FileHead, H, Notebook, Page, RoughCircle, TapeButton, TypedLink } from '../components/journal/Journal'
import { Empty, Seg, useMedia } from '../components/ui'
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

/** Le carnet gardé pour l'onglet : preuves et critères, la recherche, et l'entrée d'historique où elle a été tapée. */
interface SavedCodex {
  filter: FilterState
  query: string
  key?: string
}

function loadSession(): SavedCodex {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      return {
        filter: { ...EMPTY_FILTER, ...v.filter, huntAbove: typeof v.filter?.huntAbove === 'number' ? v.filter.huntAbove : null },
        query: typeof v.query === 'string' ? v.query : '',
        key: typeof v.key === 'string' ? v.key : undefined,
      }
    }
  } catch {
    /* stockage indisponible */
  }
  return { filter: EMPTY_FILTER, query: '' }
}

/**
 * La recherche tapée revient-elle ? Seulement par le bouton « Précédent » (ou un rechargement) sur la page du
 * codex où elle a été tapée : on revient d'une fiche ouverte depuis elle. Entré à neuf dans le codex (onglet,
 * lien, accueil), on repart sans recherche : un vieux « Obambo » ne trie plus en silence la partie suivante.
 * Les preuves cochées, elles, restent : la partie en cours continue.
 */
export function keepsSearch(saved: Pick<SavedCodex, 'query' | 'key'>, navigationType: string, key: string): boolean {
  return saved.query !== '' && navigationType === 'POP' && saved.key === key
}

const SPEED_WORD: Record<SpeedClass, string> = { slow: 'lente', normal: 'normale', fast: 'rapide' }

/** Les critères en cours, en toutes lettres : « vitesse lente ou rapide · chasse au-dessus de 60 % de santé ». */
export function criteriaText(filter: FilterState): string {
  const parts: string[] = []
  if (filter.speed.length) parts.push(`vitesse ${SPEEDS.filter((v) => filter.speed.includes(v.value)).map((v) => SPEED_WORD[v.value]).join(' ou ')}`)
  if (filter.huntAbove != null) parts.push(`chasse au-dessus de ${filter.huntAbove} % de santé`)
  if (filter.los !== null) parts.push(filter.los ? 'accélère en ligne de vue' : 'n’accélère pas en ligne de vue')
  return fr(parts.join(' · '))
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

/** Un nom tel qu'on le tape : sans accents ni majuscules, sans article (« le Démon », « les Jumeaux », « The Twins »). */
function nameKey(s: string): string {
  return normalizeText(s)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:(?:le|la|les|the) |l')/u, '')
}

/**
 * L'entité dont la recherche est exactement le nom, en français ou en anglais (« Démon », « ombre », « le
 * mimic », « Twins »), ou null. D'autres fiches citent son nom (l'Oni parle du Démon) : la recherche ne
 * trouve alors qu'elle.
 */
export function exactName<T extends Pick<Ghost, 'name' | 'nameEn'>>(ghosts: readonly T[], query: string): T | null {
  const q = nameKey(query)
  if (!q) return null
  const hits = ghosts.filter((g) => nameKey(g.name) === q || nameKey(g.nameEn) === q)
  return hits.length === 1 ? hits[0] : null
}

/**
 * Les textes d'une fiche où cherche le Codex, dans l'ordre où l'on en tire l'extrait : description, « À
 * retenir », signes, tests, observations, vitesse et seuil. Pas « Ne pas confondre » : ces lignes décrivent
 * d'autres entités.
 */
export function searchTexts(g: Ghost): string[] {
  return [
    g.summary,
    ...g.keyTells,
    ...g.tells.map((t) => t.text),
    ...g.behaviors.map((t) => t.text),
    ...g.abilities.map((t) => t.text),
    ...g.confirmationTests.map((t) => t.text),
    ...g.eliminationTests.map((t) => t.text),
    ...g.observations.map((o) => o.text),
    ...g.speed.details,
    ...g.huntSanity.details,
  ]
}

/**
 * Ce que trouve la recherche, et ce qu'en garde le carnet : `matching`, les entités qui collent ; `out`,
 * celles que la recherche trouve mais que le carnet écarte. Le nom exact d'une entité ne trouve qu'elle.
 */
export function searchCodex(ghosts: readonly Ghost[], query: string, filter: FilterState): { matching: Ghost[]; out: Ghost[] } {
  const q = normalizeText(query.trim())
  const exact = exactName(ghosts, query)
  const byQuery = exact
    ? [exact]
    : q
      ? ghosts.filter((g) => [g.name, g.nameEn, ...searchTexts(g)].some((t) => normalizeText(t).includes(q)))
      : [...ghosts]
  const matching = filterGhosts(byQuery, filter)
  return { matching, out: byQuery.filter((g) => !matching.includes(g)) }
}

/** Un extrait de fiche autour du mot cherché : le mot trouvé, tel qu'il s'écrit, entre ce qui l'entoure. */
export interface Snippet {
  before: string
  hit: string
  after: string
}

/** Un texte sans accents ni majuscules, avec pour chaque caractère sa place dans le texte d'origine. */
function normalizedWithMap(text: string): { norm: string; at: number[] } {
  let norm = ''
  const at: number[] = []
  let i = 0
  for (const ch of text) {
    const n = normalizeText(ch)
    norm += n
    for (let k = 0; k < n.length; k++) at.push(i)
    i += ch.length
  }
  return { norm, at }
}

const WORD = /[\p{L}\d]/u

/**
 * Pourquoi la recherche a trouvé cette entité, quand ce n'est pas par son nom : un court extrait de sa fiche
 * autour du mot (« … toutes les 2 minutes à la montre du jeu… »). De préférence un mot qui commence par ce
 * qu'on a tapé ; null si le nom correspond, ou si rien ne correspond.
 */
export function searchSnippet(g: Ghost, query: string, room = { before: 42, after: 64 }): Snippet | null {
  const q = normalizeText(query.trim())
  if (!q || [g.name, g.nameEn].some((n) => normalizeText(n).includes(q))) return null
  const texts = searchTexts(g).map((t) => ({ t, ...normalizedWithMap(t) }))
  const find = (wordStart: boolean) => {
    for (const x of texts) {
      for (let j = x.norm.indexOf(q); j >= 0; j = x.norm.indexOf(q, j + 1)) {
        if (!wordStart || j === 0 || !WORD.test(x.norm[j - 1])) return { x, j }
      }
    }
    return null
  }
  const found = find(true) ?? find(false)
  if (!found) return null
  const { x, j } = found
  const start = x.at[j]
  const last = x.at[j + q.length - 1]
  const end = last + (x.t.codePointAt(last)! > 0xffff ? 2 : 1)
  // l'extrait s'arrête sur des mots entiers, avec « … » là où il coupe la phrase
  let from = Math.max(0, start - room.before)
  if (from > 0) {
    const space = x.t.indexOf(' ', from)
    from = space >= 0 && space < start ? space + 1 : start
  }
  let to = Math.min(x.t.length, end + room.after)
  if (to < x.t.length) {
    const space = x.t.lastIndexOf(' ', to)
    to = space >= end ? space : end
  }
  const before = x.t.slice(from, start)
  const after = x.t.slice(end, to).replace(/[\s,;:]+$/u, '')
  return { before: (from > 0 ? '…' : '') + before, hit: x.t.slice(start, end), after: after + (to < x.t.length ? '…' : '') }
}

/**
 * Entrée dans la recherche : la fiche à ouvrir quand une seule entité correspond. Celle qui reste avec le
 * carnet, sinon la seule que trouve la recherche (même écartée par le carnet) ; null s'il y a le choix.
 */
export function searchTarget<T>(matching: readonly T[], out: readonly T[]): T | null {
  if (matching.length === 1) return matching[0]
  return matching.length === 0 && out.length === 1 ? out[0] : null
}

const PHONE = '(max-width: 759px)'

export function Codex() {
  const mastery = useMastery()
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const toast = useToast()
  const searchId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const [initial] = useState(() => {
    const saved = loadSession()
    return { filter: saved.filter, query: keepsSearch(saved, navigationType, location.key) ? saved.query : '' }
  })
  const [filter, setFilter] = useState<FilterState>(initial.filter)
  const [query, setQuery] = useState(initial.query)
  // sur ordinateur, les éliminées restent dans le registre, barrées au crayon (on peut les masquer) ; tant
  // qu'on n'a rien choisi, elles s'effacent d'elles-mêmes quand il n'en reste que trois ou moins. Sur
  // téléphone, le registre est loin sous les preuves : on n'y montre d'emblée que ce qui reste possible.
  const [outPref, setOutPref] = useState<boolean | null>(null)
  const phone = useMedia(PHONE)
  const regRef = useRef<HTMLElement>(null)
  // partie sans preuve : seuls la vitesse, le seuil et la ligne de vue trient, ils sont dépliés d'office
  const [showMore, setShowMore] = useState(
    initial.filter.speed.length > 0 || initial.filter.huntAbove != null || initial.filter.los !== null || initial.filter.evidenceCount === 0,
  )

  // les filtres survivent à l'ouverture d'une fiche puis au retour (la recherche, au seul retour arrière : keepsSearch)
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ filter, query, key: location.key }))
    } catch {
      /* stockage indisponible */
    }
  }, [filter, query, location.key])

  const active =
    Object.values(filter.evidence).some((m) => m && m !== 'unknown') ||
    filter.speed.length > 0 ||
    filter.huntAbove != null ||
    filter.los !== null ||
    filter.evidenceCount !== 3

  const { matching, out } = useMemo(() => searchCodex(GHOSTS, query, filter), [filter, query])

  // ce que dit le carnet de preuves seul, sans la recherche (le compte du carnet et sa conclusion)
  const pool = useMemo(() => filterGhosts(GHOSTS, filter), [filter])
  const possible = useMemo(() => possibleEvidence(pool, filter), [pool, filter])
  // la recherche ne trouve que des entités écartées par le carnet : on les montre barrées, avec la raison
  const searchedOut = query.trim() !== '' && matching.length === 0 && out.length > 0
  const showOut = outPref ?? (searchedOut || (phone ? false : matching.length > 3))

  // le registre garde l'ordre du journal du jeu ; les éliminées y restent, barrées. Trouvée par un mot de sa
  // fiche (pas par son nom) : un extrait montre le mot dans sa phrase
  const rows = useMemo(() => {
    const keep = new Set([...matching, ...(showOut ? out : [])])
    return GHOSTS.map((g, i) => ({ g, n: i + 1 }))
      .filter(({ g }) => keep.has(g))
      .map((r) => ({ ...r, snippet: query.trim() ? searchSnippet(r.g, query) : null }))
  }, [matching, out, showOut, query])

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

  // « Tout effacer » efface une partie en cours : le message propose d'annuler quelques secondes (et part avec la page)
  const undoToast = useRef<(() => void) | null>(null)
  useEffect(() => () => undoToast.current?.(), [])
  // `keyboard` : « Tout effacer » touché au clavier ; le lien disparaît avec ce qu'il efface, le focus va donc
  // sur « Annuler » du message, puis revient au champ de recherche
  const clearWithUndo = (keepQuery: boolean, keyboard = false) => {
    const before = { filter, query }
    const search = !keepQuery && query.trim() !== ''
    setFilter(EMPTY_FILTER)
    if (!keepQuery) setQuery('')
    undoToast.current?.()
    undoToast.current = toast(
      active && search ? 'Carnet de preuves et recherche effacés' : active ? 'Carnet de preuves effacé' : 'Recherche effacée',
      {
        label: 'Annuler',
        onClick: () => {
          undoToast.current = null
          setFilter(before.filter)
          setQuery(before.query)
          if (before.filter.speed.length || before.filter.huntAbove != null || before.filter.los !== null) setShowMore(true)
        },
        ...(keyboard ? { focus: true, restore: () => requestAnimationFrame(() => searchRef.current?.focus()) } : {}),
      },
    )
  }
  // « Tout effacer » : le carnet de preuves, les critères et la recherche
  const clearAll = (e?: { detail: number }) => clearWithUndo(false, e?.detail === 0)
  const searched = query.trim()
  // Entrée dans la recherche : une seule entité correspond, sa fiche s'ouvre
  const target = searched ? searchTarget(matching, out) : null

  const found = marked(filter, 'found').length
  const excluded = marked(filter, 'excluded').length
  const searching = active || searched !== ''
  const only = searching && matching.length === 1 ? matching[0] : null
  // le carnet seul conclut (entouré au stylo rouge) ; une recherche, elle, trouve sans rien déduire (pas de cercle)
  const deduced = !!only && pool.length === 1
  const moreCount = filter.speed.length + (filter.huntAbove != null ? 1 : 0) + (filter.los !== null ? 1 : 0)
  // la réponse du carnet, lisible juste sous le titre (sur téléphone le registre est loin en dessous)
  const marks = [found > 0 && s(found, 'trouvée'), excluded > 0 && s(excluded, 'absente')].filter(Boolean)
  const headCount =
    marks.length || moreCount > 0
      ? `${marks.length ? marks.join(' · ') : 'aucune preuve cochée'} · ${pool.length === 0 ? 'aucune possible' : s(pool.length, 'possible')}`
      : searched
        ? 'aucune preuve cochée'
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
          {/* ce qui trie le registre en plus des preuves, toujours sous les yeux (sur téléphone, le champ est loin dessous) */}
          {(searched !== '' || moreCount > 0) && (
            <div className="cx-status">
              {searched !== '' && (
                <p className="cx-status-line">
                  <span className="typed-label">Recherche</span>
                  <span className="cx-status-q">
                    «{NNBSP}
                    {searched}
                    {NNBSP}»
                  </span>
                  {/* le « · » et « Effacer » vont ensemble : à la ligne, le séparateur n'ouvre jamais seul la ligne */}
                  <span className="cx-status-act">
                    <span className="cx-status-sep" aria-hidden>
                      ·
                    </span>
                    <TypedLink onClick={() => setQuery('')}>
                      Effacer<span className="sr-only"> la recherche</span>
                    </TypedLink>
                  </span>
                </p>
              )}
              {moreCount > 0 && (
                <p className="cx-status-line">
                  <span className="typed-label">Critères</span>
                  <span className="cx-status-q">{criteriaText(filter)}</span>
                  <span className="cx-status-act">
                    <span className="cx-status-sep" aria-hidden>
                      ·
                    </span>
                    <TypedLink onClick={() => setFilter({ ...filter, speed: [], huntAbove: null, los: null })}>
                      Effacer<span className="sr-only"> les critères</span>
                    </TypedLink>
                  </span>
                </p>
              )}
            </div>
          )}
          <p className="cx-intro">
            Pendant une partie, coche ici les preuves que tu trouves{NNBSP}: le registre barre les entités qui ne collent plus.{' '}
            <span className="on-mouse">Clique sur un nom</span>
            <span className="on-touch">Touche un nom</span> pour lire sa fiche.
          </p>

          <div className="cx-count-field">
            <span className="typed-label">
              Preuves dans la partie
            </span>
            <Seg
              label="Nombre de preuves de la partie"
              value={filter.evidenceCount}
              onChange={(v) => {
                setFilter({ ...filter, evidenceCount: v })
                if (v === 0) setShowMore(true)
              }}
              options={[
                { value: 3, label: '3' },
                { value: 2, label: '2' },
                { value: 1, label: '1' },
                { value: 0, label: '0' },
              ]}
            />
            <span className="pencil-note cx-count-hint">{fr('difficulté Cauchemar : 2 · Démence : 1')}</span>
          </div>
          {filter.evidenceCount === 0 && (
            <p className="pencil-note cx-zero">
              {fr('partie sans preuve : seul le Mimic montre encore des orbes, les autres cases sont grisées exprès. Trie avec la vitesse, le seuil et la ligne de vue (plus bas), puis lis les tests « Sans preuve » de chaque fiche.')}
            </p>
          )}

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
                {/* une recherche par le nom n'élimine rien : elle trouve */}
                <span className="typed-label">{deduced ? 'Il ne reste que' : 'Résultat de ta recherche'}</span>
                {deduced ? (
                  <RoughCircle seed={`only-${only.id}`} padX={0.08} padY={0.22} delay={0.2}>
                    <span className="cx-verdict-name">{only.name}</span>
                  </RoughCircle>
                ) : (
                  <span className="cx-verdict-name">{only.name}</span>
                )}
              </p>
              <TapeButton to={`/codex/${only.id}`} state={FROM_CODEX}>
                Ouvrir sa fiche
              </TapeButton>
            </div>
          )}

          {/* Entrée (« Rechercher » sur le clavier du téléphone) ouvre la fiche quand une seule entité correspond */}
          <form
            className="field cx-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (target) navigate(`/codex/${target.id}`, { state: FROM_CODEX })
            }}
          >
            <label className="field-label" htmlFor={searchId}>
              Chercher dans le codex
            </label>
            <div className="cx-search-line">
              <input
                ref={searchRef}
                id={searchId}
                className="input"
                type="search"
                enterKeyHint="search"
                placeholder="un nom, un comportement…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {/* le mot reste visible tant que le champ n'est pas vide (la croix du navigateur n'apparaît qu'au survol) */}
              {query !== '' && (
                <button
                  type="button"
                  className="link link-btn cx-search-clear"
                  onClick={() => {
                    setQuery('')
                    searchRef.current?.focus()
                  }}
                >
                  Effacer<span className="sr-only"> la recherche</span>
                </button>
              )}
            </div>
          </form>

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
            {(active || searched !== '') && <TypedLink onClick={clearAll}>Tout effacer</TypedLink>}
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
                label="Accélère en ligne de vue"
                value={filter.los === null ? 'any' : filter.los ? 'yes' : 'no'}
                onChange={(v) => setFilter({ ...filter, los: v === 'any' ? null : v === 'yes' })}
                options={[
                  { value: 'any', label: 'Peu importe' },
                  { value: 'yes', label: 'Oui' },
                  { value: 'no', label: 'Non' },
                ]}
              />
              <span className="pencil-note cx-field-hint">quand elle te voit pendant une chasse</span>
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

          {/* une recherche en cours se lit comme une recherche, pas comme une déduction du carnet */}
          {searched !== '' && (
            <p className="cx-searchline">
              <span className="typed-label">Recherche</span>
              <span className="cx-searchline-q">
                «{NNBSP}
                {searched}
                {NNBSP}»
              </span>
              <TypedLink onClick={() => setQuery('')}>Effacer la recherche</TypedLink>
            </p>
          )}

          <div className="cx-count" aria-live="polite">
            <span className="cx-count-n">
              {deduced ? (
                <RoughCircle seed="cx-count-one" padX={0.1} padY={0.1} delay={0.15}>
                  <b>1</b> possible
                </RoughCircle>
              ) : (
                <>
                  <b>{matching.length === 0 ? 'Aucune' : matching.length}</b> {!active && searched ? 'trouvée' : 'possible'}
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
              {/* la recherche reste : effacer le carnet fait réapparaître ce qu'elle a trouvé */}
              <p className="cx-empty-act">
                <TypedLink onClick={(e) => clearWithUndo(true, e.detail === 0)}>Effacer preuves et critères</TypedLink>
              </p>
            </Empty>
          ) : (
            matching.length === 0 &&
            (searched && out.length === 0 ? (
              <Empty title="Aucune entité ne correspond à ta recherche">
                <p>Essaie un autre mot{NNBSP}: un nom ou un comportement.</p>
              </Empty>
            ) : (
              <Empty title="Aucune entité ne correspond">
                <p>{fr(`${noneHint(ticked, moreCount).replace(/^./, (c) => c.toUpperCase())}.`)}</p>
                {active && (
                  <p className="cx-empty-act">
                    <TypedLink onClick={clearAll}>Tout effacer</TypedLink>
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
                {rows.map(({ g, n, snippet }) => (
                  <GhostRow
                    key={g.id}
                    ghost={g}
                    n={n}
                    mastery={mastery[g.id] ?? 0}
                    dimmed={!matching.includes(g)}
                    circled={deduced && only === g}
                    snippet={snippet}
                  />
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
