import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { JOURNAL_COLUMNS, JOURNAL_GHOSTS } from '../data'
import type { Ghost } from '../data/types'
import { FROM_CODEX } from '../pages/codexReturn'
import { Strike } from './GhostRow'
import { RoughCircle } from './journal/Journal'

type Style = CSSProperties & Record<`--${string}`, string | number>

/**
 * La grille du journal du jeu (page « Preuves ») : les noms des entités sur trois colonnes, de gauche à droite
 * puis de haut en bas, chacune à la même place que dans le jeu (voir JOURNAL_ORDER). Comme dans le jeu, une
 * entité écartée par les preuves ne quitte pas sa case : elle y reste, barrée au crayon. La dernière possible
 * est entourée au stylo. Chaque nom ouvre sa fiche.
 */
export function JournalGrid({
  isOut,
  only,
}: {
  /** l'entité est écartée par le carnet de preuves */
  isOut: (g: Ghost) => boolean
  /** la seule entité encore possible, quand le carnet conclut */
  only?: Ghost | null
}) {
  return (
    <ol className="jg" style={{ '--jg-cols': JOURNAL_COLUMNS } as Style} aria-label="Les entités, à la même place que dans le journal du jeu">
      {JOURNAL_GHOSTS.map((g) => {
        const out = isOut(g)
        const circled = only === g
        return (
          <li key={g.id} className={`jg-cell${out ? ' is-out' : ''}${circled ? ' is-only' : ''}`}>
            <Link to={`/codex/${g.id}`} state={FROM_CODEX} className="jg-link">
              <span className="jg-name">
                {circled ? (
                  <RoughCircle seed={`jg-${g.id}`} padX={0.08} padY={0.2} delay={0.35}>
                    {g.name}
                  </RoughCircle>
                ) : (
                  g.name
                )}
                {out && <Strike seed={`jg-${g.id}`} />}
              </span>
              {out && <span className="sr-only"> (éliminée)</span>}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
