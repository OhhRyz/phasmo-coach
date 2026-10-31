import { EVIDENCE } from '../data/evidence'
import type { EvidenceId, Ghost, Mechanics } from '../data/types'
import { hashString } from './random'
import { redactGhostName as redact } from './format'

export type Deck = 'ghost' | 'mechanics' | 'coach'

export type CardKind =
  | 'evidence'
  | 'forced'
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
  evidence?: EvidenceId[]
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
  evidence: 1,
  tells: 2,
  sanity: 3,
  speed: 4,
  forced: 5,
  test: 6,
  reverse: 7,
  fact: 8,
}

export function ghostCards(g: Ghost, ghostIndex: number): Card[] {
  const base = 1000 + ghostIndex * 20
  const cards: Card[] = []
  const evNames = g.evidence.map((e) => EVIDENCE[e].label)
  const evExtra: string[] = []
  if (g.forcedEvidence) evExtra.push(`Preuve forcée (toujours présente avec moins de preuves) : ${EVIDENCE[g.forcedEvidence].label}.`)
  if (g.fakeEvidence) evExtra.push(`Fausse preuve en plus : ${EVIDENCE[g.fakeEvidence].label} (ne compte pas dans les 3).`)

  cards.push({
    id: `g:${g.id}:ev`,
    deck: 'ghost',
    kind: 'evidence',
    ghostId: g.id,
    front: `Quelles sont les 3 preuves ${de(g.name)} ?`,
    back: evNames.join(' · '),
    backList: evExtra,
    evidence: g.evidence,
    order: base + KIND_ORDER.evidence,
  })

  if (g.keyTells.length) {
    cards.push({
      id: `g:${g.id}:tells`,
      deck: 'ghost',
      kind: 'tells',
      ghostId: g.id,
      front: `Comment reconnaître ${le(g.name)} ? Cite ses signes clés.`,
      back: g.summary,
      backList: g.keyTells,
      order: base + KIND_ORDER.tells,
    })
  }

  if (g.huntSanity.normal >= 0) {
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

  if (g.forcedEvidence) {
    cards.push({
      id: `g:${g.id}:forced`,
      deck: 'ghost',
      kind: 'forced',
      ghostId: g.id,
      front: `En Cauchemar ou en Démence, quelle preuve est toujours présente avec ${le(g.name)} ?`,
      back: EVIDENCE[g.forcedEvidence].label,
      evidence: [g.forcedEvidence],
      order: base + KIND_ORDER.forced,
    })
  }

  g.confirmationTests
    .filter((t) => t.definitive)
    .slice(0, 2)
    .forEach((t) => {
      cards.push({
        id: `g:${g.id}:test:${hashString(t.text)}`,
        deck: 'ghost',
        kind: 'test',
        ghostId: g.id,
        front: `Sans preuve : quel test confirme ${le(g.name)} ?`,
        back: t.text,
        order: base + KIND_ORDER.test,
      })
    })

  g.keyTells.slice(0, 2).forEach((tell) => {
    const quote = redact(tell, g)
    cards.push({
      id: `g:${g.id}:rev:${hashString(tell)}`,
      deck: 'ghost',
      kind: 'reverse',
      ghostId: g.id,
      front: 'Quelle entité correspond à ce signe ?',
      quote,
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
  return notes
    .filter((n) => n.asCard)
    .map((n, i) => ({
      id: `n:${n.id}`,
      deck: 'coach' as const,
      kind: 'note' as const,
      ghostId: n.ghostId ?? undefined,
      front: n.question?.trim() || n.title,
      back: n.answer?.trim() || n.body,
      backList: n.question?.trim() && n.body && n.body !== n.answer ? [n.body] : [],
      order: i,
    }))
}

export function buildDeck(ghosts: Ghost[], mechanics: Mechanics, notes: CoachNote[]): Card[] {
  return [...noteCards(notes), ...ghosts.flatMap((g, i) => ghostCards(g, i)), ...mechanicsCards(mechanics)]
}

/* ---- petites aides de français ---- */

const VOWEL = /^[aeiouyhâàéèêîïôûAEIOUYHÂÀÉÈÊÎÏÔÛ]/

/** « du Démon », « de l'Onryo », « des Jumeaux », « du Mimic » */
export function de(name: string): string {
  if (name.startsWith('Les ')) return `des ${name.slice(4)}`
  if (name.startsWith('Le ')) return `du ${name.slice(3)}`
  if (name.startsWith('La ')) return `de la ${name.slice(3)}`
  if (VOWEL.test(name)) return `de l’${name}`
  return `du ${name}`
}

/** « le Démon », « l'Onryo », « les Jumeaux » */
export function le(name: string): string {
  if (/^(Le|La|Les) /.test(name)) return name.charAt(0).toLowerCase() + name.slice(1)
  if (VOWEL.test(name)) return `l’${name}`
  return `le ${name}`
}
