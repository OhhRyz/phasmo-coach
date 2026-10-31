/**
 * Photographies procédurales des entités, en noir et blanc granuleux (flash, vignettage, fuite de
 * lumière, grain). Chaque entité a sa mise en scène et un indice visuel tiré de sa fiche : une bougie
 * pour l’Onryo, un disjoncteur pour le Djinn, une main à six doigts pour l’Obake… Entièrement
 * générées (aucune image du jeu), sans texte ni gore.
 */
import { roughRng } from './rough'

const f = (n: number) => Math.round(n * 10) / 10
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

interface Figure {
  x: number
  foot: number
  h: number
  lean?: number
  tilt?: number
  arm?: number
  armLen?: number
  op?: number
  col?: string
  /** b : flou normal ; b2 : très flou ; m : filé horizontal (mouvement) ; none : net */
  blur?: 'b' | 'b2' | 'm' | 'none'
  /** largeur relative (une silhouette massive > 1 ; négative : silhouette retournée) */
  wide?: number
  /** robe longue au lieu des jambes */
  dress?: boolean
  /** cheveux longs */
  hair?: boolean
  /** proportions d’enfant (tête plus grosse) */
  child?: boolean
  /** dos voûté, en degrés, avec une canne */
  hunch?: number
  /** jambes qui s’effacent (silhouette qui flotte) */
  fade?: boolean
}

