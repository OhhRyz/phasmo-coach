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
  /** auteur d'une note du carnet : celles du coach passent avant les siennes */
  author?: string
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
  /** jusqu'à 3 mauvaises réponses : avec une question et une réponse, la carte devient un QCM */
  wrong?: string[]
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

/** Le Mimic copie vitesses, seuils et comportements : il ne sert jamais de mauvaise réponse, ni d'autre entité possible. */
export const MIMIC = 'the-mimic'

/* ---- ce qui relève des preuves ---- */

/** Les preuves telles qu'on les écrit dans les fiches (« EMF 2 » n'est pas une preuve, « EMF 5 » si). */
const EVIDENCE_WORDS: Record<EvidenceId, RegExp> = {
  emf: /\bEMF(?:\s*(?:de\s+)?niveau)?\s*5\b/i,
  dots: /D\.O\.T\.S|\bDOTS\b/,
  uv: /\bUV\b|ultraviolet|empreinte/i,
  // « températures glaciales » seulement : « sous 0 °C » est une vitesse du Hantu, qui se mesure sans preuve
  freezing: /glacial/i,
  orbs: /\borbes?\b/i,
  writing: /écriture/i,
  spiritbox: /spirit\s*box/i,
}
/** Des comportements passent par la Spirit Box (Moroi) ou les orbes (Mimic en 0 preuve) : seules, elles ne suffisent pas. */
const EVIDENCE_ONLY: EvidenceId[] = ['emf', 'dots', 'uv', 'freezing', 'writing']
/** « sans preuve », « 0 preuve », « aucune preuve » : justement ce qu'on veut garder. */
const NO_EVIDENCE = /\b(?:sans|0|zéro|aucune)\s+preuves?\b/giu
/** Ce qu'on entend à la Spirit Box (une réponse, la respiration du Deogen) : c'est la preuve elle-même. */
const SPIRIT_BOX_ANSWER = /(?<!\p{L})(?:répon|réag|respir|question|entend)/iu

/** Preuves citées dans un texte. */
export function evidenceIn(text: string): EvidenceId[] {
  const t = text.replace(NO_EVIDENCE, '')
  return EVIDENCE_IDS.filter((e) => EVIDENCE_WORDS[e].test(t))
}

/**
 * Ce qui ne se voit qu'avec une preuve : EMF 5, D.O.T.S, empreintes UV, températures glaciales, écriture,
 * ou une réponse de la Spirit Box (voix, respiration). Les orbes seules restent permises : les faux orbes
 * du Mimic se cherchent justement en partie à 0 preuve.
 */
export function needsEvidence(text: string): boolean {
  const t = text.replace(NO_EVIDENCE, '')
  if (evidenceIn(t).some((e) => EVIDENCE_ONLY.includes(e))) return true
  return t.split(/[.;!?]+(?:\s|$)/u).some((c) => EVIDENCE_WORDS.spiritbox.test(c) && SPIRIT_BOX_ANSWER.test(c))
}

/**
 * Le texte parle de preuves (lesquelles, combien, où les relever) : bon à savoir, mais hors révision et hors quiz.
 * Sert aux textes libres (questions rédigées, confusions, capacités) ; les signes et tests « 0 preuve » des
 * fiches sont déjà triés par la source.
 */
export function mentionsEvidence(text: string): boolean {
  if (/\bpreuves?\b/iu.test(text.replace(NO_EVIDENCE, ''))) return true
  return evidenceIn(text).length >= 2 || needsEvidence(text)
}

/** Le texte sans ses apartés qui passent par une preuve (« La prendre en photo la fait disparaître (y compris en état D.O.T.S). »). */
export function withoutEvidenceAsides(text: string): string {
  return text.replace(/\s*\([^()]*\)/gu, (m) => (needsEvidence(m) ? '' : m))
}

