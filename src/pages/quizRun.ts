import { fr, NBSP, plural } from '../engine/format'
import type { Question } from '../engine/quiz'
import { readRun } from './savedRun'

/**
 * La copie du quiz en cours (voir savedRun) : un détour par une fiche, un autre onglet, le bouton retour ou un
 * rechargement ne la perd plus ; la page du quiz propose « Reprendre la copie » (même onglet, même journée).
 */
export const COPY_KEY = 'phasmo-coach/copie-quiz'

/** « Reprendre la copie » depuis une autre page (enveloppe du quiz, accueil) : elle reprend aussitôt. */
export const RESUME_QUIZ = '/quiz?copie=reprendre'
/** Le paramètre de RESUME_QUIZ, effacé une fois servi (il ne distribue pas de copie neuve, voir QuizRoute). */
export const RESUME_PARAM = 'copie'

/** Les longueurs de copie proposées sur la page du quiz. */
export const QUIZ_COUNTS = [5, 10, 20, 30]
/** La longueur d'une copie tant qu'on n'en a pas choisi une autre. */
export const DEFAULT_COUNT = 10
/** Le nombre de questions choisi la dernière fois sur la page du quiz, gardé sur l'appareil. */
export const COUNT_KEY = 'phasmo-coach/quiz-questions'

/**
 * Le nombre de questions choisi la dernière fois (« 5 questions » le reste après un rechargement ou le
 * lendemain) ; 10 tant qu'on n'en a pas choisi d'autre, ou si le stockage est bloqué.
 */
export function readQuizCount(): number {
  try {
    const n = Number(localStorage.getItem(COUNT_KEY))
    return QUIZ_COUNTS.includes(n) ? n : DEFAULT_COUNT
  } catch {
    return DEFAULT_COUNT
  }
}

export function rememberQuizCount(n: number): void {
  if (!QUIZ_COUNTS.includes(n)) return
  try {
    localStorage.setItem(COUNT_KEY, String(n))
  } catch {
    /* navigation privée : on reproposera 10 questions */
  }
}

/** Une réponse de la copie. */
export interface Answer {
  q: Question
  selected: string[]
  correct: boolean
  /** la carte liée, déjà apprise, revient dans la révision du jour */
  requeued: boolean
}

export interface SavedCopy {
  questions: Question[]
  index: number
  answers: Answer[]
  selected: string[]
  checked: boolean
  /**
   * L'entrée de l'historique où la copie s'affiche (distribuée ou reprise). Un rechargement (F5) sur cette entrée
   * la reprend d'elle-même (voir reloadedOn) ; ailleurs, la page propose de la reprendre. Venue d'un raccourci
   * (« quiz rapide », « Me tester sur… »), son adresse redemande une copie à chaque retour : la copie en cours
   * n'est jamais remplacée sans le demander.
   */
  entry?: string
}

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

const validQuestion = (q: Question) =>
  !!q &&
  typeof q === 'object' &&
  typeof q.id === 'string' &&
  typeof q.prompt === 'string' &&
  typeof q.explain === 'string' &&
  Array.isArray(q.choices) &&
  q.choices.length >= 2 &&
  q.choices.every((c) => c && typeof c.id === 'string' && typeof c.label === 'string') &&
  strings(q.correct) &&
  q.correct.length > 0

/**
 * Une copie affichée relue telle quelle : des questions lisibles, la question en cours dans la copie, ses réponses
 * (aucune encore tant qu'on est sur la première question). La copie se garde dès qu'elle est distribuée : un
 * rechargement sur sa page (F5, nouvelle version de l'app) la rend même avant la première réponse.
 */
export function shownCopy(c: SavedCopy): boolean {
  if (!c || !Array.isArray(c.questions) || !c.questions.every(validQuestion)) return false
  if (!Number.isInteger(c.index) || c.index < 0 || c.index >= c.questions.length) return false
  if (!Array.isArray(c.answers) || c.answers.length > c.index + 1 || (c.answers.length === 0 && c.index > 0)) return false
  if (!c.answers.every((a) => a && validQuestion(a.q) && strings(a.selected) && typeof a.correct === 'boolean')) return false
  return strings(c.selected) && typeof c.checked === 'boolean' && (c.entry === undefined || typeof c.entry === 'string')
}

