import type { Ghost } from '../data/types'

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Espace fine insécable (avant ? ! ; : et à l'intérieur des « »). */
export const NNBSP = '\u202f'
/** Espace insécable (entre un nombre et son unité). */
export const NBSP = '\u00a0'

/**
 * Typographie française pour les textes de l'app et des fiches : apostrophe courbe, espace fine
 * insécable avant ? ! ; : et dans les guillemets, espace insécable entre un nombre et son unité.
 * Ne jamais l'appliquer aux notes du coach (son texte reste tel qu'il l'a écrit).
 */
export function fr(text: string): string {
  return text
    .replace(/(\p{L})'(?=\p{L})/gu, '$1’')
    .replace(/[ \u00a0]+([?!;:»])/g, `${NNBSP}$1`)
    .replace(/«[ \u00a0]+/g, `«${NNBSP}`)
    .replace(/(\d)[ ](%|m\/s|°C|minutes?|secondes?|mètres?|heures?|jours?|min|s|j|h|pts|m)(?![\p{L}\d])/gu, `$1${NBSP}$2`)
}

/**
 * « LdV » des résumés courts des fiches, en toutes lettres là où on le lit (« accélère en ligne de vue ») :
 * le jargon n'arrive jamais abrégé sous les yeux d'un débutant.
 */
export function spellLdV(text: string): string {
  return text.replace(/\bLdV\b/gu, 'ligne de vue')
}

export function num(n: number): string {
  return nf.format(n)
}

export function speedText(g: Ghost): string {
  const s = g.speed
  if (s.min < 0) return 'Inconnue'
  const parts = [`${num(s.min)}`]
  if (s.max != null) parts.push(s.isRange ? `– ${num(s.max)}` : `ou ${num(s.max)}`)
  let out = `${parts.join(' ')}${NBSP}m/s`
  if (s.alt != null) out += ` (${num(s.alt)})`
  return out
}

export function sanityText(g: Ghost): string {
  const h = g.huntSanity
  const values = [...new Set([h.low, h.normal, h.high].filter((v) => v >= 0))].sort((a, b) => a - b)
  if (!values.length) return '???'
  return values.map((v) => `${v}${NBSP}%`).join(' · ')
}

export type SpeedClass = 'slow' | 'normal' | 'fast'
export type SanityClass = 'late' | 'normal' | 'early'

/** Classes inspirées des filtres du cheat sheet : lent < 1,7 m/s, rapide > 1,7 m/s. */
export function speedClasses(g: Ghost): Set<SpeedClass> {
  const s = g.speed
  const out = new Set<SpeedClass>()
  if (s.min < 0) return new Set(['slow', 'normal', 'fast'])
  const values = [s.min, s.max, s.alt].filter((v): v is number => v != null)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (lo < 1.7) out.add('slow')
  if (hi > 1.7) out.add('fast')
  if (values.includes(1.7) || (s.isRange && lo <= 1.7 && hi >= 1.7)) out.add('normal')
  return out
}

/** Tard < 50 %, normal = 50 %, tôt > 50 % (seuil de chasse). */
export function sanityClasses(g: Ghost): Set<SanityClass> {
  const h = g.huntSanity
  const out = new Set<SanityClass>()
  if ([h.low, h.normal, h.high].every((v) => v < 0)) return new Set(['late', 'normal', 'early'])
  for (const v of [h.low, h.normal, h.high]) {
    if (v < 0) continue
    if (v < 50) out.add('late')
    else if (v > 50) out.add('early')
    else out.add('normal')
  }
  return out
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

export function relativeDays(ts: number, now = Date.now()): string {
  const d = Math.round((startOfDay(ts) - startOfDay(now)) / 86_400_000)
  if (d === 0) return 'aujourd’hui'
  if (d === 1) return 'demain'
  if (d === -1) return 'hier'
  if (d > 1) return `dans ${d} jours`
  return `il y a ${-d} jours`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDate(ts: number): string {
  return safeDate(new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), ts)
}

/** Un horodatage utilisable (nombre fini, date valide), sinon null. */
export function validTime(t: unknown): number | null {
  if (typeof t !== 'number' || !Number.isFinite(t)) return null
  return Number.isNaN(new Date(t).getTime()) ? null : t
}

/**
 * Formate une date sans jamais planter : un lien de partage ou une sauvegarde peut contenir n'importe
 * quoi, et Intl.DateTimeFormat.format lève une erreur sur une date invalide.
 */
export function safeDate(f: Intl.DateTimeFormat, t: unknown, fallback = '—'): string {
  const v = validTime(t)
  return v == null ? fallback : f.format(v)
}

const namePatternCache = new WeakMap<Ghost, { names: string[]; patterns: RegExp[] }>()

/** Les noms d'une entité à caviarder (du plus long au plus court), et leur motif avec article. */
function namePatterns(g: Ghost): { names: string[]; patterns: RegExp[] } {
  const cached = namePatternCache.get(g)
  if (cached) return cached
  // Le nom français est cherché avec sa majuscule seulement : « Ombre », « Esprit » ou « Fantôme » sont
  // aussi des mots courants (« une ombre », « l'esprit »…) qu'il ne faut pas toucher.
  const bare = (n: string) => n.replace(/^(The |Le |Les |La |L['’])/, '')
  const names = [...new Set([g.name, bare(g.name), g.nameEn, bare(g.nameEn)])]
    .filter((n) => n.length > 2)
    .sort((a, b) => b.length - a.length)
  const patterns = names.map((n) => {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![\\p{L}])([Ll]['’]|[Ll]es? |[Ll]a |[Dd]u |[Dd]es |[Aa]ux? |[Dd]['’]une? |[Uu]ne? |[Dd]['’])?${escaped}s?(?![\\p{L}])`, 'gu')
  })
  const out = { names, patterns }
  namePatternCache.set(g, out)
  return out
}

/**
 * Remplace le nom de l'entité dans un texte pour ne pas souffler la réponse. Ce qui est entre « » n'est
 * jamais touché : c'est un libellé du jeu (« Fantôme translucide », « Cri paranormal ») ou une phrase
 * citée, qui deviendrait incompréhensible. Un texte qui nomme l'entité entre « » ne se pose donc pas tel quel.
 */
export function redactGhostName(text: string, g: Ghost): string {
  const { names, patterns } = namePatterns(g)
  // le plus souvent, le nom n'y est pas du tout : rien à faire
  if (!names.some((n) => text.includes(n))) return text
  const lead: Record<string, string> = {
    'du ': 'de ', 'des ': 'de ', 'au ': 'à ', 'aux ': 'à ', "d'": 'de ', 'd’': 'de ',
    "d'un ": 'de ', 'd’un ': 'de ', "d'une ": 'de ', 'd’une ': 'de ',
  }
  const outside = (part: string) => {
    let out = part
    for (const re of patterns) {
      out = out.replace(re, (_m, article?: string) => `${lead[article?.toLowerCase() ?? ''] ?? ''}cette entité`)
    }
    // « qu'un Deogen » devient « que cette entité » (et non « qu'cette entité »)
    return out.replace(/(?<![\p{L}])(d|D|qu|Qu|n|N|s|S)['’]cette entité/gu, '$1e cette entité')
  }
  // les morceaux impairs sont entre « »
  return text
    .split(/(«[^«»]*»)/u)
    .map((part, i) => (i % 2 ? part : outside(part)))
    .join('')
}