function figure(o: Figure, uid: string): string {
  const { x, foot, h, lean = 0, tilt = 0, arm = 0, armLen = 0, op = 0.92, col = '#0a0908', blur = 'b', wide = 1 } = o
  const s = h / 100
  const ax = 17 + arm * 1.5
  const ay = -42 + armLen
  const cy = -58 + Math.min(0, armLen) * 0.6
  const head = o.child
    ? `<ellipse cx="0" cy="-87" rx="9.8" ry="11.4" transform="rotate(${f(tilt)} 0 -77)"/>`
    : `<ellipse cx="0" cy="-89" rx="7.4" ry="9.2" transform="rotate(${f(tilt)} 0 -79)"/>`
  const hair = o.hair
    ? `<path d="M-8.6 -96 Q-12.5 -80 -11.5 -61 L11.5 -61 Q12.5 -80 8.6 -96 Q0 -101 -8.6 -96Z" transform="rotate(${f(tilt * 0.5)} 0 -79)"/>`
    : ''
  const torso = o.dress
    ? `<path d="M-13.5 -76 Q0 -80 13.5 -76 Q11 -60 8.5 -44 Q0 -42 -8.5 -44 Q-11 -60 -13.5 -76Z" stroke-width="2"/>`
    : `<path d="M-14.5 -76 Q0 -81 14.5 -76 Q13 -58 10.5 -40 Q0 -37 -10.5 -40 Q-13 -58 -14.5 -76Z" stroke-width="2"/>`
  const legs = o.dress
    ? `<path d="M-9 -46 L9 -46 Q14 -24 19 -1 L-19 -1 Q-14 -24 -9 -46Z" stroke-width="2"/>`
    : `<path d="M-5.6 -44 L-6.6 -1" fill="none" stroke-width="8.6"/><path d="M5.6 -44 L6.6 -1" fill="none" stroke-width="8.6"/>`
  const upper = `${hair}${head}<path d="M-3.6 -82 L3.6 -82 L4.4 -73 L-4.4 -73Z"/>${torso}
      <path d="M-12.6 -73 Q${f(-17 - arm)} ${f(cy)} ${f(-ax)} ${f(ay)}" fill="none" stroke-width="6"/>
      <path d="M12.6 -73 Q${f(17 + arm)} ${f(cy)} ${f(ax)} ${f(ay)}" fill="none" stroke-width="6"/>`
  let body = `${upper}${legs}`
  if (o.hunch) {
    // le haut du corps pivote autour des hanches ; la main droite tient une canne
    const t = (o.hunch * Math.PI) / 180
    const hx = ax * Math.cos(t) - (ay + 44) * Math.sin(t)
    const hy = -44 + ax * Math.sin(t) + (ay + 44) * Math.cos(t)
    body = `<g transform="rotate(${f(o.hunch)} 0 -44)">${upper}</g>${legs}<path d="M${f(hx)} ${f(hy - 5)} L${f(hx + 7)} -1" fill="none" stroke-width="3.6"/>`
  }
  const inner = `<g fill="${col}" stroke="${col}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
  const filter = blur === 'none' ? '' : ` filter="url(#${uid}_${blur})"`
  return `<g transform="translate(${f(x)} ${f(foot)}) rotate(${f(lean)}) scale(${(s * wide).toFixed(3)} ${s.toFixed(3)})" opacity="${op}"${filter}>${
    o.fade ? `<g mask="url(#${uid}_fm)">${inner}</g>` : inner
  }</g>`
}

export interface PhotoOptions {
  scene?: 'door' | 'corridor' | 'room' | 'wall'
  leak?: string
  close?: boolean
  double?: boolean
  dx?: number
  vx?: number
  wx?: number
  blur?: number
  figure?: Partial<Figure>
  /** indice visuel propre à l’entité (clé de CUES) */
  cue?: string
  /** pénombre posée sur la pièce (0 à 1) */
  dark?: number
  /** intensité du flash (1 par défaut) */
  flash?: number
  /** description de la photo pour les lecteurs d’écran */
  alt?: string
}

interface Scene {
  body: string
  fx: number
  fy: number
  /** place par défaut de la silhouette */
  spot: Figure
  /** repères de la scène (porte, fond du couloir, fenêtre, sol) */
  g: Record<string, number>
}

function door(o: PhotoOptions, r: () => number, uid: string): Scene {
  const dx = o.dx ?? 70 + r() * 60
  const dw = 50 + r() * 8
  const dh = 102 + r() * 8
  const base = 150
  const top = base - dh
  let body = `<rect width="200" height="200" fill="#3b3833"/>`
  body += `<path d="M0 ${base + 2} L200 ${base - 4} L200 200 L0 200Z" fill="#26231f"/>`
  body += `<path d="M0 ${base - 3} L200 ${base - 9} L200 ${base - 4} L0 ${base + 2}Z" fill="#57524a"/>`
  body += `<rect x="${f(dx - dw / 2 - 7)}" y="${f(top - 7)}" width="${f(dw + 14)}" height="${f(dh + 7)}" fill="#6a645a"/>`
  body += `<rect x="${f(dx - dw / 2)}" y="${f(top)}" width="${f(dw)}" height="${f(dh)}" fill="url(#${uid}_in)"/>`
  body += `<path d="M${f(dx + dw / 2)} ${f(top)} L${f(dx + dw / 2 - 16)} ${f(top + 8)} L${f(dx + dw / 2 - 16)} ${f(top + dh - 4)} L${f(dx + dw / 2)} ${f(top + dh)}Z" fill="#2b2824"/>`
  body += `<rect x="${f(dx - dw / 2 - 22)}" y="${f(top + 44)}" width="7" height="11" rx="1" fill="#7d766a"/>`
  return { body, fx: (dx - 20) / 200, fy: 0.5, spot: { x: dx - 4, foot: top + dh - 1, h: dh * 0.9 }, g: { dx, dw, dh, top, base } }
}

function corridor(o: PhotoOptions, r: () => number, uid: string): Scene {
  const vx = o.vx ?? 100 + (r() - 0.5) * 34
  const vy = 90 + (r() - 0.5) * 10
  const ew = 22
  const eh = 30
  let body = `<rect width="200" height="200" fill="#211f1c"/>`
  body += `<polygon points="0,0 ${f(vx - ew)},${f(vy - eh)} ${f(vx - ew)},${f(vy + eh * 0.8)} 0,200" fill="url(#${uid}_wl)"/>`
  body += `<polygon points="200,0 ${f(vx + ew)},${f(vy - eh)} ${f(vx + ew)},${f(vy + eh * 0.8)} 200,200" fill="url(#${uid}_wr)"/>`
  body += `<polygon points="0,200 ${f(vx - ew)},${f(vy + eh * 0.8)} ${f(vx + ew)},${f(vy + eh * 0.8)} 200,200" fill="#1a1816"/>`
  body += `<rect x="${f(vx - ew)}" y="${f(vy - eh)}" width="${ew * 2}" height="${f(eh * 1.8)}" fill="#7a7162"/>`
  body += `<rect x="${f(vx - 8)}" y="${f(vy - eh + 8)}" width="16" height="22" fill="#a39885" opacity=".7"/>`
  for (const t of [0.32, 0.62]) {
    const xl = (vx - ew) * t
    const yt = (vy - eh) * t
    const yb = 200 - (200 - (vy + eh * 0.8)) * t
    body += `<path d="M${f(xl)} ${f(yt + 24 * (1 - t))} L${f(xl)} ${f(yb)}" stroke="#0f0e0c" stroke-width="${f(5 * (1 - t) + 1)}" opacity=".7"/>`
    const xr = 200 - (200 - (vx + ew)) * t
    body += `<path d="M${f(xr)} ${f(yt + 30 * (1 - t))} L${f(xr)} ${f(yb)}" stroke="#0f0e0c" stroke-width="${f(5 * (1 - t) + 1)}" opacity=".6"/>`
  }
  const end = vy + eh * 0.8
  const spot = o.close ? { x: vx - 6, foot: 196, h: 118 } : { x: vx + (r() - 0.5) * 10, foot: end, h: 50 + r() * 10 }
  return { body, fx: 0.5, fy: 0.6, spot, g: { vx, vy, end } }
}

function room(o: PhotoOptions, r: () => number, uid: string): Scene {
  const wx = o.wx ?? 76 + r() * 50
  const floor = 158
  let body = `<rect width="200" height="200" fill="#34312c"/>`
  body += `<polygon points="0,0 34,22 34,${floor} 0,200" fill="#272521"/>`
  body += `<polygon points="0,200 34,${floor} 200,${floor} 200,200" fill="#1f1d1a"/>`
  body += `<rect x="${f(wx)}" y="36" width="64" height="80" fill="url(#${uid}_mw)"/>`
  body += `<path d="M${f(wx + 32)} 36 V116 M${f(wx)} 72 H${f(wx + 64)}" stroke="#1b1a18" stroke-width="3.5"/>`
  body += `<rect x="${f(wx - 5)}" y="114" width="74" height="5" fill="#4d4942"/>`
  body += `<path d="M${f(wx - 14)} 28 Q${f(wx - 4)} 80 ${f(wx - 12)} 150 L${f(wx - 24)} 150 Q${f(wx - 18)} 80 ${f(wx - 22)} 28Z" fill="#191816" opacity=".85"/>`
  return { body, fx: 0.42, fy: 0.62, spot: { x: wx + 34 + (r() - 0.5) * 14, foot: floor + 4, h: 112, col: '#070707' }, g: { wx, floor } }
}

/** Gros plan sur une porte en bois (pour une empreinte). */
function wall(): Scene {
  let body = `<rect width="200" height="200" fill="#2c2a26"/>`
  body += `<rect width="16" height="200" fill="#48433b"/><rect x="16" width="4" height="200" fill="#1a1815"/>`
  body += `<rect x="38" y="14" width="130" height="74" fill="#33302b" stroke="#1b1917" stroke-width="4"/>`
  body += `<rect x="38" y="104" width="130" height="86" fill="#33302b" stroke="#1b1917" stroke-width="4"/>`
  body += `<path d="M60 0 V200 M104 0 V200 M141 0 V200" stroke="#3a3731" stroke-width="1" opacity=".6"/>`
  return { body, fx: 0.46, fy: 0.5, spot: { x: 100, foot: 160, h: 100 }, g: {} }
}

const SCENES: Record<NonNullable<PhotoOptions['scene']>, (o: PhotoOptions, r: () => number, uid: string) => Scene> = { door, corridor, room, wall }

interface Ctx {
  uid: string
  r: () => number
  g: Record<string, number>
  /** silhouette par défaut de la scène, réglages de l’entité compris */
  base: Figure
  F: (o?: Partial<Figure>) => string
}

interface Layers {
  defs?: string
  /** au mur, derrière la silhouette */
  back?: string
  /** remplace la silhouette par défaut ('' : personne) */
  figs?: string
  /** au premier plan, devant la silhouette */
  front?: string
  /** lumières (après le flash, avant le vignettage) */
  over?: string
  /** par-dessus tout (après le grain) */
  top?: string
  fx?: number
  fy?: number
}

/** Halo lumineux (bougie, écran, flash). */
const glow = (uid: string, x: number, y: number, rad: number, op = 0.8) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${rad}" fill="url(#${uid}_gw)" opacity="${op}" style="mix-blend-mode:screen"/>`

/** Grains de sel ou poussière autour d’un point. */
const grains = (r: () => number, x: number, y: number, w: number, h: number, n: number, col = '#e6e0d2') =>
  `<g fill="${col}">${Array.from({ length: n }, () => `<circle cx="${f(x + (r() - 0.5) * w)}" cy="${f(y + (r() - 0.5) * h)}" r="${f(0.5 + r() * 1.1)}"/>`).join('')}</g>`

/** Indices visuels, un par entité. */
const CUES: Record<string, (c: Ctx) => Layers> = {
  /** Esprit : un bâton d’encens qui fume (sa signature : 180 s sans chasse après l’encens). */
  smudge: ({ uid }) => ({
    front: `<ellipse cx="74" cy="183" rx="40" ry="9" fill="#5d584f"/><ellipse cx="74" cy="181" rx="31" ry="6" fill="#3d3933"/>
      <g transform="translate(70 172) rotate(-16)"><path d="M-36 -5 Q-39 0 -36 5 L25 7 Q31 0 25 -7Z" fill="#9a917e"/>
      <path d="M-24 -6 L-18 6 M-11 -7 L-5 7 M2 -7 L8 7 M14 -7 L20 7" stroke="#3b372f" stroke-width="1.8"/><circle cx="28" cy="0" r="5" fill="#fff3d0"/></g>
      <path d="M98 160 C86 134 118 116 102 90 S86 50 112 16" fill="none" stroke="#ece6d8" stroke-width="8" stroke-linecap="round" opacity=".42" filter="url(#${uid}_b)"/>
      <path d="M99 158 C93 138 111 122 106 102 S96 68 121 44" fill="none" stroke="#f6f1e6" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`,
    over: glow(uid, 98, 164, 26, 0.9),
    fx: 0.5,
    fy: 0.7,
  }),

  /** Spectre : un tas de sel intact sous une silhouette qui flotte. */
  salt: ({ uid, r, g, F, base }) => {
    const x = base.x
    const y = g.base + 12
    return {
      figs: F({ foot: base.foot - 22, fade: true }),
      front: `<ellipse cx="${f(x)}" cy="${y + 5}" rx="34" ry="5" fill="#000" opacity=".45" filter="url(#${uid}_b)"/>
        <path d="M${f(x - 30)} ${y + 5} L${f(x - 22)} ${y - 1} L${f(x - 16)} ${y - 3} L${f(x - 8)} ${y - 10} L${f(x - 3)} ${y - 11} L${f(x + 4)} ${y - 9} L${f(x + 10)} ${y - 6} L${f(x + 18)} ${y - 4} L${f(x + 30)} ${y + 5}Z" fill="#d9d3c4"/>
        <path d="M${f(x - 30)} ${y + 5} L${f(x + 30)} ${y + 5} L${f(x + 18)} ${y - 4} L${f(x + 10)} ${y - 6} L${f(x + 4)} ${y + 1}Z" fill="#a8a294" opacity=".55"/>${grains(r, x, y - 2, 52, 12, 22, '#f3efe6')}${grains(r, x, y + 6, 84, 6, 12)}`,
      fy: 0.62,
    }
  },

  /** Fantôme : la silhouette s’efface dans l’éclair du flash. */
  vanish: ({ uid, g }) => ({
    over: `${glow(uid, g.dx, 96, 86, 1)}${glow(uid, g.dx - 2, 94, 34, 1)}
      <ellipse cx="${f(g.dx)}" cy="95" rx="110" ry="1.8" fill="#fff" opacity=".5"/>
      <circle cx="${f(g.dx + 46)}" cy="146" r="10" fill="#fff" opacity=".1"/><circle cx="${f(g.dx + 64)}" cy="168" r="5" fill="#fff" opacity=".12"/>`,
    fx: g.dx / 200,
    fy: 0.48,
  }),

  /** Poltergeist : des objets suspendus en l’air, sans personne. */
  objects: ({ uid, r }) => {
    const items: [string, number, number, number][] = [
      [`<rect x="-17" y="-11" width="34" height="22" rx="1.5" fill="#24211d"/><rect x="12" y="-9" width="4" height="18" fill="#d8cfbb"/>`, 124, 58, -28],
      [`<ellipse rx="16" ry="5.5" fill="#ddd6c7"/><ellipse rx="9.5" ry="3" fill="#b9b1a1"/>`, 168, 98, 18],
      [`<rect x="-7" y="-9" width="14" height="18" rx="2" fill="#d2cab9"/><path d="M7 -5 q8 0 8 5 t-8 5" fill="none" stroke="#d2cab9" stroke-width="2.8"/>`, 92, 124, 40],
      [`<path d="M-11 -30 V16 M-11 -2 H13 V16 M-11 -30 H-4 V-2" fill="none" stroke="#151310" stroke-width="3.6" stroke-linejoin="round"/>`, 150, 144, 26],
      [`<rect x="-12" y="-8" width="24" height="16" rx="1" fill="#2c2924"/><rect x="-12" y="5" width="24" height="3" fill="#cdc4b0"/>`, 60, 76, 62],
    ]
    return {
      figs: '',
      front:
        items
          .map(
            ([shape, x, y, a]) =>
              `<g transform="translate(${x - 9} ${y + 5}) rotate(${a - 12})" opacity=".35" filter="url(#${uid}_m)">${shape}</g><g transform="translate(${x} ${y}) rotate(${a})">${shape}</g>`,
          )
          .join('') + grains(r, 120, 110, 120, 90, 9, '#0e0d0b'),
      fx: 0.6,
      fy: 0.46,
    }
  },

  /** Banshee : une silhouette de femme dans l’embrasure. */
  woman: ({ F, g }) => ({ figs: F({ dress: true, hair: true, h: g.dh * 0.92 }) }),

  /** Djinn : un disjoncteur ouvert au mur. */
  breaker: () => {
    let s = `<rect x="64" y="0" width="7" height="48" fill="#4a463f"/>`
    s += `<rect x="40" y="46" width="56" height="78" rx="2" fill="#7b766c" stroke="#1d1b18" stroke-width="2"/>`
    s += `<rect x="45" y="52" width="46" height="66" fill="#2c2925"/><rect x="58" y="56" width="20" height="9" fill="#dcd6c9"/><rect x="58" y="56" width="7" height="9" fill="#1a1816"/>`
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 2; col++) {
        const x = 50 + col * 21
        const y = 70 + row * 9
        s += `<rect x="${x}" y="${y}" width="15" height="5.5" fill="#d0c9bb"/><rect x="${x + ((row + col) % 3 ? 0 : 10)}" y="${y}" width="5" height="5.5" fill="#1a1816"/>`
      }
    s += `<path d="M40 46 L25 53 L25 117 L40 124Z" fill="#625d55" stroke="#1d1b18" stroke-width="1.5"/>`
    return { back: s, fx: 0.36, fy: 0.42 }
  },

  /** Cauchemar : une ampoule éteinte, la pièce dans le noir. */
  bulb: () => ({
    front: `<path d="M78 0 V46" stroke="#121110" stroke-width="2"/><rect x="72" y="44" width="12" height="14" fill="#2a2723"/>
      <path d="M72 48 H84 M72 52 H84" stroke="#4a463f" stroke-width="1"/>
      <path d="M72 58 L84 58 L85 63 Q92 68 92 80 A14 14 0 0 1 64 80 Q64 68 71 63Z" fill="#8a867d"/>
      <path d="M75 62 L74 75 M81 62 L82 75 M74 75 l2 -4 l2 4 l2 -4 l2 4" stroke="#36342f" stroke-width="1.1" fill="none"/>
      <path d="M69 76 Q69 68 75 65" stroke="#f2eee5" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".85"/>
      <rect x="44" y="94" width="10" height="15" rx="1" fill="#6d675d"/><rect x="47.5" y="102" width="3" height="5" fill="#1d1b18"/>`,
    fx: 0.39,
    fy: 0.38,
  }),

  /** Revenant : il fonce sur l’objectif. */
  lunge: ({ F, g }) => ({
    figs: F({ x: g.vx + 6, foot: g.end + 8, h: 64, op: 0.22, blur: 'b2', arm: 6, armLen: -16 }) + F({ x: g.vx - 4, foot: 204, h: 136, lean: 5, arm: 9, armLen: -24, op: 1 }),
  }),

  /** Ombre : une pièce sombre, presque vide. */
  shadow: ({ F }) => ({ figs: F({ x: 58, foot: 160, h: 102, op: 0.3, blur: 'b2', col: '#000' }) }),

  /** Démon : un crucifix tombé au sol, brûlé. */
  crucifix: ({ uid }) => ({
    front: `<ellipse cx="100" cy="176" rx="50" ry="14" fill="#000" opacity=".6" filter="url(#${uid}_b2)"/>
      <g transform="translate(100 174) rotate(-14) scale(1 .5)" fill="#cfc4ab" stroke="#2b2622" stroke-width="2.4"><rect x="-6" y="-48" width="12" height="96"/><rect x="-28" y="-28" width="56" height="12"/></g>`,
    fy: 0.72,
  }),

  /** Yurei : une porte entrouverte. */
  ajar: ({ uid, F, g }) => {
    const L = g.dx - g.dw / 2
    const R = g.dx + g.dw / 2
    const gx = L + 19
    let s = `<path d="M${f(gx)} ${f(g.top + 3)} L${f(R)} ${f(g.top)} L${f(R)} ${f(g.top + g.dh)} L${f(gx)} ${f(g.top + g.dh - 3)}Z" fill="#5f594f"/>`
    s += `<rect x="${f(gx - 3)}" y="${f(g.top + 3)}" width="3.5" height="${f(g.dh - 6)}" fill="#25221e"/>`
    s += `<g fill="#68625a" stroke="#3b3730" stroke-width="2"><rect x="${f(gx + 7)}" y="${f(g.top + 11)}" width="${f(R - gx - 14)}" height="${f(g.dh * 0.34)}"/><rect x="${f(gx + 7)}" y="${f(g.top + g.dh * 0.5)}" width="${f(R - gx - 14)}" height="${f(g.dh * 0.42)}"/></g>`
    s += `<circle cx="${f(gx + 6)}" cy="${f(g.top + g.dh * 0.52)}" r="2.8" fill="#c7bea9"/>`
    return {
      defs: `<clipPath id="${uid}_dc"><rect x="${f(L)}" y="${f(g.top)}" width="${f(g.dw)}" height="${f(g.dh)}"/></clipPath>`,
      figs: `<g clip-path="url(#${uid}_dc)">${F({ x: L + 12, h: g.dh * 0.88, tilt: 12, op: 0.95 })}</g>`,
      front: s,
      fx: (gx - 8) / 200,
      fy: 0.46,
    }
  },

  /** Oni : une silhouette massive qui remplit la porte. */
  brute: ({ F, g }) => ({ figs: F({ h: g.dh * 1.01, wide: 1.45, arm: 5, armLen: 4, op: 0.96 }) }),

  /** Yokai : un gramophone ; la silhouette se penche vers la musique. */
  gramophone: () => ({
    front: `<rect x="26" y="150" width="88" height="7" fill="#2c2925"/><rect x="32" y="157" width="5" height="34" fill="#211e1b"/><rect x="103" y="157" width="5" height="34" fill="#211e1b"/>
      <rect x="40" y="126" width="56" height="24" fill="#4c453b" stroke="#1e1b18" stroke-width="1.5"/><path d="M96 137 h8 v7" stroke="#2a2622" stroke-width="2.2" fill="none"/>
      <ellipse cx="64" cy="126" rx="23" ry="4.5" fill="#1a1815"/>
      <path d="M83 124 C82 112 86 106 84 100 Q66 86 33.6 74.3 A30 13 -28.4 0 1 86.4 45.7 Q84 80 91 100 C92 108 89 116 89 124Z" fill="#a3977f"/>
      <ellipse cx="60" cy="60" rx="30" ry="13" transform="rotate(-28.4 60 60)" fill="#1f1c18" stroke="#cbc0a8" stroke-width="2.6"/>`,
    fx: 0.36,
    fy: 0.46,
  }),

  /** Hantu : une buée glacée devant la bouche. */
  breath: ({ uid, F, g }) => ({
    back: `<rect x="${f(g.wx)}" y="36" width="64" height="80" fill="url(#${uid}_fr)"/>`,
    figs: F({ x: g.wx + 34, foot: 214, h: 168, tilt: -8, lean: 0, arm: 1, armLen: 4, op: 0.97 }),
    front: `<g fill="#eef1f3" filter="url(#${uid}_b2)"><ellipse cx="${f(g.wx + 14)}" cy="75" rx="9" ry="6" opacity=".5"/><ellipse cx="${f(g.wx - 4)}" cy="71" rx="16" ry="10" opacity=".55"/><ellipse cx="${f(g.wx - 28)}" cy="64" rx="22" ry="15" opacity=".45"/><ellipse cx="${f(g.wx - 52)}" cy="56" rx="22" ry="17" opacity=".25"/></g>
      <g fill="none" stroke="#f4f6f7" stroke-linecap="round" opacity=".45" filter="url(#${uid}_b)"><path d="M${f(g.wx + 12)} 76 Q${f(g.wx - 6)} 80 ${f(g.wx - 20)} 70 T${f(g.wx - 48)} 60" stroke-width="4"/><path d="M${f(g.wx + 10)} 72 Q${f(g.wx - 10)} 64 ${f(g.wx - 30)} 58" stroke-width="3"/></g>`,
    defs: `<radialGradient id="${uid}_fr" cx=".5" cy=".5" r=".7"><stop offset=".45" stop-color="#f4f7f8" stop-opacity="0"/><stop offset="1" stop-color="#f4f7f8" stop-opacity=".85"/></radialGradient>`,
    fx: 0.5,
    fy: 0.38,
  }),

  /** Goryo : une silhouette en points D.O.T.S, vue dans le viseur d’une caméra vidéo. */
  dots: ({ uid, F, g }) => ({
    defs: `<pattern id="${uid}_d" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.6" fill="#eef6e8"/></pattern>`,
    back: `<rect width="200" height="200" fill="url(#${uid}_d)" opacity=".14"/>`,
    figs: F({ x: g.vx, foot: 152, h: 88, tilt: 6, lean: 0, col: `url(#${uid}_d)`, blur: 'none', op: 1 }),
    top: `<path d="M14 34 V14 H34 M166 14 H186 V34 M186 166 V186 H166 M34 186 H14 V166" fill="none" stroke="#f3f0e8" stroke-width="2.6" opacity=".8"/><circle cx="28" cy="28" r="4" fill="#f3f0e8" opacity=".85"/>`,
    fx: 0.5,
    fy: 0.5,
  }),

  /** Myling : une petite silhouette d’enfant. */
  child: ({ F, g }) => ({ figs: F({ child: true, h: g.dh * 0.5, wide: 0.92, tilt: 12 }), fy: 0.6 }),

  /** Onryo : une bougie allumée (une flamme proche bloque ses chasses). */
  candle: ({ uid }) => ({
    front: `<ellipse cx="76" cy="161" rx="24" ry="5.5" fill="#6b655b"/><rect x="68" y="112" width="16" height="48" fill="#e6dfce"/>
      <ellipse cx="76" cy="112" rx="8" ry="2.5" fill="#f4eee2"/><path d="M69 112 q-1.5 9 1 14 q2.5 -7 2 -14Z" fill="#f4eee2"/>
      <path d="M76 112 v-5" stroke="#1a1816" stroke-width="1.4"/><path d="M76 86 Q83 97 79.5 104 Q76 109 72.5 104 Q69 97 76 86Z" fill="#fffbea"/>`,
    over: glow(uid, 76, 100, 64, 0.85) + glow(uid, 76, 99, 16, 1),
    fx: 0.38,
    fy: 0.52,
  }),

  /** Les Jumeaux : deux silhouettes identiques côte à côte. */
  twins: ({ F, g }) => {
    const foot = g.end + 34
    return { figs: F({ x: g.vx - 17, foot, h: 80, tilt: 8, lean: -1 }) + F({ x: g.vx + 17, foot, h: 80, tilt: -8, lean: 1 }) }
  },

  /** Raiju : un téléviseur qui grésille, l’image parasitée. */
  tv: ({ uid, F, base }) => ({
    figs: F({ x: base.x + 8, op: 0.25, blur: 'b2' }) + F({ op: 0.75 }),
    front: `<rect x="32" y="150" width="80" height="8" fill="#211e1b"/><rect x="40" y="158" width="5" height="30" fill="#1b1916"/><rect x="99" y="158" width="5" height="30" fill="#1b1916"/>
      <path d="M72 88 L54 58 M72 88 L92 56" stroke="#24211d" stroke-width="1.8"/>
      <rect x="34" y="88" width="76" height="62" rx="6" fill="#2b2824" stroke="#141210" stroke-width="2"/>
      <rect x="40" y="95" width="56" height="48" rx="8" fill="#5d625c"/><rect x="40" y="95" width="56" height="48" rx="8" filter="url(#${uid}_tv)"/>
      <path d="M40 108 H96 M40 126 H96" stroke="#f4f6f2" stroke-width="2.4" opacity=".75"/>
      <circle cx="103" cy="105" r="3" fill="#8f877a"/><circle cx="103" cy="117" r="3" fill="#8f877a"/>`,
    defs: `<filter id="${uid}_tv" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4 .45" numOctaves="1" seed="7"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 7 -3.1"/></filter>`,
    over: `${glow(uid, 68, 119, 58, 0.45)}<g fill="#fff"><rect y="46" width="200" height="2.5" opacity=".2"/><rect y="129" width="200" height="1.5" opacity=".3"/><rect y="168" width="200" height="4" opacity=".13"/></g>`,
    fx: 0.34,
    fy: 0.58,
  }),

  /** Obake : une empreinte de main à six doigts, et une double empreinte sur l’interrupteur. */
  handprint: () => ({
    figs: '',
    front: `<g transform="translate(94 104) rotate(-10)" opacity=".85"><path d="M-15 -4 Q-17 18 -6 26 Q6 30 14 22 Q19 10 16 -6 Q0 -12 -15 -4Z" fill="#e2ead6"/>
      <path d="M-14 6 L-28 -9 M-11 -5 L-18 -31 M-4 -8 L-6 -38 M3 -8 L4 -39 M10 -7 L14 -35 M15 -3 L25 -24" stroke="#e2ead6" stroke-width="6.6" stroke-linecap="round" fill="none"/></g>
      <rect x="148" y="98" width="16" height="26" rx="1.5" fill="#6f695e"/><rect x="154" y="106" width="4" height="9" fill="#2a2622"/>
      <g fill="#e2ead6" opacity=".85"><ellipse cx="152" cy="103" rx="2.6" ry="3.4"/><ellipse cx="160.5" cy="119" rx="2.6" ry="3.4"/></g>`,
    fx: 0.48,
    fy: 0.5,
  }),

  /** Le Mimic : une silhouette et son reflet dans un miroir, avec de faux orbes. */
  mirror: ({ uid, F, base, r }) => ({
    defs: `<clipPath id="${uid}_mc"><ellipse cx="70" cy="82" rx="24" ry="39"/></clipPath><linearGradient id="${uid}_mr" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#7a8184"/><stop offset="1" stop-color="#2a2e31"/></linearGradient>`,
    back: `<ellipse cx="70" cy="82" rx="27" ry="42" fill="url(#${uid}_mr)" stroke="#8d8370" stroke-width="6"/>
      <g clip-path="url(#${uid}_mc)">${F({ x: 76, foot: 132, h: 86, op: 0.8, tilt: -(base.tilt ?? 0) })}</g>
      <path d="M57 58 L68 47" stroke="#fff" stroke-width="2" opacity=".35"/>`,
    figs: F({ x: 126 }),
    over: `<g fill="#fff" filter="url(#${uid}_b)">${[0, 1, 2]
      .map((i) => `<circle cx="${f(30 + i * 55 + r() * 30)}" cy="${f(60 + r() * 100)}" r="${f(3 + r() * 1.6)}" opacity=".8"/>`)
      .join('')}</g>`,
    fx: 0.42,
    fy: 0.48,
  }),

  /** Moroi : des cartes de tarot étalées, un objet maudit. */
  tarot: () => {
    let s = `<path d="M0 160 L200 152 L200 200 L0 200Z" fill="#191714"/><path d="M0 160 L200 152" stroke="#4b463e" stroke-width="1.5"/>`
    for (let i = 0; i < 5; i++)
      s += `<g transform="rotate(${-32 + i * 16} 96 222)"><rect x="82" y="148" width="28" height="44" rx="2" fill="#ddd4c1" stroke="#2a2621" stroke-width="1"/><rect x="86" y="152" width="20" height="36" fill="none" stroke="#7a705f" stroke-width="1.3"/>${
        i === 2 ? `<circle cx="96" cy="166" r="5.5" fill="none" stroke="#5e5547" stroke-width="1.4"/><path d="M96 174 v8 M91 178 h10" stroke="#5e5547" stroke-width="1.4"/>` : ''
      }</g>`
    return { front: s, fx: 0.48, fy: 0.74 }
  },

  /** Deogen : une Spirit Box allumée, la silhouette tout près. */
  spiritbox: ({ uid, F, g }) => {
    let grille = ''
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) grille += `<circle cx="${-9 + col * 6}" cy="${4 + row * 6}" r="1.5"/>`
    return {
      figs: F({ x: g.vx - 16, foot: 238, h: 172, arm: 2, armLen: 6, tilt: 6, lean: 0, op: 0.95 }),
      front: `<g transform="translate(150 170) rotate(10)"><path d="M-14 -30 L-27 -80" stroke="#1b1916" stroke-width="3" stroke-linecap="round"/>
        <rect x="-20" y="-30" width="40" height="64" rx="6" fill="#1d1b18" stroke="#5a554c" stroke-width="1.5"/>
        <rect x="-14" y="-24" width="28" height="13" rx="1.5" fill="#eef3e6"/><path d="M-9 -14 v-6 M-5 -14 v-4 M-1 -14 v-7 M3 -14 v-3" stroke="#3b3d36" stroke-width="2"/>
        <g fill="#45413a">${grille}</g></g>`,
      over: glow(uid, 153, 151, 36, 0.95),
      fx: 0.45,
      fy: 0.42,
    }
  },

  /** Thayé : une vieille silhouette voûtée, appuyée sur une canne. */
  elder: ({ F, g }) => ({ figs: F({ x: g.dx + 2, h: g.dh * 0.82, hunch: 28, tilt: 18, arm: 3, armLen: 8, lean: 0, wide: -0.94 }), fy: 0.55 }),

  /** Gallu : une ligne de sel dispersée, une silhouette enragée. */
  saltline: ({ F, g, r }) => ({
    figs: F({ x: g.vx, foot: 148, h: 80, arm: 9, armLen: -26, tilt: -6, lean: 0, op: 0.95 }),
    front: `<path d="M6 183 Q28 172 50 176 Q66 173 82 178 L80 185 Q48 187 6 189Z" fill="#e8e3d6"/>
      <path d="M122 177 Q140 171 160 175 Q178 171 196 175 L196 183 Q160 184 120 184Z" fill="#e8e3d6"/>${grains(r, 101, 181, 46, 14, 26)}${grains(r, 100, 192, 120, 10, 12)}`,
    fy: 0.66,
  }),

  /** Obambo : une horloge (il change d’humeur toutes les 2 minutes), une silhouette à moitié floue. */
  clock: ({ uid, F, g }) => {
    let ticks = ''
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6
      const k = i % 3 ? 15.5 : 13.5
      ticks += `M${f(58 + Math.sin(a) * k)} ${f(62 - Math.cos(a) * k)} L${f(58 + Math.sin(a) * 18)} ${f(62 - Math.cos(a) * 18)} `
    }
    return {
      defs: `<clipPath id="${uid}_cl"><rect width="${f(g.wx + 32)}" height="200"/></clipPath><clipPath id="${uid}_cr"><rect x="${f(g.wx + 32)}" width="200" height="200"/></clipPath>`,
      back: `<circle cx="58" cy="62" r="22" fill="#dad2c1" stroke="#2c2925" stroke-width="3.6"/><path d="${ticks}" stroke="#3a362f" stroke-width="1.6"/>
        <path d="M58 62 L49 57 M58 62 L58 47" stroke="#1e1c19" stroke-width="2.4" stroke-linecap="round"/><circle cx="58" cy="62" r="1.8" fill="#1e1c19"/>`,
      figs: `<g clip-path="url(#${uid}_cl)">${F({ x: g.wx + 32, tilt: -4, lean: 0, arm: 0, armLen: 6 })}</g><g clip-path="url(#${uid}_cr)">${F({
        x: g.wx + 35,
        tilt: 16,
        lean: 2,
        arm: 7,
        armLen: -10,
        blur: 'b2',
      })}</g>`,
      fx: 0.4,
      fy: 0.42,
    }
  },

  /** Dayan : une silhouette de femme qui bouge vite. */
  motion: ({ F }) => {
    const w = { dress: true, hair: true, h: 116, tilt: 8 }
    return { figs: F({ ...w, x: 90, op: 0.2, blur: 'b2' }) + F({ ...w, x: 111, op: 0.36, blur: 'b2' }) + F({ ...w, x: 134 }) }
  },

  /** Aswang : une armoire, cachette officielle, et la silhouette devant ses portes. */
  wardrobe: ({ F }) => {
    let s = `<rect x="26" y="30" width="78" height="8" fill="#2a2621"/><rect x="30" y="38" width="70" height="122" fill="#6a6256" stroke="#1a1815" stroke-width="2"/>`
    s += `<path d="M65 40 V158" stroke="#1a1815" stroke-width="2"/>`
    for (const x0 of [35, 70])
      for (let y = 46; y <= 110; y += 6) s += `<path d="M${x0} ${y} h25" stroke="#2a2621" stroke-width="2.4"/><path d="M${x0} ${y + 2} h25" stroke="#8b8375" stroke-width=".9"/>`
    s += `<g fill="none" stroke="#2a2621" stroke-width="1.6"><rect x="35" y="120" width="25" height="32"/><rect x="70" y="120" width="25" height="32"/></g>`
    s += `<circle cx="61" cy="113" r="1.9" fill="#c2b8a3"/><circle cx="69" cy="113" r="1.9" fill="#c2b8a3"/>`
    return { back: s, figs: F({ x: 84, foot: 164, h: 114, tilt: -8, op: 0.96 }), fx: 0.36, fy: 0.5 }
  },

  /** Kormos : une silhouette aux yeux bandés (elle chasse à l’oreille). */
  blindfold: ({ F }) => ({
    figs: F({ x: 100, foot: 286, h: 220, lean: 0, tilt: 12, arm: 0, armLen: 0, op: 0.97 }),
    front: `<g transform="rotate(12 100 112.2)"><path d="M81 84 Q100 79 119 84 L119 94 Q100 89 81 94Z" fill="#d8cfbb"/>
      <path d="M118 86 q11 4 13 17 l-4.5 1 q-2 -10 -9.5 -13Z" fill="#cbc2ad"/><path d="M118 90 q9 8 7 21 l-4.5 0 q1 -11 -3.5 -17Z" fill="#c2b9a4"/></g>`,
    fx: 0.5,
    fy: 0.42,
  }),

  /** Deildegast : une silhouette filée par la vitesse. */
  speed: ({ uid, F, g }) => {
    const w = { foot: 162, h: 112, tilt: -6, lean: 5, arm: 4, armLen: 2 }
    return {
      figs:
        F({ ...w, x: g.wx + 2, op: 0.4, blur: 'm' }) +
        F({ ...w, x: g.wx + 24, op: 0.6, blur: 'm' }) +
        F({ ...w, x: g.wx + 46, op: 0.8, blur: 'm' }) +
        F({ ...w, x: g.wx + 62, op: 0.94 }),
      front: `<g stroke="#0c0b0a" stroke-linecap="round" filter="url(#${uid}_s)" opacity=".55"><path d="M${f(g.wx - 30)} 74 H${f(g.wx + 50)}" stroke-width="1.6"/><path d="M${f(g.wx - 14)} 92 H${f(g.wx + 44)}" stroke-width="2.4"/><path d="M${f(g.wx - 40)} 108 H${f(g.wx + 48)}" stroke-width="1.4"/><path d="M${f(g.wx - 20)} 126 H${f(g.wx + 52)}" stroke-width="2"/><path d="M${f(g.wx - 8)} 144 H${f(g.wx + 54)}" stroke-width="1.4"/></g>`,
      fx: 0.5,
      fy: 0.5,
    }
  },
}