/** Une copie à proposer à la reprise (« Reprendre la copie ») : lisible, et commencée (au moins une réponse). */
export function validCopy(c: SavedCopy): boolean {
  return shownCopy(c) && c.answers.length > 0
}

/** La copie laissée en route, à proposer à la reprise (accueil, exercices, page du quiz) ; null sans réponse encore. */
export function readCopy(now = Date.now()): SavedCopy | null {
  return readRun<SavedCopy>(COPY_KEY, validCopy, now)
}

/** La copie affichée en dernier, même sans réponse : celle que reprend la page du quiz rechargée (voir shownCopy). */
export function readShownCopy(now = Date.now()): SavedCopy | null {
  return readRun<SavedCopy>(COPY_KEY, shownCopy, now)
}

/**
 * La copie rendue (note et corrigé), gardée pour l'entrée de l'historique où elle s'affiche : revenir sur cette
 * entrée (« Précédent » depuis « Relire la fiche », rechargement) rouvre le corrigé, à l'endroit qu'on avait
 * quitté, au lieu de la page de réglages. Arriver sur la page par un autre chemin (onglet, lien) repart des réglages.
 */
export const GRADED_KEY = 'phasmo-coach/copie-rendue'

export interface GradedCopy {
  questions: Question[]
  answers: Answer[]
  entry: string
}

/** Une copie rendue relue telle quelle : des questions lisibles, une réponse à chacune, son entrée. */
export function validGraded(c: GradedCopy): boolean {
  if (!c || typeof c.entry !== 'string' || !Array.isArray(c.questions) || !c.questions.length || !c.questions.every(validQuestion)) return false
  return Array.isArray(c.answers) && c.answers.length === c.questions.length && c.answers.every((a) => a && validQuestion(a.q) && strings(a.selected) && typeof a.correct === 'boolean')
}

/** La copie rendue sur cette entrée de l'historique, ou null (autre entrée, autre jour, copie abîmée). */
export function readGraded(entry: string, now = Date.now()): GradedCopy | null {
  const c = readRun<GradedCopy>(GRADED_KEY, validGraded, now)
  return c && c.entry === entry ? c : null
}

/** « une », « 2 », « 3 » : un compte qui ouvre une phrase (« une porte sur… », « 2 portent sur… »). */
const some = (n: number) => (n === 1 ? 'une' : String(n))

/**
 * Le lien de fin de copie vers la révision, et pourquoi il ne compte pas toutes les erreurs. Seule une carte
 * déjà apprise revient dans la révision du jour (Answer.requeued) ; une erreur peut aussi porter sur une carte
 * pas encore apprise, sur une question sans carte (question rédigée, vrai ou faux), ou sur la même carte
 * qu'une autre. `cards` : les cartes remises en révision ; `link` : le libellé du lien (null sans carte
 * remise) ; `note` : la phrase qui explique l'écart avec le nombre d'erreurs (null s'il n'y en a pas).
 */
