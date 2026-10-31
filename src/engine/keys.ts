/** Vrai si la touche doit être laissée au navigateur ou à l'élément qui a le focus. */
export function ignoreKey(e: KeyboardEvent, allowOn?: (el: HTMLElement) => boolean): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return true
  const el = e.target instanceof HTMLElement ? e.target : null
  if (!el || el === document.body) return false
  if (allowOn?.(el)) return false
  return !!el.closest('a, button, input, textarea, select, [contenteditable="true"]')
}