/** Combinaison de preuves ou preuve forcée (« Seule entité avec EMF 5 + orbes… », « UV garanti en Cauchemar ») : rien à apprendre. */
export function isEvidenceList(text: string): boolean {
  return evidenceIn(text).length >= 2 || (/\bgaranti/iu.test(text) && /Cauchemar|Démence/u.test(text))
}

/**
 * Un test dont la condition même porte sur les preuves trouvées (« Si tu trouves plus de preuves que… »),
 * ou qui passe par une preuve (lampe UV, réponse à la Spirit Box, D.O.T.S…).
 */
function testNeedsEvidence(text: string): boolean {
  const first = text.split(/(?<=[.!?])\s+/u)[0] ?? text
  return /\bpreuves?\b/iu.test(first.replace(NO_EVIDENCE, '')) || needsEvidence(text)
}

const zeroTestCache = new WeakMap<Ghost, { text: string; k: number }[]>()

/** Tests définitifs utilisables sans preuve, avec leur rang parmi les tests définitifs (identifiant de carte stable). */
export function zeroTests(g: Ghost): { text: string; k: number }[] {
  let out = zeroTestCache.get(g)
  if (!out) {
    out = g.confirmationTests
      .filter((t) => t.definitive)
      .map((t, k) => ({ t, k }))
      // « requires » : le test n'existe qu'avec cette preuve (empreintes de l'Obake, respiration du Deogen)
      .filter(({ t }) => !t.requires && !testNeedsEvidence(t.text))
      .map(({ t, k }) => ({ text: t.text, k }))
    zeroTestCache.set(g, out)
  }
  return out
}

/* ---- une seule entité possible : ce qu'une phrase pourrait aussi décrire ---- */

/** Vitesse « standard » : 1,7 m/s et accélération normale en ligne de vue. */
export const standardSpeed = (g: Ghost) =>
  g.speed.min === 1.7 && g.speed.max == null && g.speed.alt == null && !g.speed.isRange && g.speed.los && !g.speed.losVaries
/** Seuil « standard » : 50 % dans tous les cas. */
export const standardSanity = (g: Ghost) => g.huntSanity.low === 50 && g.huntSanity.normal === 50 && g.huntSanity.high === 50
/** Les seuils possibles d'une entité (bas, normal, haut). */
export const thresholds = (g: Ghost) => new Set([g.huntSanity.low, g.huntSanity.normal, g.huntSanity.high].filter((v) => v >= 0))
/** Les vitesses d'une entité (de base, maximale, autre). */
export const speedValues = (g: Ghost) => new Set([g.speed.min, g.speed.max, g.speed.alt].filter((v): v is number => v != null && v >= 0))

const WORD = /\p{L}{5,}/gu
const wordsOf = (text: string) => new Set(text.toLowerCase().match(WORD) ?? [])
/** Un mot ramené à sa forme simple : « jamais » vaut « pas », « cette (entité) » vaut « l' », sans pluriel. */
const plainWord = (w: string) => (w === 'jamais' ? 'pas' : w === 'cette' ? 'l' : w.length > 3 ? w.replace(/[sx]$/u, '') : w)
/**
 * Les paires de mots qui se suivent (« plus visible », « visible pendant »…), pour reconnaître une même
 * phrase d'une fiche à l'autre (le nom de l'entité est caviardé de part et d'autre).
 */
const bigramsOf = (text: string) => {
  const w = (text.toLowerCase().match(/\p{L}+|\d+(?:,\d+)?/gu) ?? []).map(plainWord)
  return new Set(w.slice(1).map((x, i) => `${w[i]} ${x}`))
}

interface Lexicon {
  /** mots de la fiche de chaque entité (ses signes, capacités, comportements, tests, vitesses, seuils) */
  words: Map<string, Set<string>>
  /** nombre d'entités dont la fiche contient le mot */
  df: Map<string, number>
  /** chaque phrase de la fiche, en paires de mots */
  phrases: Map<string, Set<string>[]>
  /** toutes les paires de mots de la fiche (tri rapide avant de comparer phrase par phrase) */
  grams: Map<string, Set<string>>
}
const lexicons = new WeakMap<readonly Ghost[], Lexicon>()

