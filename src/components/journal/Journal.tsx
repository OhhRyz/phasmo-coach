/**
 * Composants du « journal d'enquête » : la matière du carnet (pages, fiches bristol, tampons,
 * bande Dymo, post-it, enveloppes, polaroïds) et les traits à la main (cercles, cases, coches).
 */
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { crossPath, roughBox, roughEllipse, roughLine, roughRng, tickPath } from './rough'
import { photoSVG, PHOTO_PRESETS } from './photo'

type Style = CSSProperties & Record<`--${string}`, string | number>

/* ---------------------------------------------------------------- traits */

/** Cercle au stylo rouge autour du contenu (tracé une fois la taille connue). */
export function RoughCircle({
  children,
  seed,
  delay = 0.6,
  padX = 0.04,
  padY = 0.3,
  width = 1.8,
  className,
}: {
  children: ReactNode
  seed?: string
  delay?: number
  padX?: number
  padY?: number
  width?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const d = useMemo(
    () => (box ? roughEllipse(box.w, box.h, roughRng(seed ?? String(children)), padX, padY) : ''),
    [box, seed, children, padX, padY],
  )
  return (
    <span ref={ref} className={className} style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {box && (
        <svg
          className="rough draw"
          viewBox={`0 0 ${box.w} ${box.h}`}
          aria-hidden
          style={{ left: 0, top: 0, width: box.w, height: box.h, '--d': `${delay}s`, '--dur': '.8s' } as Style}
        >
          <path d={d} pathLength={1} strokeWidth={width} />
        </svg>
      )}
    </span>
  )
}

/** Souligné au stylo. */
export function RoughUnderline({ children, seed, delay = 0.8 }: { children: ReactNode; seed?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth)
  }, [children])
  const r = roughRng(seed ?? String(children))
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {w > 0 && (
        <svg className="rough draw" viewBox={`0 0 ${w} 12`} aria-hidden style={{ left: 0, bottom: -9, width: w, height: 12, '--d': `${delay}s` } as Style}>
          <path d={roughLine(-2, 5, w + 4, 3 + r() * 3, r, 1.6)} pathLength={1} strokeWidth={2} />
        </svg>
      )}
    </span>
  )
}

export type BoxState = 'yes' | 'no' | 'empty'

/** Case du journal : vide, cochée (couleur de la preuve) ou barrée au crayon. */
export function JournalBox({
  state,
  color,
  seed,
  delay = 0.2,
  crossOut,
}: {
  state: BoxState
  color?: string
  seed: string
  delay?: number
  /** dessine une croix au crayon quand la case est « no » */
  crossOut?: boolean
}) {
  const r = roughRng(seed)
  const box = roughBox(22, r)
  const tick = tickPath(22, r)
  const cross = crossPath(22, r)
  return (
    <span className="box" style={color ? ({ '--c': color } as Style) : undefined} aria-hidden>
      <svg className="draw" viewBox="0 0 38 38">
        <path className="b" d={box} pathLength={1} strokeWidth={1.5} style={{ '--d': `${delay}s`, '--dur': '.5s' } as Style} />
        {state === 'yes' && <path className="t" d={tick} pathLength={1} strokeWidth={3.6} style={{ '--d': `${delay + 0.35}s`, '--dur': '.45s' } as Style} />}
        {state === 'no' && crossOut && (
          <path className="x" d={cross} pathLength={1} strokeWidth={1.8} style={{ '--d': `${delay + 0.2}s`, '--dur': '.4s' } as Style} />
        )}
      </svg>
    </span>
  )
}

/** Numéro entouré au stylo (listes « À retenir »). */
export function CircledNumber({ n, delay = 0.5 }: { n: number; delay?: number }) {
  const d = roughEllipse(28, 28, roughRng('n' + n), 0.02, 0.02)
  return (
    <span className="n">
      {n}
      <svg className="draw" viewBox="0 0 40 40" aria-hidden>
        <path d={d} transform="translate(6 6)" pathLength={1} strokeWidth={1.7} style={{ '--d': `${delay}s` } as Style} />
      </svg>
    </span>
  )
}

/* ---------------------------------------------------------------- matière */

