/**
 * Graphiques dessinés à la main pour les fiches : seuil de chasse et vitesse.
 * Calculés à partir des données de l'entité.
 */
import type { Ghost } from '../../data/types'
import { num } from '../../engine/format'

const W = 480
const L = 14
const R = 466
const sx = (v: number, max: number) => L + (Math.max(0, Math.min(max, v)) / max) * (R - L)

export function HatchDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <pattern id="hatch-red" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
          <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--red-pen)' }} strokeWidth="2.2" />
        </pattern>
        <pattern id="hatch-light" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
          <line x1="0" y1="0" x2="0" y2="8" style={{ stroke: 'var(--red-pen)' }} strokeWidth="1.1" strokeDasharray="2.5 2.5" />
        </pattern>
      </defs>
    </svg>
  )
}

/** Seuil de chasse sur une règle de 0 à 100 % de santé mentale moyenne. */
export function SanityChart({ ghost }: { ghost: Ghost }) {
  const h = ghost.huntSanity
  const normal = h.normal >= 0 ? h.normal : h.high
  if (normal < 0) return null
  const xN = sx(normal, 100)
  const xHi = sx(Math.max(h.high, normal), 100)
  const xLo = h.low >= 0 && h.low < normal ? sx(h.low, 100) : null
  const label = `Seuil de chasse : ${h.summary}`
  return (
    <svg className="chart" viewBox={`0 0 ${W} 112`} role="img" aria-label={label}>
      <text className="hand-t" x={(L + xN) / 2} y="24" textAnchor="middle">
        zone de chasse
      </text>
      {xHi > xN + 30 && (
        <text className="hand-t" x={(xN + xHi) / 2} y="24" textAnchor="middle">
          sous conditions
        </text>
      )}
      <rect x={L} y="34" width={xN - L} height="20" fill="url(#hatch-red)" opacity=".8" />
      {xHi > xN && <rect x={xN} y="34" width={xHi - xN} height="20" fill="url(#hatch-light)" />}
      <path className="dim" d={`M${sx(50, 100)} 30 V54`} strokeWidth="1.4" strokeDasharray="3 3" />
      <path className="axis" d={`M${L} 54 H${R}`} />
      <g className="tick">
        <path d={Array.from({ length: 11 }, (_, i) => `M${sx(i * 10, 100)} 54v${i % 5 === 0 ? 7 : 5}`).join('')} />
      </g>
      <path className="red" d={`M${xN} 28 V60`} strokeWidth="2.6" />
      {xLo != null && <path className="red" d={`M${xLo} 40 V60`} strokeWidth="1.6" strokeDasharray="3 3" />}
      <text className="lbl" x={L} y="78">
        0 %
      </text>
      {Math.abs(normal - 50) > 6 && (
        <text className="lbl m-hide" x={sx(50, 100)} y="78" textAnchor="middle">
          50 · standard
        </text>
      )}
      <text className="lbl-b" x={xN} y="78" textAnchor="middle" style={{ fill: 'var(--red-pen)' }}>
        {normal} %
      </text>
      {xLo != null && Math.abs((xLo as number) - xN) > 26 && (
        <text className="lbl" x={xLo} y="78" textAnchor="middle">
          {h.low} %
        </text>
      )}
      {xHi > xN + 26 && (
        <text className="lbl" x={xHi} y="78" textAnchor="middle">
          {h.high} %
        </text>
      )}
      <text className="lbl" x={L} y="104" style={{ letterSpacing: '.06em' }}>
        {ghost.id === 'banshee' ? 'SANTÉ MENTALE DE SA CIBLE' : 'SANTÉ MENTALE MOYENNE DE L’ÉQUIPE'}
      </text>
    </svg>
  )
}

