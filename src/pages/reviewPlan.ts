/**
 * Durée annoncée d'une séance de révision. Une carte ne se répond pas toujours qu'une fois : une carte ratée
 * repasse plus loin dans la séance (une carte juste, nouvelle ou non, attend le lendemain ou plus loin). On
 * compte donc les réponses attendues, pas les cartes.
 */

/** Réponses attendues pour une carte nouvelle (une, et une de plus quand on la rate, souvent la première fois). */
export const ANSWERS_PER_NEW = 1.5
/** Réponses attendues pour une carte due (le plus souvent juste du premier coup). */
export const ANSWERS_PER_DUE = 1.2
/** Temps moyen d'une réponse, lecture de la correction comprise (secondes). */
export const SECONDS_PER_ANSWER = 20

export function expectedAnswers(newCount: number, dueCount: number): number {
  return newCount * ANSWERS_PER_NEW + dueCount * ANSWERS_PER_DUE
}

/** « environ 6 min » pour 12 cartes nouvelles ; jamais moins d'une minute. */
export function sessionMinutes(newCount: number, dueCount: number): number {
  return Math.max(1, Math.round((expectedAnswers(newCount, dueCount) * SECONDS_PER_ANSWER) / 60))
}
