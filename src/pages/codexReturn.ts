/**
 * Une fiche ouverte depuis le registre ou la recherche du Codex : son lien « ‹ Codex » revient en arrière sur
 * l'entrée de l'historique où la recherche a été tapée (un retour arrière, que keepsSearch accepte), au lieu
 * d'ouvrir un Codex neuf sans la recherche. Une app installée sur iPhone n'a pas de bouton retour.
 */
export const FROM_CODEX = { fromCodex: true } as const

/** La fiche vient-elle du Codex, avec cette entrée encore juste avant dans l'historique ? */
export function cameFromCodex(state: unknown, historyIdx: unknown): boolean {
  return !!state && typeof state === 'object' && (state as { fromCodex?: unknown }).fromCodex === true && typeof historyIdx === 'number' && historyIdx > 0
}
