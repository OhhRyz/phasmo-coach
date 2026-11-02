import type { Ghost, TextItem } from '../data/types'

/** Les mots d'un texte, sans accents ni majuscules (« d'interaction » → « d », « interaction »). */
function words(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .match(/[\p{L}\d]+/gu) ?? []
}

/** Un mot qui porte le sens (pas « le », « de », « pas », « d' ») : plus de trois lettres. */
const meaningful = (w: string) => w.length > 3

/**
 * Le texte « sans preuve » d'une capacité redit-il une ligne de la même liste, adaptée à une partie sans
 * preuve (le Spectre laisse « un EMF 2 ou un EMF 5 », et sans preuve « un EMF 2 ») ? Même début de phrase
 * (quatre mots au moins, dont deux qui portent le sens : « Maudit le joueur… », pas seulement « Ne fait pas
 * d'… ») et la plupart des mots en commun.
 */
export function isZeroVariant(full: string, zero: string): boolean {
  const a = words(full)
  const b = words(zero)
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  if (prefix < 4 || a.slice(0, prefix).filter(meaningful).length < 2) return false
  const A = new Set(a.filter(meaningful))
  const B = new Set(b.filter(meaningful))
  const common = [...A].filter((w) => B.has(w)).length
  return common / Math.max(1, Math.min(A.size, B.size)) >= 0.55
}

export interface PairedItem {
  item: TextItem
  /** la même ligne, telle qu'elle vaut en partie sans preuve : affichée juste dessous, annoncée comme telle */
  variant?: TextItem
}

/**
 * Les lignes d'une liste de la fiche, chaque variante « sans preuve » rangée sous la ligne qu'elle adapte :
 * sinon la même capacité se lit deux fois, avec deux chiffres différents, comme une contradiction.
 */
export function pairZeroVariants(items: readonly TextItem[]): PairedItem[] {
  const variantOf = new Map<number, number>()
  const taken = new Set<number>()
  items.forEach((z, zi) => {
    if (!z.zeroEvidence) return
    const full = items.findIndex((f, fi) => !f.zeroEvidence && !taken.has(fi) && isZeroVariant(f.text, z.text))
    if (full < 0) return
    taken.add(full)
    variantOf.set(full, zi)
  })
  const placed = new Set(variantOf.values())
  return items.flatMap((item, i) => {
    if (placed.has(i)) return []
    const v = variantOf.get(i)
    return [v == null ? { item } : { item, variant: items[v] }]
  })
}

/** « Peut se téléporter… » → « peut se téléporter… », pour suivre « en partie sans preuve : ». */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('fr') + text.slice(1)
}

/**
 * L'exception qu'un test définitif nomme lui-même, ou null : « Seul un Gallu enragé (juste après…) fait pareil »
 * → « Gallu enragé » ; « désignent l'Obake (ou un Mimic en train de l'imiter…) » → « Mimic » ; « c'est un Démon
 * (à Sunny Meadows, un Onryo peut chasser tôt…) » → « Onryo à Sunny Meadows ». Le tampon garde la décision du
 * coach (définitif) et renvoie à l'exception. Une parenthèse qui ne fait que départager (« le Deogen aussi est
 * plus visible, mais… ») n'en est pas une.
 */
export function testException(text: string, ghosts: readonly Pick<Ghost, 'name'>[]): string | null {
  const names = ghosts.map((g) => g.name.replace(/^(?:Le|La|Les) /u, ''))
  const entity = (what: string) => names.some((n) => what === n || what.startsWith(`${n} `))
  const only = /(?<![\p{L}\d])Seule? (?:un|une|le|la|l['’])\s?([^.;:()«»]+?)\s*(?:\([^)]*\)\s*)?(?:fait|ferait|font|feraient) pareil/u.exec(text)
  if (only) return entity(only[1].trim()) ? only[1].trim() : null
  // « (ou un Mimic en train de l'imiter) » : une autre entité donne le même signe
  const or = /\(ou (?:un|une)\s([\p{Lu}][\p{L}-]*)/u.exec(text)
  if (or && names.includes(or[1])) return or[1]
  // « (à Sunny Meadows, un Onryo peut chasser tôt) » : une autre entité, sur une carte
  const map = /\(à ([\p{Lu}][\p{L}'’ -]*?), (?:un|une)\s([\p{Lu}][\p{L}-]*) peut\b/u.exec(text)
  if (map && names.includes(map[2])) return `${map[2]} à ${map[1]}`
  return null
}
