/**
 * Tracés « à la main » : cercles au stylo, cases du journal, coches, soulignés.
 * Le hasard est reproductible (une même graine donne toujours le même trait).
 */

export function seedOf(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function roughRng(seed: string | number): () => number {
  let a = typeof seed === 'string' ? seedOf(seed) : seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n: number) => Math.round(n * 10) / 10

type Pt = [number, number]

function smooth(pts: Pt[]): string {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

/** Cercle au stylo autour d'une boîte w × h (déborde un peu, ne se referme pas tout à fait). */
export function roughEllipse(w: number, h: number, r: () => number, padX = 0.1, padY = 0.35): string {
  const cx = w / 2
  const cy = h / 2
  const rx = w / 2 + Math.max(6, w * padX)
  const ry = h / 2 + Math.max(4, h * padY)
  const a0 = -Math.PI * 0.8 + (r() - 0.5) * 0.8
  const sweep = Math.PI * 2 * (1.08 + r() * 0.06)
  const n = 16
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = a0 + sweep * t
    const k = 1 + (r() - 0.5) * 0.05 + t * 0.06
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k - t * 2])
  }
  return smooth(pts)
}

export function roughLine(x1: number, y1: number, x2: number, y2: number, r: () => number, j = 1.2): string {
  const pts: Pt[] = []
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    pts.push([x1 + (x2 - x1) * t + (r() - 0.5) * j, y1 + (y2 - y1) * t + (r() - 0.5) * j * 1.6])
  }
  return smooth(pts)
}

/** Case du journal (carré tracé à la main), dans un repère de s + 16. */
export function roughBox(s: number, r: () => number): string {
  const o = 8
  const j = () => (r() - 0.5) * 2.4
  const p: Pt[] = [
    [o + j(), o + j()],
    [o + s + j(), o + j()],
    [o + s + j(), o + s + j()],
    [o + j(), o + s + j()],
    [o + j() + 1, o + j() - 2],
  ]
  return `M${p.map((q) => q.map(f).join(' ')).join(' L')}`
}

/** Coche qui déborde de la case. */
export function tickPath(s: number, r: () => number): string {
  const o = 8
  const j = () => (r() - 0.5) * 2
  return smooth([
    [o + 2 + j(), o + s * 0.45 + j()],
    [o + s * 0.38, o + s * 0.86 + j()],
    [o + s * 0.75, o + s * 0.2 + j()],
    [o + s * 1.25 + j(), o - s * 0.35 + j()],
  ])
}

/** Croix au crayon dans la case. */
export function crossPath(s: number, r: () => number): string {
  const o = 8
  return `${roughLine(o + 3, o + 3, o + s - 3, o + s - 3, r, 1.4)} ${roughLine(o + s - 3, o + 3, o + 3, o + s - 3, r, 1.4)}`
}
