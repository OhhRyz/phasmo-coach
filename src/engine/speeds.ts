import type { Ghost } from '../data/types'

/**
 * Paliers de vitesse (m/s) des entités dont la vitesse ne prend que certaines valeurs :
 * tableau « Ghost Speed Breakdown » de la fiche de tybayn (v0.19.1.0).
 * Entre deux paliers, la vitesse n'existe pas dans le jeu : on ne l'annonce ni ne la fait écouter.
 */
const SPEED_STEPS: Record<string, readonly number[]> = {
  // selon la température de la pièce : > 15 °C, 12–15, 9–12, 6–9, 3–6, 0–3, < 0 °C
  hantu: [1.4, 1.75, 2.1, 2.3, 2.4, 2.5, 2.7],
  // selon la santé mentale moyenne, par tranche de 5 % : > 45 % … 0–5 %
  moroi: [1.5, 1.583, 1.66, 1.749, 1.832, 1.915, 1.998, 2.081, 2.164, 2.25],
  // selon l'âge : +0 … +10 vieillissements
  thaye: [2.75, 2.575, 2.4, 2.225, 2.05, 1.875, 1.7, 1.525, 1.35, 1.175, 1.0],
  // 3,0 m/s, moins 0,1 m/s par objet différent, jusqu'à 0,4 m/s (26 objets)
  deildegast: Array.from({ length: 27 }, (_, i) => Math.round((3 - i * 0.1) * 10) / 10),
}

/**
 * Les vitesses de base qu'une entité peut réellement avoir en chasse : ses paliers quand elle en a,
 * sinon les valeurs de sa fiche (min, max, alt). Jamais de valeur interpolée.
 */
export function realSpeeds(g: Ghost): number[] {
  const steps = SPEED_STEPS[g.id]
  if (steps) return [...steps]
  const s = g.speed
  return [...new Set([s.min, s.max, s.alt].filter((v): v is number => v != null && v > 0))]
}

/** Vrai si l'entité peut avoir cette vitesse de base, à la tolérance près (m/s). */
export function hasSpeed(g: Ghost, v: number, tolerance = 0.05): boolean {
  return realSpeeds(g).some((s) => Math.abs(s - v) <= tolerance + 1e-9)
}
