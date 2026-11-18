import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { FROM_CODEX } from '../pages/codexReturn'
import type { Snippet } from '../pages/Codex'
import type { Ghost } from '../data/types'
import { NBSP, sanityText } from '../engine/format'
import { rowSpeedText, speedWord } from '../engine/groups'
import { roughLine, roughRng } from './journal/rough'
import { RoughCircle } from './journal/Journal'
import { GhostEvidence, Mastery } from './ui'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Le nom anglais n'apporte rien quand il ne diffère que par l'article ou un accent (Démon / Demon, Le Mimic / The Mimic). */
function bare(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/^(le |la |les |the )/, '')
}

export function losText(ghost: Ghost): string {
  if (ghost.speed.min < 0 || ghost.id === 'the-mimic') return 'Variable'
  return ghost.speed.los ? 'Oui' : 'Non'
}

/** Trait de crayon qui barre une ligne du registre, ou un nom dans la grille du journal (se dessine à l'arrivée). */
export function Strike({ seed }: { seed: string }) {
  const r = roughRng('strike-' + seed)
  const d = roughLine(0.5, 5.5 + r() * 2, 99.5, 3 + r() * 2.5, r, 0.9)
  return (
    <svg className="cx-strike draw" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
      <path d={d} pathLength={1} style={{ '--d': '0s', '--dur': '.45s' } as Style} />
    </svg>
  )
}

/**
 * Une ligne du registre du codex : numéro, nom, maîtrise, preuves, vitesse et seuil. Devant la vitesse, un mot
 * tapé donne la classe d'un coup d'œil : « lente », « normale », « rapide », ou « variable » (voir speedWord) ;
 * le Mimic, « variable », écrit ensuite qu'il copie l'entité imitée (voir rowSpeedText).
 * `dimmed` : entité éliminée par le carnet de preuves (barrée au crayon, pas cachée).
 * `snippet` : trouvée par un mot de sa fiche, pas par son nom : la phrase où il se trouve, le mot surligné.
 */
export function GhostRow({
  ghost,
  mastery,
  dimmed,
  n,
  circled,
  snippet,
}: {
  ghost: Ghost
  mastery: number
  dimmed?: boolean
  n?: number
  /** seule entité encore possible : entourée au stylo */
  circled?: boolean
  snippet?: Snippet | null
}) {
  const los = losText(ghost)
  return (
    <li className={`cx-row${dimmed ? ' is-out' : ''}${circled ? ' is-only' : ''}`}>
      {n != null && (
        <span className="cx-num" aria-hidden>
          {String(n).padStart(2, '0')}
        </span>
      )}
      <span className="cx-main">
        <span className="cx-name">
          <Link to={`/codex/${ghost.id}`} state={FROM_CODEX} className="cx-link">
            {circled ? (
              <RoughCircle seed={`row-${ghost.id}`} padX={0.06} padY={0.18} delay={0.35}>
                {ghost.name}
              </RoughCircle>
            ) : (
              ghost.name
            )}
            {dimmed && <span className="sr-only"> (éliminée)</span>}
          </Link>
          {!bare(ghost.name).includes(bare(ghost.nameEn)) && (
            <span className="cx-en" lang="en">
              {ghost.nameEn}
            </span>
          )}
        </span>
        <span className="cx-ev">
          <span className="sr-only">Preuves : </span>
          <GhostEvidence ghost={ghost} short />
        </span>
      </span>
      <span className="cx-mast">
        <span className="sr-only">Maîtrise : </span>
        <Mastery value={mastery} />
      </span>
      <span className="cx-data">
        <span className="cx-cls">
          <span className="sr-only">Vitesse : </span>
          {speedWord(ghost)}
        </span>
        <span className="cx-data-nums">
          <span className="cx-speed">
            <span className="sr-only">, </span>
            {rowSpeedText(ghost)}
          </span>
          <span className="cx-san">
            <span className="k">seuil </span>
            {sanityText(ghost)}
          </span>
        </span>
      </span>
      {snippet && (
        <span className="cx-snip">
          {snippet.before}
          <mark className="cx-hit">{snippet.hit}</mark>
          {snippet.after}
        </span>
      )}
      {los !== 'Oui' && <span className="cx-los pencil-note">{los === 'Non' ? 'n’accélère pas en ligne de vue' : 'accélération variable'}</span>}
      {dimmed && <Strike seed={ghost.id} />}
    </li>
  )
}

/**
 * Une ligne du registre rangé par vitesse ou par seuil de chasse : le nom (lien vers la fiche, toute la ligne
 * l'ouvre) et, tapée petit, la valeur qui met l'entité dans cette colonne. Le titre de sa partie dit si elle n'a
 * que cette valeur (« toujours ») ou si elle en change (« par moments »). Éliminée par le carnet de preuves :
 * barrée au crayon, comme dans le registre.
 */
export function GroupRow({
  ghost,
  value,
  los,
  dimmed,
  circled,
  snippet,
  seed,
}: {
  ghost: Ghost
  /** « 1,53 m/s », « 1,4 m/s au plus lent », « 60 % » */
  value: string
  /** « accélère en ligne de vue » : seulement dans le registre rangé par vitesse */
  los?: string | null
  dimmed?: boolean
  circled?: boolean
  snippet?: Snippet | null
  /** distingue les traits de crayon d'une même entité d'une colonne à l'autre */
  seed: string
}) {
  return (
    <li className={`cx-row cx-row--grp${dimmed ? ' is-out' : ''}${circled ? ' is-only' : ''}`}>
      <span className="cx-name">
        <Link to={`/codex/${ghost.id}`} state={FROM_CODEX} className="cx-link">
          {circled ? (
            <RoughCircle seed={`grp-${seed}-${ghost.id}`} padX={0.06} padY={0.18} delay={0.35}>
              {ghost.name}
            </RoughCircle>
          ) : (
            ghost.name
          )}
          {dimmed && <span className="sr-only"> (éliminée)</span>}
        </Link>
      </span>
      <span className="cx-gval">
        <span className="sr-only"> : </span>
        {value}
        {/* le « · » tient à la valeur (espace insécable) : il n'ouvre jamais une ligne dans une colonne étroite */}
        {los && (
          <>
            {`${NBSP}· `}
            <span className="cx-glos">{los}</span>
          </>
        )}
      </span>
      {snippet && (
        <span className="cx-snip">
          {snippet.before}
          <mark className="cx-hit">{snippet.hit}</mark>
          {snippet.after}
        </span>
      )}
      {dimmed && <Strike seed={`${seed}-${ghost.id}`} />}
    </li>
  )
}
