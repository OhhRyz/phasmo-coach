/**
 * Les pièces à étudier (enveloppes d'exercices) : un seul numéro, un seul nom, une seule action par
 * exercice, pour l'accueil comme pour « Exercices ». `what` dit ce qu'on fait, `meta` combien de temps,
 * `action` le geste (écrit comme un lien sur l'enveloppe).
 */
export const EXHIBITS = {
  revision: { n: 1, title: 'Révision du jour', to: '/revision', what: 'Réponds aux questions du jour : le carnet te repose ce que tu commences à oublier.', meta: '≈\u00a05\u00a0min · chaque jour', action: 'Réviser' },
  situation: { n: 2, title: 'Mise en situation', to: '/enquete', what: 'Lis les rapports d’un contrat simulé et trouve l’entité.', meta: '≈\u00a05\u00a0min · 1 contrat', action: 'Prendre un contrat' },
  quiz: { n: 3, title: 'Quiz', to: '/quiz', what: 'Réponds à des questions à choix multiple sur les entités.', meta: '10 questions · ≈\u00a03\u00a0min', action: 'Commencer le quiz' },
  oreille: { n: 4, title: 'À l’oreille', to: '/oreille', what: 'Écoute des pas en chasse : lents, normaux ou rapides ?', meta: '10 écoutes · ≈\u00a03\u00a0min · avec le son', action: 'Écouter' },
  mecaniques: { n: 5, title: 'Mécaniques', to: '/mecaniques', what: 'Les règles qui valent pour toutes les entités.', meta: '8 chapitres · lecture', action: 'Lire' },
  codex: { n: 6, title: 'Codex', to: '/codex', what: 'Les 30 fiches, et ton carnet de preuves pendant une partie.', meta: '30 fiches · lecture', action: 'Consulter' },
} as const

export type ExhibitKey = keyof typeof EXHIBITS