/** Mise en scène de chaque entité (scène, indice, réglages de la silhouette, description). */
export const PHOTO_PRESETS: Record<string, PhotoOptions> = {
  spirit: { scene: 'room', wx: 112, cue: 'smudge', figure: { op: 0.5, blur: 'b2' }, alt: 'un bâton d’encens qui fume, une silhouette au fond' },
  wraith: { scene: 'door', dx: 104, cue: 'salt', figure: { tilt: 8, lean: 0 }, alt: 'une silhouette qui flotte au-dessus d’un tas de sel intact' },
  phantom: { scene: 'door', dx: 100, cue: 'vanish', figure: { op: 0.32, blur: 'b2', tilt: -8 }, alt: 'une silhouette qui s’efface dans l’éclair du flash' },
  poltergeist: { scene: 'room', wx: 34, cue: 'objects', leak: '#ff9a3c', alt: 'des objets suspendus en l’air dans une pièce vide' },
  banshee: { scene: 'door', dx: 100, cue: 'woman', figure: { tilt: 10, lean: 0 }, alt: 'une silhouette de femme dans l’embrasure d’une porte' },
  jinn: { scene: 'room', wx: 128, cue: 'breaker', figure: { op: 0.8 }, alt: 'un disjoncteur ouvert au mur, une silhouette au fond' },
  mare: { scene: 'room', wx: 120, cue: 'bulb', dark: 0.5, flash: 0.8, figure: { x: 150, col: '#050505' }, alt: 'une ampoule éteinte dans une pièce plongée dans le noir' },
  revenant: { scene: 'corridor', vx: 100, cue: 'lunge', leak: '#ff6a3c', blur: 1.4, alt: 'une silhouette qui fonce sur l’objectif' },
  shade: { scene: 'room', wx: 120, cue: 'shadow', dark: 0.62, flash: 0.45, alt: 'une pièce sombre, presque vide' },
  demon: { scene: 'corridor', vx: 104, cue: 'crucifix', leak: '#ff4a2a', figure: { tilt: 16, arm: 2, armLen: 14 }, alt: 'un crucifix brûlé au sol, une silhouette au bout du couloir' },
  yurei: { scene: 'door', dx: 104, cue: 'ajar', alt: 'une porte entrouverte, une silhouette dans l’entrebâillement' },
  oni: { scene: 'door', dx: 100, cue: 'brute', leak: '#ff6a3c', figure: { tilt: 4, lean: 0 }, alt: 'une silhouette massive qui remplit l’encadrement d’une porte' },
  yokai: { scene: 'room', wx: 122, cue: 'gramophone', figure: { lean: -7, tilt: -14 }, alt: 'un gramophone, une silhouette penchée vers lui' },
  hantu: { scene: 'room', wx: 112, cue: 'breath', dark: 0.3, blur: 1.2, leak: '#ffd27a', alt: 'une silhouette qui souffle une buée glacée' },
  goryo: { scene: 'corridor', vx: 100, cue: 'dots', dark: 0.35, alt: 'une silhouette en points D.O.T.S dans le viseur d’une caméra vidéo' },
  myling: { scene: 'door', dx: 100, cue: 'child', figure: { lean: 0 }, alt: 'une petite silhouette d’enfant dans l’embrasure d’une porte' },
  onryo: { scene: 'room', wx: 130, cue: 'candle', dark: 0.5, flash: 0.6, figure: { op: 0.85 }, alt: 'une bougie allumée, une silhouette dans l’ombre' },
  'the-twins': { scene: 'corridor', vx: 100, cue: 'twins', alt: 'deux silhouettes identiques côte à côte' },
  raiju: { scene: 'room', wx: 130, cue: 'tv', alt: 'un téléviseur qui grésille, l’image parasitée' },
  obake: { scene: 'wall', cue: 'handprint', leak: '#ffd27a', alt: 'une empreinte de main à six doigts sur une porte' },
  'the-mimic': { scene: 'room', wx: 132, cue: 'mirror', alt: 'une silhouette et son reflet dans un miroir, entourés d’orbes' },
  moroi: { scene: 'room', wx: 110, cue: 'tarot', figure: { op: 0.7, blur: 'b2' }, alt: 'des cartes de tarot étalées, une silhouette au fond' },
  deogen: { scene: 'corridor', vx: 100, cue: 'spiritbox', blur: 1.2, alt: 'une Spirit Box allumée, une silhouette tout près' },
  thaye: { scene: 'door', dx: 96, cue: 'elder', alt: 'une silhouette voûtée appuyée sur une canne' },
  gallu: { scene: 'corridor', vx: 100, cue: 'saltline', leak: '#ff4a2a', alt: 'une ligne de sel dispersée, une silhouette aux bras levés' },
  obambo: { scene: 'room', wx: 98, cue: 'clock', alt: 'une horloge murale, une silhouette à moitié floue' },
  dayan: { scene: 'room', wx: 36, cue: 'motion', alt: 'une silhouette de femme en mouvement' },
  aswang: { scene: 'room', wx: 128, cue: 'wardrobe', alt: 'une armoire, une silhouette devant ses portes' },
  kormos: { scene: 'corridor', vx: 100, cue: 'blindfold', dark: 0.15, blur: 0.8, flash: 0.7, alt: 'une silhouette aux yeux bandés' },
  deildegast: { scene: 'room', wx: 62, cue: 'speed', alt: 'une silhouette étirée par la vitesse' },
}

