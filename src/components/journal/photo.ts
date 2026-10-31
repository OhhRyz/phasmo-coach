/**
 * Photographies procédurales des entités, en noir et blanc granuleux (flash, vignettage, fuite de
 * lumière, grain). Chaque entité a son cadrage (porte, couloir, escalier, gros plan, plongée, contre-
 * plongée, vue depuis une cachette…) et un indice visuel tiré de sa fiche : trois bougies pour l’Onryo,
 * le disjoncteur pour le Djinn, une main à six doigts pour l’Obake… Entièrement générées (aucune image
 * du jeu), sans texte ni gore.
 */
import { roughRng } from './rough'

const f = (n: number) => Math.round(n * 10) / 10
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const rad = (deg: number) => (deg * Math.PI) / 180

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
  scene?: 'door' | 'corridor' | 'room' | 'wall' | 'plain' | 'hall' | 'stairs' | 'ceiling' | 'table'
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
  /** teinte du mur (scènes plain et hall) */
  tone?: string
  /** ligne du sol ou du plateau (scènes plain et hall) */
  floor?: number
  /** appareil posé au ras du sol (scène hall) */
  low?: boolean
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

/** Mur nu, cadré serré : l’indice y est posé en gros plan (sol ou plateau à la hauteur `floor`). */
function plain(o: PhotoOptions): Scene {
  const floor = o.floor ?? 200
  let body = `<rect width="200" height="200" fill="${o.tone ?? '#3a3732'}"/>`
  if (floor < 200) body += `<rect y="${floor}" width="200" height="${200 - floor}" fill="#1f1d1a"/><rect y="${floor - 4}" width="200" height="4" fill="#25221e"/>`
  return { body, fx: 0.5, fy: 0.45, spot: { x: 140, foot: Math.min(floor + 2, 200), h: 120 }, g: { floor } }
}

/** Grande pièce vue en profondeur : parquet qui fuit vers le mur du fond (au ras du sol si `low`). */
function hall(o: PhotoOptions, _r: () => number, uid: string): Scene {
  const hz = o.floor ?? 96
  const vx = o.vx ?? 100
  const vy = o.low ? hz - 8 : hz - 66
  let body = `<linearGradient id="${uid}_hf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1d1b18"/><stop offset="1" stop-color="#3b362f"/></linearGradient>`
  body += `<rect width="200" height="${hz}" fill="${o.tone ?? '#403c35'}"/><rect y="${hz - 7}" width="200" height="7" fill="#24211d"/>`
  body += `<rect y="${hz}" width="200" height="${200 - hz}" fill="url(#${uid}_hf)"/>`
  const k = (hz - vy) / (200 - vy)
  let d = ''
  for (let i = -9; i <= 9; i++) d += `M${f(vx + i * 26 * k)} ${hz} L${f(vx + i * 26)} 200 `
  body += `<path d="${d}" stroke="#121110" stroke-width="1.3" opacity=".85"/>`
  return { body, fx: 0.5, fy: 0.55, spot: { x: 140, foot: 186, h: 150 }, g: { hz, vx, vy } }
}

/** Escalier vu d’en bas : les marches se resserrent vers un palier éclairé. */
function stairs(_o: PhotoOptions, _r: () => number, uid: string): Scene {
  const ys = [200, 179, 161, 145, 131, 119, 109, 100, 93, 87, 82]
  const top = 82
  const hw = (y: number) => 34 + ((y - top) * 72) / (200 - top)
  let body = `<rect width="200" height="200" fill="#1c1a17"/>`
  body += `<rect x="60" y="0" width="80" height="${top}" fill="#3a3631"/>`
  body += `<rect x="80" y="10" width="40" height="${top - 10}" fill="#b4aa95"/><rect x="80" y="10" width="40" height="${top - 10}" fill="url(#${uid}_in)" opacity=".45"/>`
  body += `<polygon points="0,0 66,0 66,${top} -6,200 0,200" fill="url(#${uid}_wl)"/>`
  body += `<polygon points="134,0 200,0 200,200 206,200 134,${top}" fill="url(#${uid}_wr)"/>`
  for (let i = 0; i < ys.length - 1; i++) {
    const [a, b] = [ys[i], ys[i + 1]]
    body += `<polygon points="${f(100 - hw(a))},${a} ${f(100 + hw(a))},${a} ${f(100 + hw(b))},${b} ${f(100 - hw(b))},${b}" fill="${i % 2 ? '#3d3933' : '#36322d'}"/>`
    body += `<path d="M${f(100 - hw(b))} ${b} H${f(100 + hw(b))}" stroke="#958c7b" stroke-width="${f(0.8 + (b - top) / 40)}"/>`
  }
  // rampe : main courante, balustres et poteau
  let bal = ''
  for (const x of [190, 177, 166, 157, 150, 144, 139]) {
    const yr = 112 - ((200 - x) * 56) / 62
    const ye = 200 - ((206 - x) * 118) / 72
    bal += `M${x} ${f(yr)} V${f(ye)} `
  }
  body += `<path d="${bal}" stroke="#1a1815" stroke-width="2.6"/><path d="M204 110 L136 54" stroke="#2c2924" stroke-width="5" stroke-linecap="round"/>`
  body += `<rect x="182" y="100" width="18" height="100" fill="#26231f"/><rect x="179" y="94" width="24" height="9" fill="#3a3631"/>`
  return { body, fx: 0.5, fy: 0.3, spot: { x: 100, foot: top + 1, h: 64 }, g: { top } }
}

/** Contre-plongée vers un plafond lambrissé (une suspension au centre). */
function ceiling(): Scene {
  const cy = 128
  let body = `<rect width="200" height="200" fill="#2a2723"/>`
  let d = ''
  for (let i = -6; i <= 6; i++) d += `M${f(100 + (i * 40 * 90) / (cy + 90))} 0 L${100 + i * 40} ${cy} `
  body += `<path d="${d}" stroke="#151311" stroke-width="2.2"/>`
  body += `<rect y="${cy}" width="200" height="9" fill="#58524a"/><rect y="${cy + 9}" width="200" height="${191 - cy}" fill="#302d29"/>`
  body += `<rect x="16" y="166" width="64" height="40" fill="#5f594f"/><rect x="23" y="172" width="50" height="34" fill="#0d0c0b"/>`
  body += `<rect x="150" y="152" width="13" height="19" rx="1" fill="#6d675d"/><rect x="154.5" y="162" width="4" height="6" fill="#1d1b18"/>`
  return { body, fx: 0.5, fy: 0.5, spot: { x: 48, foot: 204, h: 40 }, g: { cy } }
}

/** Plongée sur une table en bois (vue de dessus). */
function table(): Scene {
  let body = `<rect width="200" height="200" fill="#544a3d"/>`
  let d = ''
  let grain = ''
  for (let i = 0; i < 6; i++) {
    d += `M${-14 + i * 44} -10 L${14 + i * 44} 210 `
    grain += `M${4 + i * 44} -10 Q${12 + i * 44} 60 ${20 + i * 44} 120 T${34 + i * 44} 210 `
  }
  body += `<path d="${grain}" stroke="#665a4a" stroke-width="1" fill="none"/><path d="${d}" stroke="#221e19" stroke-width="2.6"/>`
  return { body, fx: 0.5, fy: 0.5, spot: { x: 100, foot: 160, h: 100 }, g: {} }
}

