import { useMemo } from 'react'
import { GHOSTS } from '../data'
import { allGhostMastery } from '../engine/progress'
import { useStore } from './store'

export function useMastery(): Record<string, number> {
  const { state, deck } = useStore()
  return useMemo(() => allGhostMastery(GHOSTS.map((g) => g.id), deck, state), [deck, state])
}

/** Moment courant figé pour la durée de vie du composant (évite des recalculs à chaque rendu). */
export function useNow(): number {
  return useMemo(() => Date.now(), [])
}
