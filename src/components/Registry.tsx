import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GHOSTS } from '../data'
import type { Card } from '../engine/cards'
import { NBSP, NNBSP } from '../engine/format'
import type { PersistedState } from '../store/schema'
import { H, RoughCircle } from './journal/Journal'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Une entité est acquise à partir de 85 % de maîtrise : son nom est entouré dans le registre. */
export const ACQUIRED = 0.85

const pct = (m: number) => `${Math.round(m * 100)}${NBSP}%`

/** Ce que résume le bas du registre : entités acquises, en cours, pas encore travaillées. */
export function registryCounts(mastery: Record<string, number>, ids: readonly string[] = GHOSTS.map((g) => g.id)) {
  const acquired = ids.filter((id) => (mastery[id] ?? 0) >= ACQUIRED).length
  const untouched = ids.filter((id) => (mastery[id] ?? 0) === 0).length
  return { acquired, inProgress: ids.length - acquired - untouched, untouched }
}

/** Le compteur du titre : « 3 acquises sur 27 », « aucune acquise sur 27 ». */
export function acquiredLine(acquired: number, total = GHOSTS.length): string {
  return `${acquired ? `${acquired} acquise${acquired > 1 ? 's' : ''}` : 'aucune acquise'} sur ${total}`
}

/**
 * Le registre des entités, tel que sur l'accueil et sur la page « Ma progression » : la maîtrise de chacune
 * surlignée et chiffrée, les acquises entourées, puis le bilan. `after` : ce qui suit le titre (un lien).
 */
export function Registry({ mastery, id, after }: { mastery: Record<string, number>; id: string; after?: ReactNode }) {
  const { acquired, inProgress, untouched } = registryCounts(mastery)
  return (
    <>
      <H id={id} count={acquiredLine(acquired)}>
        Les {GHOSTS.length} entités
      </H>
      {after}
      <p className="registry-legend">Ta maîtrise est surlignée et chiffrée en{NBSP}%{NNBSP}; les entités acquises sont entourées.</p>
      <p className="pencil-note registry-tap">
        <span className="on-mouse">clique sur un nom</span>
        <span className="on-touch">touche un nom</span> pour ouvrir sa fiche
      </p>
      <ol className="registry">
        {GHOSTS.map((g, i) => {
          const m = mastery[g.id] ?? 0
          const ok = m >= ACQUIRED
          const cls = ok ? 'ok' : m === 0 ? 'zero' : m < 0.4 ? 'weak' : undefined
          return (
            <li key={g.id} className={cls} style={{ '--m': m } as Style}>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <Link className="nm" to={`/codex/${g.id}`} style={{ '--i': i } as Style}>
                {ok ? (
                  <RoughCircle seed={g.id} delay={1.1 + i * 0.03}>
                    {g.name}
                  </RoughCircle>
                ) : (
                  g.name
                )}
              </Link>
              <span className="pct">{m === 0 ? '–' : pct(m)}</span>
            </li>
          )
        })}
      </ol>
      <div className="registry-sum">
        <span>
          <b>{acquired || 'aucune'}</b> acquise{acquired > 1 ? 's' : ''}
        </span>
        <span>
          <b>{inProgress || 'aucune'}</b> en cours
        </span>
        <span>
          {untouched ? (
            <>
              <b>{untouched}</b> pas encore travaillée{untouched > 1 ? 's' : ''}
            </>
          ) : (
            <>
              <b>toutes</b> travaillées
            </>
          )}
        </span>
      </div>
    </>
  )
}

/** Les chiffres de la carte d'enquête du profil : questions déjà vues, révisions, jours depuis l'ouverture. */
export function notebookStats(state: Pick<PersistedState, 'cards' | 'log' | 'profile'>, deck: readonly Pick<Card, 'id'>[], now: number) {
  return {
    seen: deck.filter((c) => state.cards[c.id]).length,
    reviews: state.log.length,
    days: Math.round((now - state.profile.createdAt) / 86_400_000),
  }
}

/** « 12 questions vues · 30 révisions · 3 jours » (carte d'enquête du profil, page « Ma progression »). */
export function NotebookStats({ seen, reviews, days, className = '' }: ReturnType<typeof notebookStats> & { className?: string }) {
  return (
    <p className={`idcard-stats ${className}`}>
      <span>
        <b>{seen || 'aucune'}</b> question{seen > 1 ? 's' : ''} vue{seen > 1 ? 's' : ''}
      </span>
      <span>
        <b>{reviews || 'aucune'}</b> révision{reviews > 1 ? 's' : ''}
      </span>
      <span>
        {days > 0 ? (
          <>
            <b>{days}</b> jour{days > 1 ? 's' : ''}
          </>
        ) : (
          'ouvert aujourd’hui'
        )}
      </span>
    </p>
  )
}