/** Code SVG d’une photo ; uid doit être unique dans la page (identifiants de filtres). */
export function photoSVG(key: string, uid: string, o: PhotoOptions = PHOTO_PRESETS[key] ?? {}, label?: string): string {
  const r = roughRng(key)
  const scene = o.scene || (['door', 'corridor', 'room'] as const)[Math.floor(r() * 3)]
  const leak = o.leak || ['#ff9a3c', '#ff6a3c', '#ffd27a'][Math.floor(r() * 3)]
  const sc = SCENES[scene](o, r, uid)
  const base: Figure = { ...sc.spot, lean: (r() - 0.5) * 6, tilt: (r() - 0.5) * 18, arm: r() * 3, armLen: r() * 10, ...o.figure }
  const ctx: Ctx = { uid, r, g: sc.g, base, F: (p = {}) => figure({ ...base, ...p }, uid) }
  const L: Layers = (o.cue && CUES[o.cue]?.(ctx)) || {}
  let figs = L.figs
  if (figs === undefined) {
    figs = figure(base, uid)
    if (o.double) figs = figure({ ...base, x: base.x + 9, h: base.h * 1.02, op: 0.28, blur: 'b2' }, uid) + figs
  }
  const fx = L.fx ?? sc.fx
  const fy = L.fy ?? sc.fy
  const flash = o.flash ?? 1
  const text = esc(label ?? (o.alt ? `Photographie floue : ${o.alt}` : 'Photographie floue d’une silhouette'))

  const specks = Array.from(
    { length: 7 },
    () => `<circle cx="${f(r() * 200)}" cy="${f(r() * 200)}" r="${f(0.4 + r() * 1.1)}" fill="#fff" opacity="${f(0.25 + r() * 0.5)}"/>`,
  ).join('')
  const scratch = `<path d="M${f(r() * 200)} 0 q ${f((r() - 0.5) * 30)} 100 ${f((r() - 0.5) * 20)} 200" stroke="#fff" stroke-width=".5" opacity=".18" fill="none"/>`

  return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${text}">
    <defs>
      <filter id="${uid}_b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${o.blur || 2.1}"/></filter>
      <filter id="${uid}_b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="${uid}_m" x="-60%" y="-20%" width="220%" height="140%"><feGaussianBlur stdDeviation="9 .8"/></filter>
      <filter id="${uid}_g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="${Math.floor(r() * 90)}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
      <filter id="${uid}_s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".7"/></filter>
      <linearGradient id="${uid}_in" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9a907e"/><stop offset=".7" stop-color="#6f675a"/><stop offset="1" stop-color="#4a453d"/></linearGradient>
      <linearGradient id="${uid}_wl" x1="0" x2="1"><stop offset="0" stop-color="#6c665b"/><stop offset="1" stop-color="#25231f"/></linearGradient>
      <linearGradient id="${uid}_wr" x1="1" x2="0"><stop offset="0" stop-color="#5f5a50"/><stop offset="1" stop-color="#23211e"/></linearGradient>
      <linearGradient id="${uid}_mw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9fb0bb"/><stop offset="1" stop-color="#5e6a72"/></linearGradient>
      <linearGradient id="${uid}_fg" gradientUnits="userSpaceOnUse" x1="0" y1="-60" x2="0" y2="-4"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
      <mask id="${uid}_fm" maskUnits="userSpaceOnUse" x="-80" y="-130" width="160" height="140"><rect x="-80" y="-130" width="160" height="140" fill="url(#${uid}_fg)"/></mask>
      <radialGradient id="${uid}_gw"><stop offset="0" stop-color="#fffaf0"/><stop offset=".35" stop-color="#fff2d6" stop-opacity=".45"/><stop offset="1" stop-color="#fff2d6" stop-opacity="0"/></radialGradient>
      <radialGradient id="${uid}_f" cx="${f(fx)}" cy="${f(fy)}" r=".75"><stop offset="0" stop-color="#fff4dc" stop-opacity="${f(0.42 * flash)}"/><stop offset=".5" stop-color="#fff0d0" stop-opacity="${f(0.08 * flash)}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="${uid}_v" cx=".5" cy=".5" r=".74"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".88"/></radialGradient>
      <linearGradient id="${uid}_l" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="${leak}" stop-opacity=".5"/><stop offset=".3" stop-color="${leak}" stop-opacity="0"/></linearGradient>
      ${L.defs ?? ''}
    </defs>
    <g filter="url(#${uid}_s)">${sc.body}${L.back ?? ''}${figs}${o.dark ? `<rect width="200" height="200" fill="#000" opacity="${o.dark}"/>` : ''}${L.front ?? ''}</g>
    <rect width="200" height="200" fill="url(#${uid}_f)" style="mix-blend-mode:screen"/>
    ${L.over ?? ''}
    <rect width="200" height="200" fill="url(#${uid}_v)"/>
    <rect width="200" height="200" fill="url(#${uid}_l)" style="mix-blend-mode:screen"/>
    <rect width="200" height="200" filter="url(#${uid}_g)" opacity=".42" style="mix-blend-mode:overlay"/>
    ${L.top ?? ''}${specks}${scratch}
  </svg>`
}
