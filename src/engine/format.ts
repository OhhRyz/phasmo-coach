import type { Ghost } from '../data/types'

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

export function num(n: number): string {
  return nf.format(n)
}

export function speedText(g: Ghost): string {
  const s = g.speed
  if (s.min < 0) return 'Inconnue'
  const parts = [`${num(s.min)}`]
  if (s.max != null) parts.push(s.isRange ? `– ${num(s.max)}` : `| ${num(s.max)}`)
  let out = `${parts.join(' ')} m/s`
  if (s.alt != null) out += ` (${num(s.alt)})`
  return out
}

export function sanityText(g: Ghost): string {
  const h = g.huntSanity
  const values = [...new Set([h.low, h.normal, h.high].filter((v) => v >= 0))].sort((a, b) => a - b)
  if (!values.length) return '???'
  return values.map((v) => `${v} %`).join(' · ')
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
  if (d === 0) return "aujourd'hui"
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
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Remplace le nom de l'entité dans un texte pour ne pas souffler la réponse. */
export function redactGhostName(text: string, g: Ghost): string {
  // Le nom français est cherché avec sa majuscule seulement : « Ombre », « Esprit » ou « Fantôme » sont
  // aussi des mots courants (« une ombre », « l'esprit »…) qu'il ne faut pas toucher.
  const bare = (n: string) => n.replace(/^(The |Le |Les |La |L['’])/, '')
  const names = [...new Set([g.name, bare(g.name), g.nameEn, bare(g.nameEn)])]
    .filter((n) => n.length > 2)
    .sort((a, b) => b.length - a.length)
  const lead: Record<string, string> = { 'du ': 'de ', 'des ': 'de ', 'au ': 'à ', 'aux ': 'à ', "d'": 'de ', 'd’': 'de ' }
  let out = text
  for (const n of names) {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![\\p{L}])([Ll]['’]|[Ll]es? |[Ll]a |[Dd]u |[Dd]es |[Aa]ux? |[Uu]ne? |[Dd]['’])?${escaped}s?(?![\\p{L}])`, 'gu')
    out = out.replace(re, (_m, article?: string) => `${lead[article?.toLowerCase() ?? ''] ?? ''}cette entité`)
  }
  return out
}
