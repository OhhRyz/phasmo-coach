import { EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId, Ghost, Mechanics, MechanicsFact } from '../data/types'
import { redactGhostName as redact } from './format'

export type Deck = 'ghost' | 'mechanics' | 'coach'

/**
 * Ce qui s'apprend par cœur : ce qui sert sans preuve (signes, seuils, vitesses, tests, mécaniques).
 * Les preuves restent sur les fiches et dans le carnet de preuves (le journal du jeu les donne) : pas de carte.
 * D'anciennes cartes « preuves » peuvent rester dans la sauvegarde : tout ce qui compte passe par le paquet.
 */
export type CardKind =
  | 'sanity'
  | 'speed'
  | 'tells'
  | 'reverse'
  | 'test'
  | 'fact'
  | 'note'

export interface Card {
  id: string
  deck: Deck
  kind: CardKind
  ghostId?: string
  topicId?: string
  front: string
  /** Citation affichée sous la question (ex. comportement à reconnaître) */
  quote?: string
  back: string
  backList?: string[]
  /** ordre d'introduction des nouvelles cartes */
  order: number
}

export interface CoachNote {
  id: string
  createdAt: number
  updatedAt: number
  ghostId: string | null
  title: string
  body: string
  /** transforme la note en carte de révision */
  asCard: boolean
  question?: string
  answer?: string
  author: string
  pinned?: boolean
}

const KIND_ORDER: Record<CardKind, number> = {
  note: 0,
  tells: 1,
  sanity: 2,
  speed: 3,
  test: 4,
  reverse: 5,
  fact: 6,
}

/* ---- ce qui relève des preuves ---- */

/** Les preuves telles qu'on les écrit dans les fiches (« EMF 2 » n'est pas une preuve, « EMF 5 » si). */
const EVIDENCE_WORDS: Record<EvidenceId, RegExp> = {
  emf: /\bEMF(?:\s*(?:de\s+)?niveau)?\s*5\b/i,
  dots: /D\.O\.T\.S|\bDOTS\b/,
  uv: /\bUV\b|ultraviolet|empreinte/i,
  freezing: /glaciale|sous\s*0\s*°/i,
  orbs: /\borbes?\b/i,
  writing: /écriture/i,
  spiritbox: /spirit\s*box/i,
}
/** Des comportements passent par la Spirit Box (Deogen, Moroi) ou les orbes (Mimic en 0 preuve) : seules, elles ne suffisent pas. */
const EVIDENCE_ONLY: EvidenceId[] = ['emf', 'dots', 'uv', 'freezing', 'writing']
/** « sans preuve », « 0 preuve », « aucune preuve » : justement ce qu'on veut garder. */
const NO_EVIDENCE = /\b(?:sans|0|zéro|aucune)\s+preuves?\b/giu

/** Preuves citées dans un texte. */
export function evidenceIn(text: string): EvidenceId[] {
  const t = text.replace(NO_EVIDENCE, '')
  return EVIDENCE_IDS.filter((e) => EVIDENCE_WORDS[e].test(t))
}

/**
 * Le texte parle de preuves (lesquelles, combien, où les relever) : bon à savoir, mais hors révision et hors quiz.
 * Sert aux textes libres (questions rédigées, confusions, capacités) ; les signes et tests « 0 preuve » des
 * fiches sont déjà triés par la source.
 */
export function mentionsEvidence(text: string): boolean {
  if (/\bpreuves?\b/iu.test(text.replace(NO_EVIDENCE, ''))) return true
  const found = evidenceIn(text)
  return found.length >= 2 || found.some((e) => EVIDENCE_ONLY.includes(e))
}

/** Combinaison de preuves ou preuve forcée (« Seule entité avec EMF 5 + orbes… », « UV garanti en Cauchemar ») : rien à apprendre. */
function isEvidenceList(text: string): boolean {
  return evidenceIn(text).length >= 2 || (/\bgaranti/iu.test(text) && /Cauchemar|Démence/u.test(text))
}

/** Un test dont la condition même porte sur les preuves trouvées (« Si tu trouves plus de preuves que… »). */
function testNeedsEvidence(text: string): boolean {
  const first = text.split(/(?<=[.!?])\s+/u)[0] ?? text
  return /\bpreuves?\b/iu.test(first.replace(NO_EVIDENCE, ''))
}

const zeroTestCache = new WeakMap<Ghost, { text: string; k: number }[]>()

/** Tests définitifs utilisables sans preuve, avec leur rang parmi les tests définitifs (identifiant de carte stable). */
export function zeroTests(g: Ghost): { text: string; k: number }[] {
  let out = zeroTestCache.get(g)
  if (!out) {
    out = g.confirmationTests
      .filter((t) => t.definitive)
      .map((t, k) => ({ text: t.text, k }))
      .filter((t) => !testNeedsEvidence(t.text))
    zeroTestCache.set(g, out)
  }
  return out
}

/** Cartes de test par entité (les suivants ne sortent qu'en quiz). */
export const TESTS_PER_GHOST = 2
/** Cartes « signe à reconnaître » par entité. */
export const REVERSE_PER_GHOST = 2

/** Les faits de mécaniques à retenir (les autres, utiles pour relever les preuves, restent « bon à savoir »). */
export const isRetained = (f: Pick<MechanicsFact, 'evidence'>) => !f.evidence