const SCENES: Record<NonNullable<PhotoOptions['scene']>, (o: PhotoOptions, r: () => number, uid: string) => Scene> = {
  door,
  corridor,
  room,
  wall,
  plain,
  hall,
  stairs,
  ceiling,
  table,
}

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

/** Filet de fumée qui monte en ondulant depuis (x, y). */
const smoke = (uid: string, x: number, y: number, sway: number, h: number) => {
  const d = `M${x} ${y} C${x - sway} ${y - h * 0.3} ${x + sway} ${y - h * 0.5} ${x + sway * 0.3} ${y - h * 0.7} S${x - sway * 1.2} ${y - h * 0.9} ${x - sway * 0.4} ${y - h}`
  return `<path d="${d}" fill="none" stroke="#ece6d8" stroke-width="5" stroke-linecap="round" opacity=".3" filter="url(#${uid}_b)"/><path d="${d}" fill="none" stroke="#f4efe4" stroke-width="1.5" stroke-linecap="round" opacity=".6"/>`
}

/** Une bougie (x, socle, hauteur), allumée ou soufflée. */
const candle = (x: number, base: number, h: number, w: number, lit: boolean) => {
  const t = base - h
  let s = `<ellipse cx="${x}" cy="${base + 1}" rx="${f(w * 1.2)}" ry="${f(w * 0.3)}" fill="#59534a"/><rect x="${f(x - w / 2)}" y="${t}" width="${w}" height="${h}" fill="#e3dccb"/>`
  s += `<rect x="${f(x + w / 2 - 3)}" y="${t}" width="3" height="${h}" fill="#b9b1a0"/><ellipse cx="${x}" cy="${t}" rx="${f(w / 2)}" ry="1.8" fill="#f2ecdf"/>`
  s += `<path d="M${f(x - w / 2 + 1)} ${t} q-1.5 ${f(h * 0.2)} 1 ${f(h * 0.3)} q2 -${f(h * 0.15)} 1.6 -${f(h * 0.3)}Z" fill="#f2ecdf"/>`
  s += `<path d="M${x} ${t} v-4" stroke="#1a1816" stroke-width="1.3"/>`
  if (lit) s += `<path d="M${x} ${t - 24} Q${x + 7} ${t - 13} ${x + 3.5} ${t - 6} Q${x} ${t - 1.5} ${x - 3.5} ${t - 6} Q${x - 7} ${t - 13} ${x} ${t - 24}Z" fill="#fffbea"/>`
  return s
}

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
  woman: ({ uid, F, g }) => ({
    figs: F({ dress: true, hair: true, h: g.dh * 0.92 }),
    front: `<g transform="translate(46 170) rotate(-24)"><path d="M0 8 L-6 46" stroke="#141210" stroke-width="7" stroke-linecap="round"/><path d="M-4 22 l-12 3" stroke="#141210" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="0" cy="0" rx="40" ry="17" fill="#2b2824" stroke="#8f8676" stroke-width="3"/><ellipse cx="0" cy="-2" rx="31" ry="11" fill="#1a1815"/>
      <path d="M0 -2 V-26" stroke="#9a907e" stroke-width="2.6"/><circle cx="0" cy="-28" r="3.6" fill="#c9bfa9"/></g>`,
    over: `<path d="M68 132 Q78 122 74 108 M78 138 Q92 122 86 102" stroke="#fff" stroke-width="1.4" fill="none" opacity=".25" filter="url(#${uid}_s)"/>`,
  }),

  /** Djinn : gros plan sur le disjoncteur, un EMF 5 tendu vers lui. */
  breaker: ({ uid }) => {
    let s = `<rect x="44" y="42" width="100" height="134" rx="3" fill="#000" opacity=".5" filter="url(#${uid}_b)"/>`
    s += `<rect x="76" y="0" width="13" height="32" fill="#6f6a60"/><rect x="78" y="0" width="3" height="32" fill="#a39b8b"/>`
    s += `<rect x="34" y="30" width="100" height="134" rx="3" fill="#8b867b" stroke="#1d1b18" stroke-width="2.5"/>`
    s += `<rect x="41" y="38" width="86" height="118" fill="#24211d"/>`
    s += `<rect x="62" y="43" width="44" height="22" fill="#d8d1c3"/><rect x="80" y="41" width="8" height="13" fill="#151311"/>`
    s += `<rect x="83" y="70" width="2" height="82" fill="#100f0d"/>`
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 2; col++) {
        const x = 46 + col * 41
        const y = 72 + row * 13
        s += `<rect x="${x}" y="${y}" width="32" height="8" fill="#d0c9bb"/><rect x="${x + ((row * 2 + col) % 5 ? 22 : 2)}" y="${y}" width="8" height="8" fill="#191714"/>`
      }
    s += `<polygon points="34,30 9,41 9,155 34,164" fill="#6c675e" stroke="#1d1b18" stroke-width="1.5"/><polygon points="30,40 14,47 14,149 30,155" fill="none" stroke="#45413a" stroke-width="1.5"/>`
    s += `<polygon points="28,54 17,59 17,76 28,72" fill="#d6cfbf" opacity=".85"/><rect x="128" y="88" width="4" height="16" fill="#3e3a33"/>`
    let leds = ''
    for (let i = 0; i < 5; i++) leds += `<circle cx="${-12 + i * 6}" cy="-35" r="2.5" fill="#fff8e4"/>`
    return {
      back: s,
      figs: '',
      front: `<g transform="translate(160 178) rotate(-16)"><rect x="-18" y="-44" width="36" height="82" rx="6" fill="#1b1916" stroke="#57524a" stroke-width="1.5"/>
        <rect x="-15" y="-41" width="30" height="12" rx="2" fill="#2b2824"/>${leds}<rect x="-11" y="-20" width="22" height="12" rx="1.5" fill="#3a3731"/>
        <circle cx="0" cy="8" r="5" fill="#2e2b27" stroke="#4a463f"/></g>`,
      over: glow(uid, 149, 143, 24, 0.95),
      fx: 0.42,
      fy: 0.44,
    }
  },

  /** Cauchemar : contre-plongée sur une ampoule éclatée, la pièce dans le noir. */
  bulb: () => {
    let shards = ''
    for (const [x, y, a, k] of [
      [84, 150, 20, 1],
      [112, 166, -30, 0.7],
      [124, 148, 60, 0.5],
      [96, 188, 10, 1.3],
      [140, 182, -50, 0.8],
      [64, 176, 80, 0.6],
      [104, 140, 35, 0.4],
    ])
      shards += `<path d="M0 -5 L2.4 -1 L3.6 4 L-1 2.6 L-3 3.2Z" transform="translate(${x} ${y}) rotate(${a}) scale(${k})"/>`
    return {
      figs: '',
      front: `<ellipse cx="100" cy="18" rx="15" ry="5" fill="#5d584f"/><path d="M100 18 V66" stroke="#0e0d0b" stroke-width="2.4"/>
        <rect x="91" y="64" width="18" height="20" fill="#2a2723"/><path d="M91 70 H109 M91 76 H109" stroke="#4a463f" stroke-width="1.2"/>
        <path d="M93 84 L107 84 L109 90 A27 27 0 1 1 91 90Z" fill="#7d796f" opacity=".55"/>
        <path d="M93 84 L107 84 L109 90 Q127 98 126.6 116 L119 124 L113 116 L107 127 L101 118 L95 126 L88 117 L82 124 L74 117 Q72 98 91 90Z" fill="#a5a094"/>
        <path d="M97 86 L95 116 M103 86 L105 116" stroke="#36342f" stroke-width="1.4"/><path d="M95 116 l2 -4 l2 4 l2 -4 l2 4 l2 -4" stroke="#36342f" stroke-width="1.2" fill="none"/>
        <path d="M80 110 Q78 96 90 92" stroke="#f6f2ea" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
        <g fill="#d3ccbd">${shards}</g>`,
      fx: 0.5,
      fy: 0.48,
    }
  },

  /** Revenant : il dévale l’escalier vers l’objectif, filé par la vitesse. */
  rush: ({ F, g, r }) => {
    // traits de vitesse rayonnants, sauf vers le bas (les marches restent lisibles)
    let d = ''
    for (let i = 0; i < 16; i++) {
      const a = rad(-205 + (i / 15) * 230 + r() * 6)
      const [r0, r1] = [56 + r() * 16, 120 + r() * 50]
      d += `M${f(100 + Math.cos(a) * r0)} ${f(70 + Math.sin(a) * r0)} L${f(100 + Math.cos(a) * r1)} ${f(70 + Math.sin(a) * r1)} `
    }
    const w = { x: 100, lean: 0, tilt: 0, arm: 8, armLen: -24 }
    return {
      figs:
        F({ ...w, foot: g.top + 1, h: 62, op: 0.28, blur: 'b2' }) + F({ ...w, foot: 124, h: 90, op: 0.42, blur: 'b2' }) + F({ ...w, foot: 168, h: 128, op: 0.96 }),
      front: `<path d="${d}" stroke="#f1ebdd" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>`,
      fx: 0.5,
      fy: 0.3,
    }
  },

  /** Ombre : une ombre de silhouette sur le mur, à moitié cachée derrière l’encadrement d’une porte. */
  shadow: ({ uid, F }) => ({
    defs: `<clipPath id="${uid}_sh"><rect x="38" width="162" height="200"/></clipPath>`,
    back: `${glow(uid, 150, 92, 130, 0.6)}<rect width="30" height="200" fill="#0f0e0c"/><rect x="30" width="9" height="200" fill="#6a645a"/><rect x="38" width="2" height="200" fill="#26231f"/>`,
    figs: `<g clip-path="url(#${uid}_sh)">${F({ x: 74, foot: 214, h: 168, wide: 1.12, tilt: -16, lean: -4, arm: 1, armLen: 4, op: 0.66, blur: 'b', col: '#0d0b09' })}</g>`,
    front: `<rect x="150" y="150" width="56" height="50" fill="#1d1b18"/><rect x="146" y="146" width="60" height="6" fill="#3a3631"/>
      <path d="M176 146 V128 M170 128 H182" stroke="#2a2723" stroke-width="4"/><path d="M160 128 L192 128 L200 92 L168 92Z" fill="#e6dcc4"/>`,
    over: glow(uid, 182, 112, 40, 0.8),
    fx: 0.62,
    fy: 0.45,
  }),

  /** Démon : un crucifix tombé au sol, brûlé. */
  crucifix: ({ uid }) => ({
    front: `<ellipse cx="100" cy="176" rx="50" ry="14" fill="#000" opacity=".6" filter="url(#${uid}_b2)"/>
      <g transform="translate(100 174) rotate(-14) scale(1 .5)" fill="#cfc4ab" stroke="#2b2622" stroke-width="2.4"><rect x="-6" y="-48" width="12" height="96"/><rect x="-28" y="-28" width="56" height="12"/></g>`,
    fy: 0.72,
  }),

  /** Yurei : une porte qui vient de claquer ; la lumière de la pièce ne passe plus que par la fente. */
  slam: ({ uid }) => {
    const [L, R, T, B] = [44, 130, 24, 178]
    const edge = R - 7
    // bord libre et poignée laissent des traînées : la porte se refermait encore
    const ghosts = [96, 106, 115].map((x, i) => `<path d="M${x} ${T - 4 + i * 2} V${B + 4 - i * 2}" stroke="#d8d0bf" stroke-width="${3 - i * 0.6}" opacity="${f(0.16 + i * 0.08)}"/>`).join('')
    return {
      back: `<rect x="${L - 9}" y="${T - 9}" width="${R - L + 18}" height="${B - T + 9}" fill="#4f4a42"/><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" fill="#e6dfcf"/>`,
      figs: '',
      front: `<polygon points="${L},${T} ${edge},${T - 5} ${edge},${B + 5} ${L},${B}" fill="#38332c" stroke="#1b1916" stroke-width="1.5"/>
        <g fill="none" stroke="#2a2621" stroke-width="2.4"><polygon points="${L + 12},${T + 12} ${edge - 12},${T + 8} ${edge - 12},${T + 70} ${L + 12},${T + 70}"/><polygon points="${L + 12},${T + 82} ${edge - 12},${T + 82} ${edge - 12},${B - 9} ${L + 12},${B - 12}"/></g>
        <g filter="url(#${uid}_b)">${ghosts}<path d="M74 106 Q96 100 ${edge - 8} 104" stroke="#f1eadb" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/></g>
        <circle cx="${edge - 8}" cy="104" r="3.2" fill="#d9d0bd"/>
        <path d="M${edge} ${B} L${R + 1} ${B} L200 190 L200 200 L150 200Z" fill="#efe8d8" opacity=".6" filter="url(#${uid}_b)"/>
        <rect x="${L}" y="${B - 2}" width="${R - L}" height="3" fill="#f4eee0" opacity=".7"/>`,
      over: `<rect x="${edge}" y="${T}" width="${R - edge}" height="${B - T}" fill="#fffaf0" opacity=".6" style="mix-blend-mode:screen"/>${glow(uid, edge + 3, 100, 40, 0.5)}`,
      fx: 0.4,
      fy: 0.45,
    }
  },

  /** Oni : en contre-plongée, une silhouette massive à contre-jour qui remplit l’encadrement d’une porte. */
  brute: ({ uid, F }) => ({
    back: `<polygon points="22,200 178,200 150,0 50,0" fill="#655e53"/><polygon points="38,200 162,200 138,0 62,0" fill="#c2b8a2"/>
      <polygon points="38,200 162,200 152,150 48,150" fill="#8f8572"/>${glow(uid, 100, 30, 90, 0.6)}`,
    figs: F({ x: 100, foot: 236, h: 222, wide: 1.55, arm: 6, armLen: 6, tilt: 4, lean: 0, op: 0.98, col: '#060505' }),
    front: `<polygon points="0,200 22,200 50,0 0,0" fill="#262320"/><polygon points="200,200 178,200 150,0 200,0" fill="#262320"/>`,
    fx: 0.5,
    fy: 0.3,
  }),

  /** Yokai : gros plan sur un gramophone ; une tête floue se penche vers la musique. */
  gramophone: ({ uid, F }) => ({
    defs: `<pattern id="${uid}_wp" width="16" height="200" patternUnits="userSpaceOnUse"><rect width="8" height="200" fill="#4a453d"/></pattern>`,
    back: `<rect width="200" height="150" fill="url(#${uid}_wp)" opacity=".7"/>`,
    figs: F({ x: 172, foot: 236, h: 176, tilt: -22, lean: -12, arm: 0, armLen: 6, op: 0.6, blur: 'b2' }),
    front: `<rect y="146" width="200" height="54" fill="#25221e"/><rect y="146" width="200" height="3" fill="#5a544a"/>
      <rect x="22" y="116" width="92" height="34" fill="#5a5044" stroke="#1b1815" stroke-width="1.5"/><rect x="28" y="122" width="80" height="22" fill="none" stroke="#3a332b" stroke-width="1.5"/>
      <path d="M22 132 h-8 v10 h-5" stroke="#2a2622" stroke-width="2.4" fill="none"/>
      <ellipse cx="66" cy="116" rx="40" ry="7" fill="#14120f"/><ellipse cx="66" cy="116" rx="31" ry="5.4" fill="none" stroke="#3a3631" stroke-width="1"/><ellipse cx="66" cy="116" rx="8" ry="1.6" fill="#b9ae98"/>
      <path d="M108 116 C107 108 110 102 108 96 Q90 84 32 75 A50 34 -24 0 1 124 34 Q112 74 115 96 C116 104 113 110 113 116Z" fill="#b3a68a"/>
      <path d="M111 112 C112 100 106 90 116 60" stroke="#e9e1cd" stroke-width="2.4" fill="none" opacity=".7"/>
      <ellipse cx="78" cy="54.5" rx="50" ry="34" transform="rotate(-24 78 54.5)" fill="#1d1a16" stroke="#dcd1b8" stroke-width="3"/>
      <ellipse cx="95" cy="70" rx="13" ry="8" transform="rotate(-24 95 70)" fill="#0c0b0a"/>
      <path d="M104 114 L82 110" stroke="#9a8f78" stroke-width="3" stroke-linecap="round"/><circle cx="80" cy="110" r="4.5" fill="#cfc4ab"/>`,
    over: glow(uid, 196, 40, 80, 0.5),
    fx: 0.4,
    fy: 0.34,
  }),

  /** Hantu : un profil qui souffle une buée glacée, du givre sur l’objectif. */
  breath: ({ uid }) => ({
    // givre : un voile blanc irrégulier qui gagne les bords de l’objectif
    defs: `<radialGradient id="${uid}_fr" cx=".5" cy=".5" r=".72"><stop offset=".5" stop-color="#f4f7f8" stop-opacity="0"/><stop offset="1" stop-color="#f4f7f8" stop-opacity=".5"/></radialGradient>
      <radialGradient id="${uid}_fk" cx=".5" cy=".5" r=".72"><stop offset=".6" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient>
      <mask id="${uid}_fq"><rect width="200" height="200" fill="url(#${uid}_fk)"/></mask>
      <filter id="${uid}_ic" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="4" seed="11"/><feColorMatrix values="0 0 0 0 .96 0 0 0 0 .97 0 0 0 0 .98 0 0 0 4.2 -1.7"/></filter>`,
    back: `<rect x="16" y="10" width="60" height="150" fill="#35322d"/><rect x="22" y="16" width="48" height="144" fill="#2a2724"/>`,
    figs: `<path d="M150 56 C136 52 120 58 117 72 C116 77 114 80 113 83 L107 93 Q106 96 112 97 L111 102 Q113 103 111 106 Q110 110 114 113 Q118 118 128 119 L130 134 Q118 140 106 150 Q94 164 90 200 L210 200 L210 150 Q186 138 164 134 Q160 124 164 112 C170 94 166 62 150 56Z" fill="#0b0a09" filter="url(#${uid}_b)"/>`,
    front: `<g fill="#eef1f3" filter="url(#${uid}_b2)"><ellipse cx="96" cy="103" rx="11" ry="7" opacity=".6"/><ellipse cx="76" cy="100" rx="19" ry="12" opacity=".55"/><ellipse cx="50" cy="94" rx="27" ry="18" opacity=".45"/><ellipse cx="22" cy="86" rx="28" ry="22" opacity=".3"/></g>
      <g fill="none" stroke="#f4f6f7" stroke-linecap="round" opacity=".5" filter="url(#${uid}_b)"><path d="M104 104 Q86 110 70 100 T34 88" stroke-width="4"/><path d="M102 100 Q84 92 60 88" stroke-width="3"/></g>`,
    top: `<rect width="200" height="200" fill="url(#${uid}_fr)"/><rect width="200" height="200" filter="url(#${uid}_ic)" mask="url(#${uid}_fq)" opacity=".75"/>`,
    fx: 0.5,
    fy: 0.45,
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

  /** Myling : au ras du sol, un ours en peluche et une petite silhouette d’enfant au fond. */
  child: ({ uid, F, g }) => ({
    back: `<rect x="18" y="${g.hz - 34}" width="70" height="28" fill="#2a2723"/><rect x="14" y="${g.hz - 52}" width="8" height="46" fill="#24211d"/><rect x="22" y="${g.hz - 38}" width="62" height="6" fill="#8a8272"/>
      <rect x="168" y="${g.hz - 22}" width="9" height="12" rx="2" fill="#e8e0cc"/>${glow(uid, 172, g.hz - 16, 30, 0.7)}`,
    figs: F({ child: true, x: 140, foot: g.hz + 3, h: 58, wide: 0.92, tilt: 12, lean: 0, op: 0.95 }),
    front: `<g fill="#6a6255" filter="url(#${uid}_b)"><ellipse cx="54" cy="174" rx="31" ry="28"/><circle cx="54" cy="130" r="22"/><circle cx="36" cy="112" r="8.5"/><circle cx="72" cy="112" r="8.5"/>
        <ellipse cx="24" cy="168" rx="9" ry="16" transform="rotate(24 24 168)"/><ellipse cx="85" cy="168" rx="9" ry="16" transform="rotate(-24 85 168)"/><ellipse cx="34" cy="198" rx="14" ry="10"/><ellipse cx="76" cy="198" rx="14" ry="10"/></g>
      <g filter="url(#${uid}_b)"><circle cx="36" cy="112" r="4" fill="#3d3830"/><circle cx="72" cy="112" r="4" fill="#3d3830"/><ellipse cx="54" cy="138" rx="10" ry="7.5" fill="#a59c89"/><ellipse cx="54" cy="134" rx="3.4" ry="2.4" fill="#1c1a17"/>
        <circle cx="46" cy="125" r="2.3" fill="#141210"/><circle cx="62" cy="125" r="2.3" fill="#141210"/><ellipse cx="54" cy="176" rx="15" ry="13" fill="#857c6c"/></g>`,
    fx: 0.34,
    fy: 0.7,
  }),

  /** Onryo : trois bougies, deux soufflées qui fument (chaque 3e flamme soufflée : tentative de chasse). */
  candle: ({ uid, F }) => ({
    back: glow(uid, 100, 92, 100, 0.5),
    figs: F({ x: 128, foot: 196, h: 150, op: 0.75, blur: 'b2', tilt: -10, arm: 0, armLen: 8 }),
    front: `<rect y="150" width="200" height="50" fill="#3a342c"/><rect y="150" width="200" height="3" fill="#6b6253"/>
      ${candle(56, 170, 34, 14, false)}${candle(100, 162, 54, 16, true)}${candle(146, 172, 26, 13, false)}
      ${smoke(uid, 56, 132, 10, 96)}${smoke(uid, 146, 142, -12, 110)}`,
    over: glow(uid, 100, 96, 70, 0.75) + glow(uid, 100, 95, 18, 1),
    fx: 0.5,
    fy: 0.5,
  }),

  /** Les Jumeaux : deux silhouettes identiques côte à côte. */
  twins: ({ F, g }) => {
    const foot = g.end + 34
    return { figs: F({ x: g.vx - 17, foot, h: 80, tilt: 8, lean: -1 }) + F({ x: g.vx + 17, foot, h: 80, tilt: -8, lean: 1 }) }
  },

  /** Raiju : un téléviseur qui grésille éclaire seul la pièce ; une silhouette se tient devant. */
  tv: ({ uid, F, g }) => ({
    back: `<rect x="96" y="${g.hz + 18}" width="96" height="20" fill="#191714"/><rect x="100" y="${g.hz + 38}" width="6" height="22" fill="#141210"/><rect x="182" y="${g.hz + 38}" width="6" height="22" fill="#141210"/>
      <path d="M144 ${g.hz - 50} L120 ${g.hz - 92} M144 ${g.hz - 50} L170 ${g.hz - 90}" stroke="#2b2824" stroke-width="2"/>
      <rect x="104" y="${g.hz - 50}" width="80" height="68" rx="6" fill="#2b2824" stroke="#121110" stroke-width="2"/>
      <rect x="110" y="${g.hz - 44}" width="56" height="54" rx="9" fill="#6c716a"/><rect x="110" y="${g.hz - 44}" width="56" height="54" rx="9" filter="url(#${uid}_tv)"/>
      <path d="M110 ${g.hz - 30} H166 M110 ${g.hz - 8} H166" stroke="#f4f6f2" stroke-width="2.6" opacity=".75"/>
      <circle cx="175" cy="${g.hz - 32}" r="3" fill="#8f877a"/><circle cx="175" cy="${g.hz - 20}" r="3" fill="#8f877a"/>
      <path d="M110 ${g.hz + 38} L166 ${g.hz + 38} L210 200 L60 200Z" fill="#d6d3c6" opacity=".14" filter="url(#${uid}_b2)"/>`,
    figs:
      F({ x: 80, foot: 206, h: 158, op: 0.35, col: '#d9ddd5', blur: 'b2', arm: 1, armLen: 6, tilt: 4, lean: 0 }) +
      F({ x: 78, foot: 206, h: 156, op: 0.98, col: '#060606', arm: 1, armLen: 6, tilt: 4, lean: 0 }),
    defs: `<filter id="${uid}_tv" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4 .45" numOctaves="1" seed="7"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 7 -3.1"/></filter>`,
    over: `${glow(uid, 138, g.hz - 17, 76, 0.7)}<g fill="#fff"><rect y="46" width="200" height="2.5" opacity=".2"/><rect y="129" width="200" height="1.5" opacity=".3"/><rect y="168" width="200" height="4" opacity=".13"/></g>`,
    fx: 0.68,
    fy: 0.5,
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

  /** Le Mimic : un grand miroir dont le reflet n’est pas la silhouette qui se tient devant, et de faux orbes. */
  mirror: ({ uid, F, r }) => ({
    defs: `<clipPath id="${uid}_mc"><ellipse cx="100" cy="82" rx="44" ry="62"/></clipPath><linearGradient id="${uid}_mr" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#848b8e"/><stop offset="1" stop-color="#2a2e31"/></linearGradient>`,
    back: `<rect y="150" width="200" height="50" fill="#2a2622"/><rect y="148" width="200" height="4" fill="#5a544a"/>
      <ellipse cx="100" cy="82" rx="49" ry="67" fill="url(#${uid}_mr)" stroke="#8d8370" stroke-width="8"/><ellipse cx="100" cy="82" rx="44" ry="62" fill="none" stroke="#2a2621" stroke-width="1.5"/>
      <g clip-path="url(#${uid}_mc)"><rect x="62" y="40" width="30" height="110" fill="#1b1d1e" opacity=".6"/>${F({ x: 116, foot: 150, h: 104, dress: true, hair: true, tilt: 10, lean: 0, arm: 0, armLen: 4, op: 0.85 })}</g>
      <path d="M72 46 L90 28 M76 56 L96 36" stroke="#fff" stroke-width="2" opacity=".3"/>
      <rect x="146" y="132" width="10" height="18" rx="2" fill="#bdb4a2"/><rect x="149" y="126" width="4" height="7" fill="#2a2622"/><ellipse cx="44" cy="148" rx="14" ry="3" fill="#191714"/>`,
    figs: F({ x: 30, foot: 282, h: 240, wide: 1.25, tilt: -6, lean: 0, arm: -2.4, armLen: 4, op: 0.97 }),
    over: `<g fill="#fff" filter="url(#${uid}_b)">${[0, 1, 2]
      .map((i) => `<circle cx="${f(48 + i * 52 + r() * 24)}" cy="${f(30 + r() * 120)}" r="${f(3 + r() * 1.6)}" opacity=".85"/>`)
      .join('')}</g>`,
    fx: 0.5,
    fy: 0.42,
  }),

  /** Moroi : plongée sur des cartes de tarot étalées, l’ombre d’une tête penchée au-dessus. */
  tarot: ({ uid, F }) => {
    let s = ''
    for (let i = 0; i < 5; i++) {
      const a = -36 + i * 18
      const x = 100 + Math.sin(rad(a)) * 92
      const y = 168 - Math.cos(rad(a)) * 92
      s += `<g transform="translate(${f(x)} ${f(y)}) rotate(${a})"><rect x="-15" y="-23" width="30" height="46" rx="2" fill="#d9d0bd" stroke="#2a2621" stroke-width="1"/><rect x="-11" y="-19" width="22" height="38" fill="#4a4033"/><path d="M-11 -19 L11 19 M11 -19 L-11 19 M0 -19 V19" stroke="#8d806a" stroke-width="1"/></g>`
    }
    s += `<g transform="translate(104 146) rotate(8)"><rect x="-20" y="-31" width="40" height="62" rx="2.5" fill="#e6decc" stroke="#2a2621" stroke-width="1.2"/><rect x="-15" y="-26" width="30" height="52" fill="none" stroke="#6e6453" stroke-width="1.3"/>
      <path d="M2 -18 A12 12 0 0 0 2 6 A6 12 0 0 1 2 -18Z" fill="#4f473b"/><g fill="#4f473b"><circle cx="-8" cy="-16" r="1.2"/><circle cx="9" cy="-12" r="1"/><circle cx="-9" cy="12" r="1"/></g>
      <path d="M-12 16 Q-4 12 0 16 T12 16 M-12 21 Q-4 17 0 21 T12 21" stroke="#4f473b" stroke-width="1.2" fill="none"/></g>`
    return {
      back: s,
      // flou posé hors de la rotation : sur le groupe retourné, le filtre ne laisse rien paraître
      figs: `<g filter="url(#${uid}_b2)">${F({ x: 180, foot: -60, h: 190, lean: 198, tilt: -10, arm: -2, armLen: 0, op: 0.75, blur: 'none', col: '#000' })}</g>`,
      fx: 0.5,
      fy: 0.58,
    }
  },

  /** Deogen : vu de sous un lit (se cacher ne sert à rien), ses jambes juste devant, la Spirit Box au sol. */
  spiritbox: ({ uid, g }) => {
    let grille = ''
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) grille += `<circle cx="${-9 + col * 6}" cy="${4 + row * 6}" r="1.5"/>`
    let slats = ''
    for (let x = 14; x < 200; x += 30) slats += `M${x} 0 L${x + 6} 58 `
    return {
      figs: `<g fill="#0a0908" filter="url(#${uid}_s)"><path d="M70 60 L94 60 L90 158 Q90 166 84 168 L76 168 Q72 160 74 150Z"/><path d="M106 60 L130 60 L126 150 Q128 160 124 168 L116 168 Q110 166 110 158Z"/>
        <path d="M68 170 Q70 158 80 158 Q90 158 92 170Z"/><path d="M108 170 Q110 158 120 158 Q130 158 132 170Z"/></g>`,
      front: `<path d="M0 0 H200 V62 L0 70Z" fill="#14120f"/><path d="${slats}" stroke="#2c2924" stroke-width="5"/><path d="M0 70 L200 62" stroke="#8a8170" stroke-width="3"/>
        <path d="M0 70 L200 62 L200 66 L0 75Z" fill="#3a3631"/><path d="M0 74 Q8 110 2 150 L0 150Z" fill="#cdc5b3" opacity=".7"/>
        <g transform="translate(150 ${g.hz + 64}) rotate(-78) scale(.9)"><rect x="-20" y="-30" width="40" height="64" rx="6" fill="#1d1b18" stroke="#5a554c" stroke-width="1.5"/>
        <rect x="-14" y="-24" width="28" height="13" rx="1.5" fill="#eef3e6"/><path d="M-9 -14 v-6 M-5 -14 v-4 M-1 -14 v-7 M3 -14 v-3" stroke="#3b3d36" stroke-width="2"/>
        <g fill="#45413a">${grille}</g><path d="M-14 -30 L-22 -62" stroke="#1b1916" stroke-width="3" stroke-linecap="round"/></g>`,
      over: glow(uid, 132, g.hz + 60, 40, 0.95),
      fx: 0.6,
      fy: 0.7,
    }
  },

  /** Thayé : une silhouette voûtée dans un fauteuil à bascule, à contre-jour devant une haute fenêtre. */
  elder: ({ uid }) => ({
    back: `<rect x="62" y="12" width="92" height="142" fill="#4a453d"/><rect x="68" y="18" width="80" height="132" fill="url(#${uid}_mw)"/><rect x="68" y="18" width="80" height="132" fill="#e9e6dc" opacity=".35"/>
      <path d="M108 18 V150 M68 62 H148 M68 106 H148" stroke="#26231f" stroke-width="3.2"/><rect x="58" y="150" width="100" height="6" fill="#5a544a"/>
      <path d="M56 8 H160" stroke="#1d1b18" stroke-width="3"/><path d="M60 8 Q70 80 56 176 L44 176 Q56 80 46 8Z M156 8 Q146 80 162 176 L174 176 Q160 80 170 8Z" fill="#d8d2c4" opacity=".4"/>
      <path d="M64 176 L152 176 L200 200 L20 200Z" fill="#cfc8b8" opacity=".12"/>`,
    figs: `<g fill="#0a0908" stroke="#0a0908" stroke-linecap="round" stroke-linejoin="round" filter="url(#${uid}_b)">
      <path d="M84 168 Q128 184 176 164" fill="none" stroke-width="4.5"/><path d="M104 170 L92 56" fill="none" stroke-width="5"/><path d="M86 58 L100 53" fill="none" stroke-width="6"/>
      <path d="M146 172 L146 124" fill="none" stroke-width="4"/><path d="M100 128 L152 126" fill="none" stroke-width="4.5"/><path d="M96 102 L148 106" fill="none" stroke-width="3.6"/>
      <ellipse cx="141" cy="80" rx="10" ry="11.5" transform="rotate(24 141 80)"/>
      <path d="M130 86 Q106 88 104 112 L105 129 L152 128 Q158 127 156 120 L150 116 L138 115 Q143 102 143 92Z"/>
      <path d="M151 124 L156 166 M152 168 L165 168" fill="none" stroke-width="8"/><path d="M128 94 L138 112 L158 108" fill="none" stroke-width="6.5"/><path d="M160 104 L168 170" fill="none" stroke-width="3.2"/></g>`,
    fx: 0.5,
    fy: 0.4,
  }),

  /** Gallu : une ligne de sel dispersée au premier plan, une silhouette enragée qui l’a franchie. */
  saltline: ({ F, g, r }) => ({
    figs: F({ x: g.vx - 24, foot: 172, h: 132, arm: 9, armLen: -28, tilt: -8, lean: 4, op: 1, col: '#050505' }),
    front: `<path d="M0 178 Q22 168 44 172 Q60 168 78 173 L76 182 Q40 184 0 188Z" fill="#e8e3d6"/>
      <path d="M128 171 Q146 165 166 169 Q184 165 200 168 L200 178 Q164 179 126 179Z" fill="#e8e3d6"/>${grains(r, 102, 177, 50, 14, 30)}${grains(r, 104, 190, 130, 12, 14)}`,
    fx: 0.4,
    fy: 0.8,
  }),

  /** Obambo : gros plan sur une pendule (deux humeurs, toutes les 2 minutes), une silhouette à moitié floue. */
  clock: ({ uid, F }) => {
    const [cx, cy] = [80, 76]
    let ticks = ''
    for (let i = 0; i < 12; i++) {
      const a = rad(i * 30)
      const k = i % 3 ? 33 : 29
      ticks += `M${f(cx + Math.sin(a) * k)} ${f(cy - Math.cos(a) * k)} L${f(cx + Math.sin(a) * 39)} ${f(cy - Math.cos(a) * 39)} `
    }
    const hands = (m: number, h: number) =>
      `M${cx} ${cy} L${f(cx + Math.sin(rad(h)) * 20)} ${f(cy - Math.cos(rad(h)) * 20)} M${cx} ${cy} L${f(cx + Math.sin(rad(m)) * 33)} ${f(cy - Math.cos(rad(m)) * 33)}`
    const pend = (a: number) => `<g transform="rotate(${a} ${cx} 120)"><path d="M${cx} 120 V176" stroke="#9a8f78" stroke-width="2.4"/><circle cx="${cx}" cy="178" r="11" fill="#cfc3a6" stroke="#5a5040" stroke-width="1.5"/></g>`
    return {
      defs: `<clipPath id="${uid}_cl"><rect width="164" height="200"/></clipPath><clipPath id="${uid}_cr"><rect x="164" width="40" height="200"/></clipPath><clipPath id="${uid}_pc"><rect x="56" y="122" width="48" height="80"/></clipPath>`,
      back: `<rect x="46" y="112" width="68" height="94" fill="#463c31" stroke="#1d1a16" stroke-width="2"/><rect x="56" y="122" width="48" height="80" fill="#1d1a16"/>
        <g clip-path="url(#${uid}_pc)"><g opacity=".35" filter="url(#${uid}_b)">${pend(14)}</g>${pend(-8)}</g>
        <circle cx="${cx}" cy="${cy}" r="54" fill="#463c31" stroke="#1d1a16" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="44" fill="#ddd5c4" stroke="#2c2925" stroke-width="3"/>
        <path d="${ticks}" stroke="#3a362f" stroke-width="2"/>
        <path d="${hands(84, 312)}" stroke="#1e1c19" stroke-width="2.4" stroke-linecap="round" opacity=".3"/>
        <path d="${hands(60, 310)}" stroke="#1e1c19" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2.4" fill="#1e1c19"/>
        <path d="M48 58 A40 40 0 0 1 84 36" stroke="#fff" stroke-width="5" fill="none" opacity=".45" stroke-linecap="round"/>`,
      figs: `<g clip-path="url(#${uid}_cl)">${F({ x: 164, foot: 214, h: 164, tilt: -4, lean: 0, arm: 0, armLen: 6 })}</g><g clip-path="url(#${uid}_cr)">${F({
        x: 168,
        foot: 214,
        h: 164,
        tilt: 16,
        lean: 3,
        arm: 7,
        armLen: -10,
        blur: 'b2',
      })}</g>`,
      fx: 0.4,
      fy: 0.4,
    }
  },

  /** Dayan : une femme qui s’approche à travers une grande pièce, saisie en plusieurs poses. */
  motion: ({ uid, F, g }) => {
    const w = { dress: true, hair: true, tilt: 8, lean: 0, arm: 2, armLen: 4 }
    return {
      back: `<rect x="80" y="${g.hz - 62}" width="40" height="56" fill="#a69c88"/><rect x="74" y="${g.hz - 68}" width="52" height="6" fill="#5a544a"/>
        <g fill="none" stroke="#2c2924" stroke-width="2"><rect x="8" y="${g.hz - 40}" width="52" height="28"/><rect x="140" y="${g.hz - 40}" width="52" height="28"/></g>`,
      figs:
        F({ ...w, x: 98, foot: g.hz + 4, h: 62, op: 0.42 }) +
        F({ ...w, x: 120, foot: g.hz + 34, h: 96, op: 0.62 }) +
        F({ ...w, x: 150, foot: 196, h: 152, op: 1, col: '#050505' }),
      over: glow(uid, 100, g.hz - 34, 44, 0.6),
      fx: 0.4,
      fy: 0.3,
    }
  },

  /** Aswang : vue depuis l’intérieur d’une armoire, à travers les lattes ; la silhouette est juste devant. */
  wardrobe: ({ uid, F }) => {
    let slats = ''
    for (let y = -6; y < 200; y += 15) slats += `<path d="M0 ${y} L200 ${y + 4} L200 ${y + 12} L0 ${y + 8}Z" fill="#0d0c0a"/><path d="M0 ${y + 8} L200 ${y + 12}" stroke="#4d473e" stroke-width="1.3"/>`
    return {
      back: `<rect x="14" y="40" width="44" height="122" fill="#191714"/><rect x="8" y="34" width="56" height="6" fill="#4a453d"/>${glow(uid, 150, 10, 70, 0.6)}`,
      figs: F({ x: 120, foot: 252, h: 214, tilt: -8, lean: 0, arm: 1, armLen: 6, op: 0.97 }),
      front: `<g filter="url(#${uid}_b)">${slats}</g><rect x="94" width="13" height="200" fill="#0a0908"/><rect x="0" width="10" height="200" fill="#0a0908"/><rect x="190" width="10" height="200" fill="#0a0908"/>`,
      fx: 0.6,
      fy: 0.4,
    }
  },

  /** Kormos : une silhouette aux yeux bandés (elle chasse à l’oreille). */
  blindfold: ({ F }) => ({
    figs: F({ x: 100, foot: 286, h: 220, lean: 0, tilt: 12, arm: 0, armLen: 0, op: 0.97 }),
    front: `<g transform="rotate(12 100 112.2)"><path d="M81 84 Q100 79 119 84 L119 94 Q100 89 81 94Z" fill="#d8cfbb"/>
      <path d="M118 86 q11 4 13 17 l-4.5 1 q-2 -10 -9.5 -13Z" fill="#cbc2ad"/><path d="M118 90 q9 8 7 21 l-4.5 0 q1 -11 -3.5 -17Z" fill="#c2b9a4"/></g>`,
    fx: 0.5,
    fy: 0.42,
  }),

  /** Deildegast : une silhouette qui traverse la pièce si vite qu’elle n’est plus qu’une traînée. */
  speed: ({ uid, F, r }) => {
    const w = { foot: 176, h: 128, tilt: -8, lean: 12, arm: 6, armLen: 10 }
    let streaks = ''
    for (let i = 0; i < 13; i++) {
      const y = 58 + r() * 116
      const [x0, x1, t] = [r() * 60, 112 + r() * 34, 1.6 + r() * 3]
      streaks += `<path d="M${f(x0)} ${f(y)} L${f(x1)} ${f(y - t / 2)} L${f(x1)} ${f(y + t / 2)}Z" fill="${i % 3 ? '#0c0b0a' : '#f2ece0'}" opacity="${i % 3 ? 0.62 : 0.55}"/>`
    }
    return {
      back: `<rect y="120" width="200" height="56" fill="#34302a"/><rect y="117" width="200" height="4" fill="#5c564c"/>
        <g fill="none" stroke="#24211d" stroke-width="2"><rect x="10" y="130" width="54" height="36"/><rect x="74" y="130" width="54" height="36"/><rect x="138" y="130" width="54" height="36"/></g>
        <g transform="rotate(11 40 52)"><rect x="18" y="26" width="44" height="52" fill="#6a6255" stroke="#24211d" stroke-width="3"/><rect x="25" y="33" width="30" height="38" fill="#8f877a"/></g>
        <rect x="172" y="56" width="10" height="20" fill="#2a2723"/><path d="M168 56 L186 56 L182 42 L172 42Z" fill="#e2d9c4"/>${glow(uid, 177, 50, 46, 0.7)}`,
      figs:
        `<rect x="18" y="62" width="128" height="114" rx="40" fill="#0c0b0a" opacity=".42" filter="url(#${uid}_m)"/>` +
        F({ ...w, x: 40, op: 0.22, blur: 'm' }) +
        F({ ...w, x: 72, op: 0.38, blur: 'm' }) +
        F({ ...w, x: 104, op: 0.6, blur: 'm' }) +
        F({ ...w, x: 140, op: 0.95 }),
      front: `${streaks}<g fill="#e4dccb" filter="url(#${uid}_m)"><rect x="150" y="96" width="14" height="10" transform="rotate(30 157 101)"/><rect x="164" y="128" width="12" height="9" transform="rotate(-20 170 132)"/></g>`,
      fx: 0.45,
      fy: 0.5,
    }
  },
}

/** Mise en scène de chaque entité (scène, indice, réglages de la silhouette, description). */
export const PHOTO_PRESETS: Record<string, PhotoOptions> = {
  spirit: { scene: 'room', wx: 112, cue: 'smudge', figure: { op: 0.5, blur: 'b2' }, alt: 'un bâton d’encens qui fume, une silhouette au fond' },
  wraith: { scene: 'door', dx: 84, cue: 'salt', figure: { tilt: 8, lean: 0 }, alt: 'une silhouette qui flotte au-dessus d’un tas de sel intact' },
  phantom: { scene: 'door', dx: 100, cue: 'vanish', figure: { op: 0.32, blur: 'b2', tilt: -8 }, alt: 'une silhouette qui s’efface dans l’éclair du flash' },
  poltergeist: { scene: 'room', wx: 34, cue: 'objects', leak: '#ff9a3c', alt: 'des objets suspendus en l’air dans une pièce vide' },
  banshee: { scene: 'door', dx: 120, cue: 'woman', figure: { tilt: 10, lean: 0 }, alt: 'un micro parabolique tendu vers une silhouette de femme dans l’embrasure d’une porte' },
  jinn: { scene: 'plain', tone: '#5d5850', cue: 'breaker', flash: 1.1, alt: 'gros plan sur un disjoncteur ouvert, un détecteur EMF allumé au premier plan' },
  mare: { scene: 'ceiling', cue: 'bulb', dark: 0.2, flash: 0.75, leak: '#ff6a3c', alt: 'une ampoule éclatée vue d’en dessous, dans une pièce plongée dans le noir' },
  revenant: { scene: 'stairs', cue: 'rush', leak: '#ff6a3c', alt: 'une silhouette qui dévale un escalier vers l’objectif, filée par la vitesse' },
  shade: { scene: 'plain', tone: '#4c473f', floor: 176, cue: 'shadow', flash: 0.35, dark: 0.12, leak: '#ffd27a', alt: 'l’ombre d’une silhouette sur le mur, à moitié cachée derrière l’encadrement d’une porte' },
  demon: { scene: 'corridor', vx: 104, cue: 'crucifix', leak: '#ff4a2a', figure: { tilt: 16, arm: 2, armLen: 14 }, alt: 'un crucifix brûlé au sol, une silhouette au bout du couloir' },
  yurei: { scene: 'plain', tone: '#2d2a26', floor: 180, cue: 'slam', flash: 0.25, dark: 0.22, alt: 'une porte qui vient de claquer, la lumière de la pièce ne passe plus que par la fente' },
  oni: { scene: 'plain', cue: 'brute', leak: '#ff6a3c', flash: 0.4, alt: 'en contre-plongée, une silhouette massive à contre-jour qui remplit l’encadrement d’une porte' },
  yokai: { scene: 'plain', tone: '#3f3a33', cue: 'gramophone', leak: '#ffd27a', alt: 'gros plan sur un gramophone, une tête floue penchée vers lui' },
  hantu: { scene: 'plain', tone: '#2b2926', cue: 'breath', flash: 0.7, blur: 1.3, alt: 'une silhouette de profil qui souffle une buée glacée, du givre sur l’objectif' },
  goryo: { scene: 'corridor', vx: 100, cue: 'dots', dark: 0.35, alt: 'une silhouette en points D.O.T.S dans le viseur d’une caméra vidéo' },
  myling: { scene: 'hall', floor: 112, low: true, vx: 120, tone: '#3d3933', cue: 'child', alt: 'au ras du sol, un ours en peluche et une petite silhouette d’enfant au fond de la chambre' },
  onryo: { scene: 'plain', tone: '#24221e', cue: 'candle', dark: 0.25, flash: 0.35, alt: 'trois bougies, deux soufflées qui fument, une silhouette dans l’ombre' },
  'the-twins': { scene: 'corridor', vx: 78, cue: 'twins', alt: 'deux silhouettes identiques côte à côte' },
  raiju: { scene: 'hall', floor: 132, tone: '#2b2824', cue: 'tv', flash: 0.3, dark: 0.15, alt: 'un téléviseur qui grésille éclaire seul la pièce, une silhouette debout devant' },
  obake: { scene: 'wall', cue: 'handprint', leak: '#ffd27a', alt: 'une empreinte de main à six doigts sur une porte' },
  'the-mimic': { scene: 'plain', tone: '#47433b', cue: 'mirror', alt: 'un grand miroir dont le reflet ne ressemble pas à la silhouette qui se tient devant, entouré d’orbes' },
  moroi: { scene: 'table', cue: 'tarot', leak: '#ff4a2a', alt: 'des cartes de tarot étalées sur une table, vues de dessus, l’ombre d’une tête penchée au-dessus' },
  deogen: { scene: 'hall', floor: 104, low: true, vx: 96, tone: '#36322c', cue: 'spiritbox', alt: 'vue depuis le dessous d’un lit, des jambes juste devant et une Spirit Box allumée au sol' },
  thaye: { scene: 'plain', tone: '#2f2c28', floor: 176, cue: 'elder', flash: 0.4, alt: 'une silhouette voûtée dans un fauteuil à bascule, à contre-jour devant une fenêtre' },
  gallu: { scene: 'corridor', vx: 132, cue: 'saltline', leak: '#ff4a2a', alt: 'une ligne de sel dispersée, une silhouette aux bras levés' },
  obambo: { scene: 'plain', tone: '#36332e', cue: 'clock', alt: 'gros plan sur une pendule, une silhouette à moitié floue' },
  dayan: { scene: 'hall', floor: 84, tone: '#48433b', cue: 'motion', alt: 'une silhouette de femme qui s’approche à travers une grande pièce, saisie en plusieurs poses' },
  aswang: { scene: 'plain', tone: '#6d675c', floor: 164, cue: 'wardrobe', flash: 0.3, alt: 'vue depuis l’intérieur d’une armoire, à travers les lattes, une silhouette juste devant' },
  kormos: { scene: 'corridor', vx: 100, cue: 'blindfold', dark: 0.15, blur: 0.8, flash: 0.7, alt: 'une silhouette aux yeux bandés' },
  deildegast: { scene: 'plain', tone: '#4b463e', floor: 176, cue: 'speed', alt: 'une silhouette qui traverse la pièce si vite qu’elle n’est plus qu’une traînée' },
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
  const text = esc(label ?? (o.alt ? `Photographie floue : ${o.alt}` : 'Photographie floue d’une silhouette'))

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