/** Une page du carnet. side : left/right (double page) ou single. */
export function Page({
  side = 'left',
  section,
  label,
  className = '',
  children,
}: {
  side?: 'left' | 'right'
  section?: string
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`page page--${side} ${className}`}
      aria-label={label}
      style={section ? ({ '--section': `var(--tab-${section})` } as Style) : undefined}
    >
      {children}
    </section>
  )
}

/** Le carnet ouvert : une double page (deux enfants) ou une seule page (single). */
/**
 * Le carnet ouvert. Rendu en <main> ; un deuxième carnet sur le même écran (suite d'une fiche) passe
 * `as="section"` pour ne pas créer deux zones principales.
 */
export function Notebook({
  children,
  single,
  className = '',
  as: Tag = 'main',
}: {
  children: ReactNode
  single?: boolean
  className?: string
  as?: 'main' | 'section' | 'div'
}) {
  return <Tag className={`notebook${single ? ' notebook--single' : ''} ${className}`}>{children}</Tag>
}

/** En-tête de dossier tapé à la machine. */
export function FileHead({ children }: { children: ReactNode }) {
  return <div className="filehead">{children}</div>
}

/** Titre de section imprimé, avec un compteur tapé facultatif. */
export function H({ children, count, id, as: Tag = 'h2' }: { children: ReactNode; count?: ReactNode; id?: string; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <Tag className="h" id={id}>
      <span>{children}</span>
      {count != null && <span className="h-count">{count}</span>}
    </Tag>
  )
}

export function Stamp({
  children,
  tone = 'red',
  small,
  plain,
  rotate = -5,
  thunk,
  delay = 0.35,
  className = '',
}: {
  children: ReactNode
  tone?: 'red' | 'violet' | 'pencil' | 'ink'
  small?: boolean
  plain?: boolean
  rotate?: number
  thunk?: boolean
  delay?: number
  className?: string
}) {
  const cls = ['stamp', tone === 'violet' && 'stamp--violet', tone === 'pencil' && 'stamp--pencil', tone === 'ink' && 'stamp--ink', small && 'stamp--sm', plain && 'stamp--plain', thunk && 'thunk', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} style={{ '--r': `${rotate}deg`, '--d': `${delay}s` } as Style}>
      {children}
    </span>
  )
}

