import type { Ghost } from '../data/types'
import { copiesBehavior } from './filter'
import { hasSpeed } from './speeds'

/**
 * L'ordre du registre du Codex et son adresse, et les valeurs standard du jeu. Les deux classements du registre
 * (par vitesse, par seuil de chasse) sont ceux du coach : quatre cases, une seule par entité (voir engine/families).
 */

/** L'ordre du registre : celui du journal du jeu (par défaut), les quatre familles de vitesse, ou les quatre familles de seuil de chasse. */
export type Rank = 'numero' | 'vitesse' | 'seuil'
/** Le paramètre d'adresse qui porte l'ordre choisi (`/codex?rang=vitesse`) : il tient au rechargement, au retour arrière, et se donne en lien. */
export const RANK_PARAM = 'rang'

/** L'ordre demandé par l'adresse ; une valeur absente ou inconnue : l'ordre du journal du jeu. */
export function rankFromSearch(params: URLSearchParams): Rank {
  const v = params.get(RANK_PARAM)
  return v === 'vitesse' || v === 'seuil' ? v : 'numero'
}

/** Les paramètres de l'adresse avec cet ordre : l'ordre par défaut ne s'écrit pas, les autres paramètres restent. */
export function withRank(params: URLSearchParams, rank: Rank): URLSearchParams {
  const next = new URLSearchParams(params)
  if (rank === 'numero') next.delete(RANK_PARAM)
  else next.set(RANK_PARAM, rank)
  return next
}

/** L'adresse du Codex rangé dans cet ordre (lien d'une fiche vers « voir les entités par vitesse »). */
export function codexRankPath(rank: Rank): string {
  const q = withRank(new URLSearchParams(), rank).toString()
  return q ? `/codex?${q}` : '/codex'
}

/** La vitesse standard (tybayn) : en dessous une entité est lente, au-dessus rapide (voir speedClasses). */
export const STANDARD_SPEED = 1.7
/** Le seuil de chasse standard, en % de santé mentale moyenne. */
export const STANDARD_SANITY = 50

/**
 * Les entités dont la vitesse change par paliers et passe par 1,7 m/s ou tout près (à 0,05 m/s, l'écart que
 * l'oreille ne sépare pas, voir hasSpeed : 1,75 pour le Hantu, 1,66 et 1,749 pour le Moroï, 1,7 pile pour le Thayé
 * et le Deildegast). Le filtre du carnet de preuves les garde quand on coche « normale », alors qu'aucune n'est une
 * entité normale : la page le dit à ce moment-là.
 */
export function nearStandardRanges(ghosts: readonly Ghost[]): Ghost[] {
  return ghosts.filter((g) => g.speed.isRange && !copiesBehavior(g) && hasSpeed(g, STANDARD_SPEED))
}
