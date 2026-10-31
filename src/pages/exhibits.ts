/**
 * Les pièces à étudier (enveloppes d'exercices) : un seul numéro et un seul nom par exercice,
 * pour l'accueil comme pour « S’entraîner ».
 */
export const EXHIBITS = {
  revision: { n: 1, title: 'Révision du jour', to: '/revision' },
  situation: { n: 2, title: 'Mise en situation', to: '/enquete' },
  quiz: { n: 3, title: 'Quiz', to: '/quiz' },
  oreille: { n: 4, title: 'À l’oreille', to: '/oreille' },
  mecaniques: { n: 5, title: 'Mécaniques', to: '/mecaniques' },
  codex: { n: 6, title: 'Codex', to: '/codex' },
} as const

export type ExhibitKey = keyof typeof EXHIBITS