const TapeArrow = () => (
  <svg className="arrow" viewBox="0 0 26 12" aria-hidden>
    <path d="M1 6.5 C8 5.5 15 6.8 24 6 M18 1.5 L24.5 6 L18.5 10.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Action principale : une bande de Dymo rouge. */
export function TapeButton({
  to,
  onClick,
  children,
  type = 'button',
  disabled,
  arrow = true,
  rotate,
  autoFocus,
  className = '',
  disabledHint,
  state,
}: {
  to?: string
  /** l'état d'historique passé avec `to` (voir FROM_CODEX) */
  state?: unknown
  onClick?: () => void
  children: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  arrow?: boolean
  rotate?: number
  autoFocus?: boolean
  className?: string
  /** Pourquoi le bouton est grisé (affiché au crayon dessous) : un bouton inactif dit toujours quoi faire. */
  disabledHint?: ReactNode
}) {
  const style = rotate != null ? ({ '--r': `${rotate}deg` } as Style) : undefined
  return (
    <>
    <span className={`btn-wrap${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}>
      {to ? (
        <Link className="btn-tape" to={to} state={state} style={style}>
          {children}
          {arrow && <TapeArrow />}
        </Link>
      ) : (
        <button className="btn-tape" type={type} onClick={onClick} disabled={disabled} style={style} autoFocus={autoFocus}>
          {children}
          {arrow && <TapeArrow />}
        </button>
      )}
    </span>
    {disabled && disabledHint && (
      <span className="pencil-note btn-hint" role="note">
        {disabledHint}
      </span>
    )}
    </>
  )
}

/**
 * Consigne d'un exercice : une ligne tapée, juste au-dessus de la zone où l'on agit. Toujours au même
 * endroit et sous la même forme, pour qu'on sache d'un coup d'œil quoi faire.
 */
export function Consigne({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`consigne ${className}`}>
      <span className="consigne-k">Consigne{'\u202f'}:</span> {children}
    </p>
  )
}

/** Fin d'un exercice : « et maintenant ? » suivi des suites possibles (bande Dymo d'abord). */
export function EndActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`end-actions ${className}`}>
      <p className="pencil-note end-actions-h">et maintenant{'\u202f'}?</p>
      <div className="end-actions-row">{children}</div>
    </div>
  )
}

/** Lien ou bouton secondaire : texte tapé souligné au stylo rouge. */
export function TypedLink({
  to,
  onClick,
  children,
  className = '',
}: {
  to?: string
  /** l'événement dit si le geste vient du clavier (`detail === 0`) */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  className?: string
}) {
  if (to) {
    return (
      <Link className={`link ${className}`} to={to}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={`link link-btn ${className}`} onClick={onClick}>
      {children}
    </button>
  )
}

/** Fiche bristol lignée, avec en-tête tapé et trombone facultatif. */
export function IndexCard({
  head,
  right,
  clip,
  rotate = -0.5,
  className = '',
  children,
}: {
  head?: ReactNode
  right?: ReactNode
  clip?: boolean
  rotate?: number
  className?: string
  children: ReactNode
}) {
  return (
    <article className={`index-card ${className}`} style={{ '--r': `${rotate}deg` } as Style}>
      {clip && (
        <svg className="clip" viewBox="0 0 26 74" aria-hidden>
          <path d="M8 24 V58 a5.5 5.5 0 0 0 11 0 V10 a8 8 0 0 0 -16 0 V62 a10 10 0 0 0 20 0 V22" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      )}
      {(head || right) && (
        <header className="ic-head">
          <span>{head}</span>
          {right && <span>{right}</span>}
        </header>
      )}
      {children}
    </article>
  )
}

/** Post-it du coach (vraies notes seulement). */
/**
 * Post-it. `hand="coach"` (défaut) : écrit au stylo rouge, réservé aux vraies notes du coach.
 * `hand="mine"` : une note de la personne qui tient le carnet, à l'encre ordinaire.
 */
export function Sticky({
  meta,
  sign,
  rotate = 1.4,
  delay = 0,
  hand = 'coach',
  children,
}: {
  meta?: ReactNode
  sign?: ReactNode
  rotate?: number
  delay?: number
  hand?: 'coach' | 'mine'
  children: ReactNode
}) {
  return (
    <div className={`sticky settle sticky--${hand}`} style={{ '--r': `${rotate}deg`, '--d': `${delay}s` } as Style}>
      {meta && <span className="meta">{meta}</span>}
      {children}
      {sign && <span className="sign">{sign}</span>}
    </div>
  )
}

/** Morceau de scotch (décor). */
export function Tape({ style }: { style?: CSSProperties }) {
  return <span className="tape" style={style} aria-hidden />
}

/** Photographie procédurale d'une entité, dans un polaroïd scotché. */
export function Polaroid({
  ghostId,
  caption,
  small,
  to,
  rotate = -3,
  delay = 0,
  width,
  label,
}: {
  ghostId: string
  caption?: ReactNode
  small?: ReactNode
  to?: string
  rotate?: number
  delay?: number
  width?: string
  label?: string
}) {
  const uid = 'ph' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const svg = useMemo(() => photoSVG(ghostId, uid, PHOTO_PRESETS[ghostId], label), [ghostId, uid, label])
  const style = { '--r': `${rotate}deg`, '--d': `${delay}s`, ...(width ? { '--w': width } : {}) } as Style
  const inner = (
    <>
      <Tape />
      {/* SVG généré par photoSVG à partir de constantes : aucun contenu externe */}
      <div className="photo" dangerouslySetInnerHTML={{ __html: svg }} />
      {(caption || small) && (
        <span className="cap">
          {caption}
          {small && <small>{small}</small>}
        </span>
      )}
    </>
  )
  return to ? (
    <Link className="polaroid settle" to={to} style={style}>
      {inner}
    </Link>
  ) : (
    <div className="polaroid settle" style={style}>
      {inner}
    </div>
  )
}

/** Enveloppe kraft (pièce à conviction) menant vers un exercice. */
export function Envelope({
  to,
  piece,
  title,
  text,
  hand,
  rotate = 0,
  labelRotate = 0.6,
  delay = 0,
  action,
  meta,
  children,
}: {
  to: string
  piece: string
  title: string
  text: string
  hand?: ReactNode
  rotate?: number
  labelRotate?: number
  delay?: number
  /** Ce que l'on fait en ouvrant l'enveloppe (« Commencer le quiz »), écrit comme un lien. */
  action?: string
  /** Format et durée (« 10 questions · 3 min »). */
  meta?: string
  children?: ReactNode
}) {
  return (
    <Link className="envelope settle" to={to} style={{ '--r': `${rotate}deg`, '--lr': `${labelRotate}deg`, '--d': `${delay}s` } as Style}>
      <span className="piece">{piece}</span>
      <span className="label">
        <strong>{title}</strong>
        <span>{text}</span>
        {meta && <span className="env-meta">{meta}</span>}
        {children}
        {action && (
          <span className="env-action">
            {action}
            <TapeArrow />
          </span>
        )}
      </span>
      {hand && <span className="hand">{hand}</span>}
    </Link>
  )
}

/** Filtre « encre de tampon » (à placer une fois dans la page). */
export function InkFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <filter id="ink" x="-8%" y="-20%" width="116%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.95" result="m" />
        <feComposite in="SourceGraphic" in2="m" operator="in" result="s" />
        <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="2" result="w" />
        <feDisplacementMap in="s" in2="w" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

/** Note manuscrite dans la marge (positionnée par la page, ou en flux sur mobile). */
export function MarginNote({ children, className = '', style }: { children: ReactNode; className?: string; style?: Style }) {
  return (
    <div className={`margin-note ${className}`} style={style}>
      {children}
    </div>
  )
}

/** Bâtons au crayon (série de jours). */
export function Tally({ n }: { n: number }) {
  const groups = Math.floor(n / 5)
  const rest = n % 5
  const paths: { d: string; delay: number }[] = []
  let x = 6
  let k = 0
  const r = roughRng('tally' + n)
  for (let g = 0; g < Math.min(groups, 6); g++) {
    for (let i = 0; i < 4; i++) {
      paths.push({ d: roughLine(x + i * 8, 6, x + i * 8 - 1, 34, r, 1), delay: 0.5 + k++ * 0.1 })
    }
    paths.push({ d: roughLine(x - 5, 29, x + 30, 9, r, 1), delay: 0.5 + k++ * 0.1 })
    x += 42
  }
  for (let i = 0; i < rest; i++) paths.push({ d: roughLine(x + i * 8, 6, x + i * 8 - 1, 34, r, 1), delay: 0.5 + k++ * 0.1 })
  const w = Math.max(20, x + rest * 8 + 4)
  return (
    <svg className="draw tally" width={w} height="40" viewBox={`0 0 ${w} 40`} aria-hidden style={{ color: 'var(--pencil)' }}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} pathLength={1} strokeWidth={2.2} style={{ '--d': `${p.delay}s`, '--dur': '.15s' } as Style} />
      ))}
    </svg>
  )
}

/* ---------------------------------------------------------------- formulaires */

/** Case à cocher du journal pour les formulaires (case native invisible, accessible au clavier). */
export function CheckLine({
  checked,
  onChange,
  children,
  hint,
  seed,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  hint?: ReactNode
  seed: string
}) {
  return (
    <label className="check-line">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <JournalBox state={checked ? 'yes' : 'empty'} seed={seed} delay={0} />
      <span className="txt">
        {children}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

/** Bouton secondaire : une étiquette de papier collée. */
export function PaperButton({
  onClick,
  children,
  disabled,
  pressed,
  type = 'button',
  rotate,
  className = '',
}: {
  onClick?: () => void
  children: ReactNode
  disabled?: boolean
  pressed?: boolean
  type?: 'button' | 'submit'
  rotate?: number
  className?: string
}) {
  return (
    <button
      type={type}
      className={`paper-btn${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      style={rotate != null ? ({ '--r': `${rotate}deg` } as Style) : undefined}
    >
      {children}
    </button>
  )
}