function lexicon(all: readonly Ghost[]): Lexicon {
  const cached = lexicons.get(all)
  if (cached) return cached
  const nameWords = new Set(all.flatMap((g) => [...wordsOf(`${g.name} ${g.nameEn}`)]))
  const words = new Map<string, Set<string>>()
  const df = new Map<string, number>()
  const phrases = new Map<string, Set<string>[]>()
  const grams = new Map<string, Set<string>>()
  for (const g of all) {
    const texts = [
      ...g.keyTells,
      ...[...g.tells, ...g.abilities, ...g.behaviors, ...g.observations, ...g.confirmationTests].map((t) => t.text),
      g.speed.summary,
      ...g.speed.details,
      g.huntSanity.summary,
      ...g.huntSanity.details,
    ]
    const set = new Set([...wordsOf(texts.join(' '))].filter((w) => !nameWords.has(w)))
    words.set(g.id, set)
    const sentences = texts.map((t) => bigramsOf(redact(t, g)))
    phrases.set(g.id, sentences)
    grams.set(g.id, new Set(sentences.flatMap((p) => [...p])))
    for (const w of set) df.set(w, (df.get(w) ?? 0) + 1)
  }
  const lex = { words, df, phrases, grams }
  lexicons.set(all, lex)
  return lex
}

/** Une phrase de la fiche de o reprend au moins `ratio` des paires de mots de l'énoncé (3 paires au moins). */
function restated(grams: string[], o: Ghost, lex: Lexicon, ratio: number): boolean {
  const phrases = lex.phrases.get(o.id)
  const union = lex.grams.get(o.id)
  if (grams.length < 3 || !phrases || !union) return false
  const allowed = Math.floor((1 - ratio) * grams.length + 1e-9)
  const within = (p: Set<string>) => {
    let misses = 0
    for (const b of grams) if (!p.has(b) && ++misses > allowed) return false
    return true
  }
  // aucune phrase ne peut faire mieux que la fiche entière
  return within(union) && phrases.some(within)
}

/**
 * Une autre entité donne-t-elle (presque) le même signe ? « Plus visible pendant les chasses » est aussi
 * dans la fiche de l'Oni, « Ne fait pas l'événement brouillard fantomatique » dans celle du Kormos ; « Moins
 * visible pendant les chasses » (Fantôme) ne compte pas : « moins » n'est pas « plus ».
 */
export function restatedBy(statement: string, o: Ghost, all: readonly Ghost[]): boolean {
  let grams = statementGrams.get(statement)
  if (!grams) statementGrams.set(statement, (grams = [...bigramsOf(statement)]))
  return restated(grams, o, lexicon(all), 0.8)
}
/** Les paires de mots d'un énoncé, calculées une fois par énoncé (les fiches et leurs phrases ne changent pas). */
const statementGrams = new Map<string, string[]>()

/** Les nombres cités devant une unité (« 1,7 m/s », « 50 % »). */
const cited = (text: string, unit: RegExp) =>
  [...text.matchAll(new RegExp(`(\\d+(?:,\\d+)?)\\s*${unit.source}`, 'gu'))].map((m) => Number(m[1].replace(',', '.')))

/**
 * L'énoncé pourrait-il aussi décrire une autre entité ? On écarte les entités au seuil ou à la vitesse
 * particuliers quand l'énoncé en parle, celles dont la fiche partage les mots rares de l'énoncé, et celles
 * dont la fiche contient la même phrase (« Plus visible pendant les chasses »).
 *
 * `precise` : quand l'énoncé cite des vitesses ou des seuils, seules les entités qui ont toutes ces valeurs
 * conviennent, et il faut que tout ce que l'énoncé dit de la vitesse et du seuil leur convienne (utile quand
 * il n'y a pas de choix à proposer, comme sur une carte de révision, ou pour savoir si une phrase est aussi
 * vraie de la bonne réponse). Sinon, parler de vitesse ou de seuil suffit à écarter les entités particulières.
 */