export function requeueSummary(mistakes: readonly { q: { cardId?: string }; requeued: boolean }[]): {
  cards: number
  link: string | null
  note: string | null
} {
  const back = mistakes.filter((a) => a.requeued)
  const cards = new Set(back.map((a) => a.q.cardId)).size
  if (!cards) return { cards, link: null, note: null }
  const total = mistakes.length
  if (back.length === total && cards === total)
    return { cards, link: `Revoir ${cards > 1 ? `mes ${cards} erreurs` : 'mon erreur'} dans la révision`, note: null }
  const link = `Revoir ${cards > 1 ? `ces ${cards} cartes` : 'cette carte'} dans la révision`
  const onCards = cards === 1 ? (back.length > 1 ? 'la même carte déjà apprise, remise' : 'une carte déjà apprise, remise') : `${cards} cartes déjà apprises, remises`
  const head =
    back.length === total
      ? `Tes ${total} erreurs portent sur ${onCards} dans ta révision du jour`
      : `${back.length === 1 ? 'Une' : back.length} de tes ${total} erreurs ${back.length > 1 ? 'portent' : 'porte'} sur ${onCards} dans ta révision du jour`
  const unlearned = mistakes.filter((a) => !a.requeued && a.q.cardId).length
  const loose = mistakes.filter((a) => !a.q.cardId).length
  const others = unlearned + loose
  const toLearn = (n: number) => (n > 1 ? 'portent sur des cartes que tu n’as pas encore apprises' : 'porte sur une carte que tu n’as pas encore apprise')
  const noCard = (n: number) => (n > 1 ? 'n’ont pas de carte de révision' : 'n’a pas de carte de révision')
  let tail = ''
  if (others === 1) tail = `l’autre ${unlearned ? toLearn(1) : noCard(1)}`
  else if (others > 1 && (!unlearned || !loose)) tail = `les ${others} autres ${unlearned ? toLearn(others) : noCard(others)}`
  else if (others > 1) tail = `parmi les ${others} autres, ${some(unlearned)} ${toLearn(unlearned)} et ${some(loose)} ${noCard(loose)}`
  return { cards, link, note: fr(tail ? `${head} ; ${tail}.` : `${head}.`) }
}

/** Ce que dit l'enveloppe du quiz d'une copie en cours (« 3 réponses sur 5 »), à la place de « 10 questions · ≈ 3 min ». */
export function copyMeta(copy: Pick<SavedCopy, 'answers' | 'questions'>): string {
  return `${plural(copy.answers.length, 'réponse', 'réponses')} sur ${copy.questions.length}`
}

/* ---------- sur quelles entités porte la copie ---------- */

/**
 * Il faut au moins autant d'entités déjà étudiées en révision pour que le quiz porte sur elles seules (par
 * défaut) : en dessous, la copie tournerait sur deux ou trois noms. Il porte alors sur toutes, et le dit.
 */
export const STUDIED_MIN = 4

/** Les entités de la copie : déjà étudiées en révision, toutes, les moins maîtrisées, ou une seule (« Me tester sur… »). */
export type QuizPool = 'studied' | 'all' | 'weak' | 'one'

/**
 * Les entités d'une copie qu'on ne règle pas (quiz, quiz rapide de l'accueil, raccourcis par thème) : celles
 * déjà étudiées en révision s'il y en a assez, pour qu'un débutant ne tombe pas sur des entités jamais vues ;
 * sinon toutes. `studied` : combien d'entités ont au moins une carte vue (studiedGhosts).
 */
export function defaultPool(studied: number): 'studied' | 'all' {
  return studied >= STUDIED_MIN ? 'studied' : 'all'
}

/** Ce que la page du quiz dit avant le bouton : sur quelles entités porte la copie, et pourquoi. */
export function scopeLine(pool: 'studied' | 'all', studied: number, total: number): string {
  if (pool === 'studied')
    return fr(
      `La copie porte sur les ${studied} entités que tu as déjà étudiées en révision : pas de question sur une entité que tu n'as jamais vue. S'il en manque sur elles pour les thèmes cochés, la fin de la copie le dit et passe aux autres entités.`,
    )
  if (studied >= STUDIED_MIN) return fr(`La copie porte sur les ${total} entités, même celles que tu n'as pas encore étudiées en révision.`)
  if (studied === 0) return fr(`Tu n'as encore étudié aucune entité en révision : la copie porte sur les ${total} entités, attends-toi à des noms que tu ne connais pas encore.`)
  const few = studied === 1 ? 'qu’une entité' : `que ${studied} entités`
  return fr(`Tu n'as étudié ${few} en révision (il en faut ${STUDIED_MIN} pour une copie sur ${studied === 1 ? 'elle seule' : 'elles seules'}) : la copie porte sur les ${total} entités.`)
}

/** Le lien « quiz rapide » de l'accueil : il dit sur quelles entités porte la copie (voir defaultPool). */
export function quickQuizLabel(studied: number, count: number): string {
  const on = defaultPool(studied) === 'studied' ? `sur tes ${studied} entités étudiées` : 'sur toutes les entités'
  return `ou un quiz rapide ${on} (${count}${NBSP}questions)`
}
