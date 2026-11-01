/**
 * Durée annoncée d'une séance de révision. Une carte ne se répond pas qu'une fois : une carte nouvelle
 * repasse dans la séance pour s'ancrer (et deux fois après une erreur), une carte due repasse si elle est
 * ratée. On compte donc les réponses attendues, pas les cartes.
 */

/** Réponses attendues pour une carte nouvelle (vue, revue, et parfois ratée une fois). */
export const ANSWERS_PER_NEW = 2.5
/** Réponses attendues pour une carte due (le plus souvent juste du premier coup). */
export const ANSWERS_PER_DUE = 1.3
/** Temps moyen d'une réponse, lecture de la correction comprise (secondes). */
export const SECONDS_PER_ANSWER = 20

export function expectedAnswers(newCount: number, dueCount: number): number {
  return newCount * ANSWERS_PER_NEW + dueCount * ANSWERS_PER_DUE
}

/** « environ 10 min » pour 12 cartes nouvelles ; jamais moins d'une minute. */
export function sessionMinutes(newCount: number, dueCount: number): number {
  return Math.max(1, Math.round((expectedAnswers(newCount, dueCount) * SECONDS_PER_ANSWER) / 60))
}