export function ghostCards(g: Ghost, ghostIndex: number): Card[] {
  const base = 1000 + ghostIndex * 20
  const cards: Card[] = []
  const keyTells = g.keyTells.filter((t) => !isEvidenceList(t))

  if (keyTells.length) {
    cards.push({
      id: `g:${g.id}:tells`,
      deck: 'ghost',
      kind: 'tells',
      ghostId: g.id,
      front: `Comment reconnaître ${le(g.name)} ? Cite ses signes clés.`,
      back: g.summary,
      backList: keyTells,
      order: base + KIND_ORDER.tells,
    })
  }

  if ([g.huntSanity.low, g.huntSanity.normal, g.huntSanity.high].some((v) => v >= 0)) {
    cards.push({
      id: `g:${g.id}:san`,
      deck: 'ghost',
      kind: 'sanity',
      ghostId: g.id,
      front: `Quel est le seuil de chasse ${de(g.name)} ?`,
      back: g.huntSanity.summary,
      backList: g.huntSanity.details.slice(0, 3),
      order: base + KIND_ORDER.sanity,
    })
  }

  if (g.speed.min >= 0) {
    cards.push({
      id: `g:${g.id}:spd`,
      deck: 'ghost',
      kind: 'speed',
      ghostId: g.id,
      front: `Quelle est la vitesse de chasse ${de(g.name)}, et que se passe-t-il en ligne de vue ?`,
      back: g.speed.summary,
      backList: g.speed.details.slice(0, 3),
      order: base + KIND_ORDER.speed,
    })
  }

  zeroTests(g)
    .slice(0, TESTS_PER_GHOST)
    .forEach((t) => {
      cards.push({
        id: `g:${g.id}:test:${t.k}`,
        deck: 'ghost',
        kind: 'test',
        ghostId: g.id,
        front: `Sans preuve : quel test confirme ${le(g.name)} ?`,
        back: t.text,
        order: base + KIND_ORDER.test,
      })
    })

  // cartes inversées : à partir des signes « 0 preuve », propres à l'entité
  g.tells
    .filter((t) => t.zeroEvidence)
    .slice(0, REVERSE_PER_GHOST)
    .forEach((t, k) => {
      cards.push({
        id: `g:${g.id}:rev:${k}`,
        deck: 'ghost',
        kind: 'reverse',
        ghostId: g.id,
        front: 'Quelle entité correspond à ce signe ?',
        quote: redact(t.text, g),
        back: `${g.name}${g.nameEn !== g.name ? ` (${g.nameEn})` : ''}`,
        backList: [g.summary],
        order: base + KIND_ORDER.reverse,
      })
    })

  return cards
}

export function mechanicsCards(m: Mechanics): Card[] {
  const out: Card[] = []
  m.topics.forEach((topic, ti) => {
    topic.facts.forEach((f, fi) => {
      // utile seulement pour relever les preuves : on le lit sur la page Mécaniques, sans l'apprendre
      if (!isRetained(f)) return
      out.push({
        id: `m:${f.id}`,
        deck: 'mechanics',
        kind: 'fact',
        topicId: topic.id,
        front: f.q,
        back: f.a,
        backList: f.text && f.text !== f.a ? [f.text] : [],
        order: 5000 + ti * 100 + fi,
      })
    })
  })
  return out
}

export function noteCards(notes: CoachNote[]): Card[] {
  const out: Card[] = []
  notes.forEach((n, i) => {
    if (!n.asCard) return
    const question = n.question?.trim()
    const answer = n.answer?.trim()
    const body = n.body?.trim() ?? ''
    // sans question explicite, on demande de se souvenir du contenu de la note
    const title = n.title.trim()
    const front = question || (/[?!…]$/.test(title) ? `Que retenir de «\u202f${title}\u202f»` : `Que retenir de «\u202f${title}\u202f»\u202f?`)
    const back = answer || body
    if (!back) return
    out.push({
      id: `n:${n.id}`,
      deck: 'coach',
      kind: 'note',
      ghostId: n.ghostId ?? undefined,
      front,
      back,
      backList: answer && body && body !== answer ? [body] : [],
      order: i,
    })
  })
  return out
}

export function buildDeck(ghosts: Ghost[], mechanics: Mechanics, notes: CoachNote[]): Card[] {
  return [...noteCards(notes), ...ghosts.flatMap((g, i) => ghostCards(g, i)), ...mechanicsCards(mechanics)]
}

/* ---- petites aides de français ---- */

// Pas de y ni de h : « du Yokai », « du Yurei », « du Hantu » (h aspiré).
const VOWEL = /^[aeiouâàéèêîïôûAEIOUÂÀÉÈÊÎÏÔÛ]/
/** Entités dites au féminin par les joueurs francophones (« la Banshee », « la Dayan », comme dans les fiches). */
const FEMININE = new Set(['Banshee', 'Dayan'])

/** Genre grammatical d'une entité (« elle » pour l'Ombre, la Banshee, la Dayan). */
export function isFeminine(name: string): boolean {
  return /^La /.test(name) || FEMININE.has(name) || name === 'Ombre'
}

/** « du Démon », « de l’Onryo », « des Jumeaux », « du Mimic », « de la Banshee » */
export function de(name: string): string {
  if (name.startsWith('Les ')) return `des ${name.slice(4)}`
  if (name.startsWith('Le ')) return `du ${name.slice(3)}`
  if (name.startsWith('La ')) return `de la ${name.slice(3)}`
  if (VOWEL.test(name)) return `de l’${name}`
  if (FEMININE.has(name)) return `de la ${name}`
  return `du ${name}`
}

/** « le Démon », « l’Onryo », « les Jumeaux », « la Banshee » */
export function le(name: string): string {
  if (/^(Le|La|Les) /.test(name)) return name.charAt(0).toLowerCase() + name.slice(1)
  if (VOWEL.test(name)) return `l’${name}`
  if (FEMININE.has(name)) return `la ${name}`
  return `le ${name}`
}
