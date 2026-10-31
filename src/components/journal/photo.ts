/**
 * Photographies procédurales : une silhouette floue dans une porte, un couloir ou une pièce,
 * avec flash, vignettage, fuite de lumière et grain. Entièrement générées (aucune image du jeu).
 */
import { roughRng } from './rough'

const f = (n: number) => Math.round(n * 10) / 10

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
  blur?: 'b' | 'b2'
}

function figure(o: Figure, uid: string): string {
  const { x, foot, h, lean = 0, tilt = 0, arm = 0, armLen = 0, op = 0.92, col = '#0a0908', blur = 'b' } = o
  const s = h / 100
  return `<g transform="translate(${f(x)} ${f(foot)}) rotate(${f(lean)}) scale(${s.toFixed(3)})" opacity="${op}" filter="url(#${uid}${blur})">
    <g fill="${col}" stroke="${col}" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="0" cy="-89" rx="7.4" ry="9.2" transform="rotate(${f(tilt)} 0 -79)"/>
      <path d="M-3.6 -82 L3.6 -82 L4.4 -73 L-4.4 -73Z"/>
      <path d="M-14.5 -76 Q0 -81 14.5 -76 Q13 -58 10.5 -40 Q0 -37 -10.5 -40 Q-13 -58 -14.5 -76Z" stroke-width="2"/>
      <path d="M-12.6 -73 Q${f(-17 - arm)} -58 ${f(-17 - arm * 1.5)} ${f(-42 + armLen)}" fill="none" stroke-width="6"/>
      <path d="M12.6 -73 Q${f(17 + arm)} -58 ${f(17 + arm * 1.5)} ${f(-42 + armLen)}" fill="none" stroke-width="6"/>
      <path d="M-5.6 -44 L-6.6 -1" fill="none" stroke-width="8.6"/>
      <path d="M5.6 -44 L6.6 -1" fill="none" stroke-width="8.6"/>
    </g></g>`
}

export interface PhotoOptions {
  scene?: 'door' | 'corridor' | 'room'
  leak?: string
  close?: boolean
  double?: boolean
  dx?: number
  vx?: number
  wx?: number
  blur?: number
  figure?: Partial<Figure>
}

/** Quelques mises en scène choisies ; les autres entités ont une photo tirée de leur identifiant. */
export const PHOTO_PRESETS: Record<string, PhotoOptions> = {
  demon: { scene: 'corridor', close: true, double: true, leak: '#ff4a2a', figure: { tilt: 16, arm: 2, armLen: 14, lean: -3 } },
  phantom: { scene: 'door', dx: 104, figure: { tilt: -8, lean: 2 } },
  yurei: { scene: 'room', wx: 86, figure: { tilt: 10, arm: 1 } },
  obake: { scene: 'corridor', vx: 92, figure: { tilt: -14, armLen: 12 } },
  'the-twins': { scene: 'corridor', double: true, figure: { tilt: 6 } },
  revenant: { scene: 'corridor', close: true, leak: '#ff6a3c', figure: { lean: 4, armLen: 16 } },
  shade: { scene: 'room', blur: 3.4, figure: { op: 0.6 } },
  banshee: { scene: 'door', figure: { tilt: 12 } },
}