/** Vitesse en chasse sur une règle en m/s. */
export function SpeedChart({ ghost }: { ghost: Ghost }) {
  const s = ghost.speed
  if (s.min <= 0) return null
  const values = [s.min, s.max, s.alt].filter((v): v is number => v != null && v > 0)
  const top = Math.max(...values, s.los ? s.min * 1.65 : 0)
  const max = top > 3.05 ? 4 : 3
  const x = (v: number) => sx(v, max)
  const losTarget = s.los && !s.isRange && s.max == null ? s.min * 1.65 : null
  const ticks = Array.from({ length: max * 4 + 1 }, (_, i) => i / 4)
  return (
    <svg className="chart" viewBox={`0 0 ${W} 100`} role="img" aria-label={`Vitesse en chasse : ${s.summary}`}>
      {s.isRange && s.max != null && <path className="red" d={`M${x(s.min)} 56 H${x(s.max)}`} strokeWidth="5" opacity=".55" />}
      {losTarget != null && (
        <>
          <path className="red draw" d={`M${x(s.min) + 8} 46 C ${x(s.min) + 50} 24, ${x(losTarget) - 40} 22, ${x(losTarget) - 4} 44`} strokeWidth="2" pathLength={1} style={{ ['--d' as string]: '1.2s' }} />
          <text className="hand-t halo" x={(x(s.min) + x(losTarget)) / 2} y="20" textAnchor="middle">
            en ligne de vue
          </text>
          <circle cx={x(losTarget)} cy="56" r="6" fill="none" style={{ stroke: 'var(--red-pen)' }} strokeWidth="2" />
          <text className="lbl-b" x={x(losTarget)} y="82" textAnchor="middle" style={{ fill: 'var(--red-pen)' }}>
            ≈ {num(Math.round(losTarget * 10) / 10)}
          </text>
        </>
      )}
      {!s.los && (
        <text className="hand-t halo" x={x(s.min)} y="22" textAnchor="middle">
          pas d’accélération en LdV
        </text>
      )}
      <path className="axis" d={`M${L} 56 H${R}`} />
      <g className="tick">
        <path d={ticks.map((t) => `M${x(t)} 56v${t % 1 === 0 ? 7 : 4}`).join('')} />
      </g>
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(v)} cy="56" r="6" style={i === 0 ? { fill: 'var(--ink)' } : { fill: 'none', stroke: 'var(--ink)' }} strokeWidth="2" />
          <text className="lbl-b" x={x(v)} y={i % 2 === 0 ? 82 : 96} textAnchor="middle">
            {num(v)}
          </text>
        </g>
      ))}
      <text className="lbl" x={L} y="82">
        0
      </text>
      <text className="lbl" x={R} y="98" textAnchor="end">
        {max} m/s
      </text>
      <path className="dim" d={`M${x(1.7)} 48 V56`} strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  )
}

/** Empreinte de main UV : invisible le jour, révélée par la lampe torche la nuit. */
export function UvPrint({ style }: { style?: React.CSSProperties }) {
  return (
    <svg className="uv" viewBox="0 0 120 150" style={style} aria-hidden>
      <defs>
        <clipPath id="uvhand">
          <ellipse cx="60" cy="104" rx="33" ry="35" />
          <rect x="31" y="22" width="15" height="62" rx="7.5" transform="rotate(-8 38 60)" />
          <rect x="49" y="10" width="15" height="70" rx="7.5" />
          <rect x="67" y="16" width="15" height="66" rx="7.5" transform="rotate(6 74 60)" />
          <rect x="84" y="36" width="13" height="52" rx="6.5" transform="rotate(14 90 70)" />
          <rect x="2" y="78" width="15" height="46" rx="7.5" transform="rotate(-48 20 108)" />
        </clipPath>
        <pattern id="uvridge" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
          <path d="M0 2.5 H5" stroke="currentColor" strokeWidth="1.3" />
        </pattern>
      </defs>
      <g clipPath="url(#uvhand)">
        <rect width="120" height="150" fill="currentColor" opacity=".22" />
        <rect width="120" height="150" fill="url(#uvridge)" opacity=".75" />
      </g>
    </svg>
  )
}
