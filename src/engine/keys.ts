/** Un champ où l'on tape : toutes les touches lui reviennent (une case à cocher n'en est pas un). */
const TYPING = 'textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"])'
/** Ce qu'Entrée ou Espace actionne de soi-même : un lien, un bouton, une case. */
const ACTIONABLE = 'a, button, input, textarea, select, summary, [contenteditable="true"]'

/**
 * Vrai si la touche doit être laissée au navigateur ou à l'élément qui a le focus. Les raccourcis d'un
 * exercice (chiffres et lettres pour répondre) marchent partout hors d'un champ de saisie, même si le focus
 * est resté sur l'onglet qu'on vient de toucher ou sur un lien de la page ; Entrée et Espace gardent leur
 * rôle sur un lien ou un bouton (ils l'actionnent), sauf là où `allowOn` les rend à l'exercice : ils ne
 * rouvrent jamais l'onglet ni ne cliquent deux fois. Jamais avec Ctrl, Cmd ou Alt, ni en touche répétée.
 */
export function ignoreKey(e: KeyboardEvent, allowOn?: (el: HTMLElement) => boolean): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return true
  const el = e.target instanceof HTMLElement ? e.target : null
  if (!el || el === document.body) return false
  if (el.closest(TYPING)) return true
  if (allowOn?.(el)) return false
  const activates = e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'
  return activates && !!el.closest(ACTIONABLE)
}

/**
 * Espace qui n'actionne rien : le focus est sur la question, la carte ou la page (ni lien, ni bouton, ni champ).
 * Sur une question pas encore répondue, l'exercice l'avale : sinon la page défilerait d'un écran et la question
 * sortirait de la vue. Jamais avec Ctrl, Cmd ou Alt ; Maj+Espace aussi (elle défilerait vers le haut).
 */
export function bareSpace(e: KeyboardEvent): boolean {
  if ((e.key !== ' ' && e.key !== 'Spacebar') || e.ctrlKey || e.metaKey || e.altKey) return false
  const el = e.target instanceof HTMLElement ? e.target : null
  return !el || el === document.body || !el.closest(ACTIONABLE)
}