/** Code SVG d'une photo ; uid doit être unique dans la page (identifiants de filtres). */
export function photoSVG(key: string, uid: string, o: PhotoOptions = PHOTO_PRESETS[key] ?? {}, label = 'Photographie floue d’une silhouette'): string {
  const r = roughRng(key)
  const scene = o.scene || (['door', 'corridor', 'room'] as const)[Math.floor(r() * 3)]
  const leak = o.leak || ['#ff9a3c', '#ff6a3c', '#ffd27a'][Math.floor(r() * 3)]
  let body = ''
  let fx = 0.5
  let fy = 0.55
  const fig = { lean: (r() - 0.5) * 6, tilt: (r() - 0.5) * 18, arm: r() * 3, armLen: r() * 10, ...o.figure }

  if (scene === 'door') {
    const dx = o.dx ?? 70 + r() * 60
    const dw = 50 + r() * 8
    const dh = 102 + r() * 8
    const base = 150
    const top = base - dh
    body += `<rect width="200" height="200" fill="#3b3833"/>`
    body += `<path d="M0 ${base + 2} L200 ${base - 4} L200 200 L0 200Z" fill="#26231f"/>`
    body += `<path d="M0 ${base - 3} L200 ${base - 9} L200 ${base - 4} L0 ${base + 2}Z" fill="#57524a"/>`
    body += `<rect x="${f(dx - dw / 2 - 7)}" y="${f(top - 7)}" width="${f(dw + 14)}" height="${f(dh + 7)}" fill="#6a645a"/>`
    body += `<rect x="${f(dx - dw / 2)}" y="${f(top)}" width="${f(dw)}" height="${f(dh)}" fill="url(#${uid}in)"/>`
    body += `<path d="M${f(dx + dw / 2)} ${f(top)} L${f(dx + dw / 2 - 16)} ${f(top + 8)} L${f(dx + dw / 2 - 16)} ${f(top + dh - 4)} L${f(dx + dw / 2)} ${f(top + dh)}Z" fill="#2b2824"/>`
    body += `<rect x="${f(dx - dw / 2 - 22)}" y="${f(top + 44)}" width="7" height="11" rx="1" fill="#7d766a"/>`
    body += figure({ x: dx - 4, foot: top + dh - 1, h: dh * 0.9, ...fig }, uid)
    fx = (dx - 20) / 200
    fy = 0.5
  } else if (scene === 'corridor') {
    const vx = o.vx ?? 100 + (r() - 0.5) * 34
    const vy = 90 + (r() - 0.5) * 10
    const ew = 22
    const eh = 30
    body += `<rect width="200" height="200" fill="#211f1c"/>`
    body += `<polygon points="0,0 ${f(vx - ew)},${f(vy - eh)} ${f(vx - ew)},${f(vy + eh * 0.8)} 0,200" fill="url(#${uid}wl)"/>`
    body += `<polygon points="200,0 ${f(vx + ew)},${f(vy - eh)} ${f(vx + ew)},${f(vy + eh * 0.8)} 200,200" fill="url(#${uid}wr)"/>`
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
    const h = o.close ? 118 : 50 + r() * 10
    const foot = o.close ? 196 : vy + eh * 0.8
    if (o.double) body += figure({ x: vx + 9, foot, h: h * 1.02, ...fig, op: 0.28, blur: 'b2' }, uid)
    body += figure({ x: vx + (o.close ? -6 : (r() - 0.5) * 10), foot, h, ...fig }, uid)
    fx = 0.5
    fy = 0.6
  } else {
    const wx = o.wx ?? 76 + r() * 50
    const floorY = 158
    body += `<rect width="200" height="200" fill="#34312c"/>`
    body += `<polygon points="0,0 34,22 34,${floorY} 0,200" fill="#272521"/>`
    body += `<polygon points="0,200 34,${floorY} 200,${floorY} 200,200" fill="#1f1d1a"/>`
    body += `<rect x="${f(wx)}" y="36" width="64" height="80" fill="url(#${uid}mw)"/>`
    body += `<path d="M${f(wx + 32)} 36 V116 M${f(wx)} 72 H${f(wx + 64)}" stroke="#1b1a18" stroke-width="3.5"/>`
    body += `<rect x="${f(wx - 5)}" y="114" width="74" height="5" fill="#4d4942"/>`
    body += `<path d="M${f(wx - 14)} 28 Q${f(wx - 4)} 80 ${f(wx - 12)} 150 L${f(wx - 24)} 150 Q${f(wx - 18)} 80 ${f(wx - 22)} 28Z" fill="#191816" opacity=".85"/>`
    body += figure({ x: wx + 34 + (r() - 0.5) * 14, foot: floorY + 4, h: 112, ...fig, col: '#070707' }, uid)
    fx = 0.42
    fy = 0.62
  }

  const specks = Array.from(
    { length: 7 },
    () => `<circle cx="${f(r() * 200)}" cy="${f(r() * 200)}" r="${f(0.4 + r() * 1.1)}" fill="#fff" opacity="${f(0.25 + r() * 0.5)}"/>`,
  ).join('')
  const scratch = `<path d="M${f(r() * 200)} 0 q ${f((r() - 0.5) * 30)} 100 ${f((r() - 0.5) * 20)} 200" stroke="#fff" stroke-width=".5" opacity=".18" fill="none"/>`

  return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">
    <defs>
      <filter id="${uid}b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${o.blur || 2.1}"/></filter>
      <filter id="${uid}b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="${uid}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="${Math.floor(r() * 90)}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
      <filter id="${uid}s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".7"/></filter>
      <linearGradient id="${uid}in" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9a907e"/><stop offset=".7" stop-color="#6f675a"/><stop offset="1" stop-color="#4a453d"/></linearGradient>
      <linearGradient id="${uid}wl" x1="0" x2="1"><stop offset="0" stop-color="#6c665b"/><stop offset="1" stop-color="#25231f"/></linearGradient>
      <linearGradient id="${uid}wr" x1="1" x2="0"><stop offset="0" stop-color="#5f5a50"/><stop offset="1" stop-color="#23211e"/></linearGradient>
      <linearGradient id="${uid}mw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9fb0bb"/><stop offset="1" stop-color="#5e6a72"/></linearGradient>
      <radialGradient id="${uid}f" cx="${fx}" cy="${fy}" r=".75"><stop offset="0" stop-color="#fff4dc" stop-opacity=".42"/><stop offset=".5" stop-color="#fff0d0" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="${uid}v" cx=".5" cy=".5" r=".74"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".88"/></radialGradient>
      <linearGradient id="${uid}l" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="${leak}" stop-opacity=".5"/><stop offset=".3" stop-color="${leak}" stop-opacity="0"/></linearGradient>
    </defs>
    <g filter="url(#${uid}s)">${body}</g>
    <rect width="200" height="200" fill="url(#${uid}f)" style="mix-blend-mode:screen"/>
    <rect width="200" height="200" fill="url(#${uid}v)"/>
    <rect width="200" height="200" fill="url(#${uid}l)" style="mix-blend-mode:screen"/>
    <rect width="200" height="200" filter="url(#${uid}g)" opacity=".42" style="mix-blend-mode:overlay"/>
    ${specks}${scratch}
  </svg>`
}