export function fitsToo(statement: string, all: readonly Ghost[], precise = false): (o: Ghost) => boolean {
  // le même énoncé revient pour chaque entité, à chaque question : son examen se fait une fois par liste
  let byText = fitsCache.get(all)
  if (!byText) fitsCache.set(all, (byText = new Map()))
  const key = `${precise ? 1 : 0}|${statement}`
  let fits = byText.get(key)
  if (!fits) byText.set(key, (fits = fitsTooNow(statement, all, precise)))
  return fits
}
const fitsCache = new WeakMap<readonly Ghost[], Map<string, (o: Ghost) => boolean>>()

function fitsTooNow(statement: string, all: readonly Ghost[], precise: boolean): (o: Ghost) => boolean {
  const sanityTalk = /chass/iu.test(statement) && /%|santé mentale|seuil/iu.test(statement)
  const speedTalk = /m\/s|vitesse|rapide|ralenti|accél|\blente?\b/iu.test(statement)
  const pct = precise && sanityTalk ? cited(statement, /%/u) : []
  const mps = precise && speedTalk ? cited(statement, /m\/s/u) : []
  const lex = lexicon(all)
  const { words, df } = lex
  const rare = [...wordsOf(statement)].filter((w) => (df.get(w) ?? 0) <= 3)
  const grams = [...bigramsOf(statement)]
  // « garde une vitesse standard » : seules les entités qui ont 1,7 m/s conviennent (et non les particulières)
  const standardTalk = /vitesse\s+(?:standard|normale)/iu.test(statement)
  return (o) => {
    const sanity = !sanityTalk ? null : pct.length ? pct.every((v) => thresholds(o).has(v)) : !standardSanity(o)
    const speed = !speedTalk
      ? null
      : mps.length
        ? mps.every((v) => speedValues(o).has(v))
        : standardTalk
          ? speedValues(o).has(1.7)
          : !standardSpeed(o)
    if (precise ? (sanity ?? speed) != null && sanity !== false && speed !== false : sanity || speed) return true
    if (restated(grams, o, lex, 1)) return true
    const theirs = words.get(o.id)
    const shared = theirs ? rare.filter((w) => theirs.has(w)).length : 0
    return shared >= 2 || (rare.length <= 2 && shared >= 1)
  }
}

/**
 * Les vitesses et seuils cités sont tous ceux de g : « Il chasse à 1,7 m/s et à 50 % » décrit aussi
 * n'importe quelle entité standard.
 */
export function numbersFit(text: string, g: Ghost): boolean {
  const mps = cited(text, /m\/s/u)
  const pct = /chass|seuil/iu.test(text) ? cited(text, /%/u) : []
  if (!mps.length && !pct.length) return false
  return mps.every((v) => speedValues(g).has(v)) && pct.every((v) => thresholds(g).has(v))
}

/** Le texte nomme-t-il l'entité, y compris entre « » (où le caviardage ne touche à rien) ? */
export function namesGhost(text: string, g: Ghost): boolean {
  const open = text.replace(/[«»]/gu, ' ')
  return redact(open, g) !== open
}

/* ---- les cartes ---- */

/** Cartes de test par entité (les suivants ne sortent qu'en quiz). */
export const TESTS_PER_GHOST = 2
/** Cartes « signe à reconnaître » par entité. */
export const REVERSE_PER_GHOST = 2

const reverseCache = new WeakMap<readonly Ghost[], Map<string, { text: string; k: number }[]>>()

