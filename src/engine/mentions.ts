import type { Ghost } from '../data/types'

/** Un morceau de texte, ou le nom d'une autre entité à lier à sa fiche. */
export type Mention = string | { id: string; text: string }

/**
 * Ce qui annonce un nom d'entité : un article ou une élision (« l'Obambo », « un Gallu », « la Banshee », « les
 * Jumeaux », « d'Obambo », « au Démon »). Sans lui, pas de lien : « difficulté Cauchemar », « Spirit Box » ou
 * un « Esprit » en début de phrase restent du texte.
 */
const LEAD = `(?:[Ll]es|[Ll]e|[Ll]a|[Uu]ne|[Uu]n|[Dd]u|[Dd]es|[Aa]ux|[Aa]u|[Cc]ette|[Cc]et)[ \\u00a0]|[LlDd]['’]`

const cache = new WeakMap<readonly Ghost[], { re: RegExp; byName: Map<string, string> }>()

function patternFor(ghosts: readonly Ghost[]) {
  const hit = cache.get(ghosts)
  if (hit) return hit
  // le nom français tel qu'il s'écrit dans les fiches, sans son article (« Le Mimic » → « Mimic »)
  const byName = new Map(ghosts.map((g) => [g.name.replace(/^(?:Le|La|Les) /u, ''), g.id]))
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(?<![\\p{L}\\d])(${LEAD})(${names.join('|')})(?![\\p{L}\\d])`, 'gu')
  const out = { re, byName }
  cache.set(ghosts, out)
  return out
}

/**
 * Les noms d'autres entités dans un texte de fiche, à lier à leur fiche. Seulement un nom exact, avec sa
 * majuscule, jamais un morceau de mot, et annoncé par un article ou une élision (voir LEAD), au masculin comme
 * au féminin (« le Gallu », « une Dayan », « l'Ombre »). Rien entre « » : c'est un libellé du jeu ou une phrase
 * citée. Une entité n'est liée qu'une fois par texte, jamais celles de `skip` (l'entité de la fiche, celle déjà
 * nommée en tête de la ligne). Un texte sans nom revient tel quel, en un seul morceau.
 */
export function entityMentions(text: string, ghosts: readonly Ghost[], skip: readonly string[] = []): Mention[] {
  const { re, byName } = patternFor(ghosts)
  const linked = new Set(skip)
  const out: Mention[] = []
  let plain = ''
  for (const [i, part] of text.split(/(«[^«»]*»)/u).entries()) {
    if (i % 2) {
      plain += part
      continue
    }
    let last = 0
    re.lastIndex = 0
    for (let m = re.exec(part); m; m = re.exec(part)) {
      const id = byName.get(m[2])
      if (!id || linked.has(id)) continue
      linked.add(id)
      const at = m.index + m[1].length
      plain += part.slice(last, at)
      if (plain) out.push(plain)
      plain = ''
      out.push({ id, text: m[2] })
      last = at + m[2].length
    }
    plain += part.slice(last)
  }
  if (plain) out.push(plain)
  return out
}
