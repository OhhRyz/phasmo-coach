import type { Card } from '../engine/cards'

/** Cartes nouvelles proposées d'un coup après la séance (« Apprendre 10 cartes »). */
export const LEARN_MORE = 10

/**
 * Les cartes qui passeront encore dans la séance : toute la file, sauf la carte en cours une fois répondue
 * si elle ne repasse pas. La fiche de séance tait leur entité, comme l'en-tête de la carte : une carte ratée
 * qui revient trouverait sinon sa réponse écrite en face d'elle (« Poltergeist · Test sans preuve · À revoir »).
 */
export function stillToAsk(queue: readonly Card[], answered: { again: boolean } | null): Set<string> {
  const rest = answered && !answered.again ? queue.slice(1) : queue
  return new Set(rest.map((c) => c.id))
}

const cards = (n: number) => `${n} ${n > 1 ? 'cartes' : 'carte'}`

/**
 * Le bouton de fin de séance, d'après les séances que le clic lancera : `pending`, la file d'une séance
 * sans cartes en plus ; `learnable`, celle d'une séance avec LEARN_MORE cartes nouvelles en plus. Une même
 * question ne se pose qu'une fois par séance : une séance finie peut en laisser d'autres pour la suivante, et
 * la fin du fichier en promettre moins que LEARN_MORE. « Reprendre » seulement pour une séance interrompue
 * (des cartes restaient dans la file) ; null : plus rien à réviser ni à découvrir.
 */
export function nextSession(pending: number, learnable: number, interrupted: boolean): { label: string; extraNew: number } | null {
  if (pending > 0) return { label: interrupted ? 'Reprendre la séance' : `Continuer avec ${cards(pending)}`, extraNew: 0 }
  if (learnable > 0) return { label: `Apprendre ${cards(learnable)}`, extraNew: LEARN_MORE }
  return null
}