/**
 * Les signes « 0 preuve » qui deviennent des cartes « Quelle entité correspond à ce signe ? », déjà caviardés
 * (k : rang parmi les signes 0 preuve, identifiant de carte stable). Une carte ne propose aucun choix : le
 * signe doit être propre à l'entité. On écarte donc ceux qui passent par une preuve, qui gardent le nom
 * (entre « ») et ceux qu'une autre entité donne aussi (sa fiche dit presque la même chose).
 */
export function reverseTells(g: Ghost, all: readonly Ghost[]): { text: string; k: number }[] {
  let byGhost = reverseCache.get(all)
  if (!byGhost) reverseCache.set(all, (byGhost = new Map()))
  const cached = byGhost.get(g.id)
  if (cached) return cached
  const others = all.filter((o) => o.id !== g.id && o.id !== MIMIC)
  const out = g.tells
    .filter((t) => t.zeroEvidence)
    .map((t, k) => ({ text: redact(withoutEvidenceAsides(t.text), g), k }))
    .filter(
      ({ text }) =>
        !needsEvidence(text) &&
        !namesGhost(text, g) &&
        // « Attention, la Banshee est elle aussi exclusivement féminine » : le signe vaut pour deux entités
        !others.some((o) => namesGhost(text, o) || restatedBy(text, o, all)),
    )
    .slice(0, REVERSE_PER_GHOST)
  byGhost.set(g.id, out)
  return out
}

/** Les faits de mécaniques à retenir (les autres, utiles pour relever les preuves, restent « bon à savoir »). */
export const isRetained = (f: Pick<MechanicsFact, 'evidence'>) => !f.evidence

