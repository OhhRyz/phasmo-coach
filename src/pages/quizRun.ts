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
   * L'entrée de l'historique où la copie a été distribuée. Venue d'un raccourci (« quiz rapide », « Me tester
   * sur… »), son adresse le redemande à chaque retour sur cette entrée : un rechargement ou le bouton retour ne
   * distribue pas une copie neuve par-dessus celle-ci, la page propose de la reprendre.
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

/** Une copie relue telle quelle : des questions lisibles, au moins une réponse, la question en cours dans la copie. */
export function validCopy(c: SavedCopy): boolean {
  if (!c || !Array.isArray(c.questions) || !c.questions.every(validQuestion)) return false
  if (!Number.isInteger(c.index) || c.index < 0 || c.index >= c.questions.length) return false
  if (!Array.isArray(c.answers) || c.answers.length === 0 || c.answers.length > c.index + 1) return false
  if (!c.answers.every((a) => a && validQuestion(a.q) && strings(a.selected) && typeof a.correct === 'boolean')) return false
  return strings(c.selected) && typeof c.checked === 'boolean' && (c.entry === undefined || typeof c.entry === 'string')
}

export function readCopy(now = Date.now()): SavedCopy | null {
  return readRun<SavedCopy>(COPY_KEY, validCopy, now)
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