export function ghostCards(g: Ghost, ghostIndex: number, all: readonly Ghost[] = [g]): Card[] {
  const base = 1000 + ghostIndex * 20
  const cards: Card[] = []
  // « Silhouette D.O.T.S visible seulement à la caméra », « Respiration à la Spirit Box » : rien à apprendre sans preuve
  const keyTells = g.keyTells.filter((t) => !isEvidenceList(t) && !needsEvidence(t))

  if (keyTells.length) {
    cards.push({
      id: `g:${g.id}:tells`,
      deck: 'ghost',
      kind: 'tells',
      ghostId: g.id,
      front: `Comment reconnaître ${le(g.name)} ? Cite ${/^Les\s/u.test(g.name) ? 'leurs' : 'ses'} signes clés.`,
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

  // cartes inversées : à partir des signes « 0 preuve » propres à l'entité
  reverseTells(g, all).forEach(({ text, k }) => {
    cards.push({
      id: `g:${g.id}:rev:${k}`,
      deck: 'ghost',
      kind: 'reverse',
      ghostId: g.id,
      front: 'Quelle entité correspond à ce signe ?',
      quote: text,
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

/** Le titre d'une note enregistrée sans titre : sa première ligne, coupée proprement (60 caractères au plus). */
export function firstLineTitle(body: string): string {
  const line = body.trim().split('\n')[0].trim()
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line
}

/** Le titre écrit d'une note, ou '' quand ce n'est que sa première ligne (note enregistrée sans titre). */
export function writtenTitle(n: Pick<CoachNote, 'title' | 'body'>): string {
  const t = n.title.trim()
  return t && t !== firstLineTitle(n.body) ? t : ''
}

const NOTE_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

/** « 1er novembre », « 12 mars » */
function noteDay(t: number): string {
  const d = new Date(t)
  if (!Number.isFinite(t) || Number.isNaN(d.getTime())) return ''
  return d.getDate() === 1 ? `1er ${NOTE_DAY.format(d).replace(/^1\s+/u, '')}` : NOTE_DAY.format(d)
}

/** « Que retenir de « Encens » ? » (avec les espaces fines de la typographie française) */
const recall = (what: string) => (/[?!…]$/.test(what) ? `Que retenir de «\u202f${what}\u202f»` : `Que retenir de «\u202f${what}\u202f»\u202f?`)

/**
 * Une première ligne qui se lit comme un titre (« Encens et Démon. ») : courte, sans chiffre, sans tiret ni
 * numéro de liste, sans ponctuation au milieu. « Plus rapide dans le froid, jusqu'à 2,7 m/s. » ou « - souffle
 * froid visible » sont déjà le contenu de la note : posés en question, ils en souffleraient la moitié.
 */
const NOTE_TITLE_MAX = 40
function titleLike(line: string): boolean {
  const t = line.replace(/[\s.:;,]+$/u, '')
  return t.length > 0 && t.length <= NOTE_TITLE_MAX && !/\d/u.test(t) && !/^\s*(?:[-*•–—]|\d+[.)])/u.test(line) && !/[.,;:!?…()]/u.test(t)
}

/**
 * Ce que demande la carte d'une note, et ce qu'elle montre au dos. La question écrite d'abord ; sinon le titre
 * écrit (« Que retenir de « Encens » ? »). Une note enregistrée sans titre n'est jamais demandée par sa
 * première ligne coupée (qui soufflerait la réponse, à moitié) : sa première ligne quand c'est une question,
 * ou quand elle se lit comme un titre (voir titleLike), suivie du reste ; sinon l'entité de la note (« Que
 * retenir de la note sur le Hantu ? »), ou son jour pour une note générale. Ces deux dernières ne disent pas
 * ce qu'on demande (`vague`) : l'éditeur demande alors un titre. Au dos, toute la note (sauf sous une question).
 */
export function noteQuestion(
  n: Pick<CoachNote, 'title' | 'body' | 'question' | 'answer' | 'ghostId' | 'createdAt'>,
  ghosts: readonly Pick<Ghost, 'id' | 'name'>[] = [],
): { front: string; back: string; vague?: true } {
  const question = n.question?.trim()
  const answer = n.answer?.trim() ?? ''
  const body = n.body?.trim() ?? ''
  if (question) return { front: question, back: answer || body }
  const title = writtenTitle(n)
  if (title) return { front: recall(title), back: answer || body }
  const [first, ...more] = body.split('\n')
  const lead = first.trim()
  const rest = more.join('\n').trim()
  // « Combien de temps l'encens bloque-t-il un Démon ? » puis la réponse dessous
  // (tel qu'il a été écrit : le texte d'une note ne se retouche pas)
  if (rest && /\?$/.test(lead)) return { front: lead, back: answer || rest }
  // une première ligne qui se lit comme un titre, suivie du reste : elle sert de titre ; au dos, la note entière
  if (rest && titleLike(lead)) return { front: recall(lead.replace(/[\s.:;,]+$/u, '')), back: answer || body }
  const ghost = n.ghostId ? ghosts.find((g) => g.id === n.ghostId) : undefined
  if (ghost) return { front: `Que retenir de la note sur ${le(ghost.name)}\u202f?`, back: answer || body, vague: true }
  const day = noteDay(n.createdAt)
  return { front: day ? `Que retenir de la note du ${day}\u202f?` : 'Que retenir de cette note\u202f?', back: answer || body, vague: true }
}

export function noteCards(notes: CoachNote[], ghosts: readonly Pick<Ghost, 'id' | 'name'>[] = []): Card[] {
  const out: Card[] = []
  notes.forEach((n, i) => {
    if (!n.asCard) return
    const answer = n.answer?.trim()
    const body = n.body?.trim() ?? ''
    // sans question explicite, on demande de se souvenir du contenu de la note
    const { front, back } = noteQuestion(n, ghosts)
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
      author: n.author,
    })
  })
  return out
}

export function buildDeck(ghosts: Ghost[], mechanics: Mechanics, notes: CoachNote[]): Card[] {
  return [...noteCards(notes, ghosts), ...ghosts.flatMap((g, i) => ghostCards(g, i, ghosts)), ...mechanicsCards(mechanics)]
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
