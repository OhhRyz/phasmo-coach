import type { EvidenceId } from './types'

export interface EvidenceInfo {
  id: EvidenceId
  label: string
  short: string
  color: string
  /** Comment l'obtenir — rappel pour l'entraînement */
  howTo: string
  /** Formulation « trouvée » pour les mises en situation */
  found: string
  /** Formulation « non trouvée » pour les mises en situation */
  notFound: string
  /** Rappel très court, écrit à côté de la case cochée */
  side: string
}

export const EVIDENCE: Record<EvidenceId, EvidenceInfo> = {
  emf: {
    id: 'emf',
    label: 'EMF niveau 5',
    short: 'EMF 5',
    color: 'var(--ev-emf)',
    howTo: "Le lecteur EMF monte au niveau 5 lors d'une interaction de l'entité.",
    found: 'Le lecteur EMF grimpe jusqu’au niveau 5 après une interaction.',
    notFound: 'Plusieurs interactions, mais le lecteur EMF ne dépasse jamais le niveau 4.',
    side: 'niveau 5 au lecteur',
  },
  dots: {
    id: 'dots',
    label: 'Projecteur D.O.T.S',
    short: 'D.O.T.S',
    color: 'var(--ev-dots)',
    howTo: 'Une silhouette traverse le champ du projecteur D.O.T.S (souvent visible à la caméra).',
    found: 'Une silhouette verte traverse le champ du projecteur D.O.T.S.',
    notFound: 'Le projecteur D.O.T.S tourne depuis longtemps dans la pièce : aucune silhouette.',
    side: 'silhouette au projecteur',
  },
  uv: {
    id: 'uv',
    label: 'Ultraviolet',
    short: 'UV',
    color: 'var(--ev-uv)',
    howTo: 'Empreintes de mains/doigts sur portes, interrupteurs, fenêtres, ou pas dans le sel, révélés à la lampe UV.',
    found: 'La lampe UV révèle une empreinte de main sur la porte qui vient de bouger.',
    notFound: 'Portes et interrupteurs ont bougé plusieurs fois : aucune empreinte à la lampe UV.',
    side: 'empreintes à la lampe UV',
  },
  freezing: {
    id: 'freezing',
    label: 'Températures glaciales',
    short: 'Glacial',
    color: 'var(--ev-freezing)',
    howTo: 'Le thermomètre descend sous 0 °C dans la pièce favorite (buée visible).',
    found: 'Le thermomètre affiche −2 °C dans la pièce favorite et ta respiration fait de la buée.',
    notFound: 'La pièce favorite est froide, mais le thermomètre ne descend jamais sous 0 °C.',
    side: 'sous 0 °C au thermomètre',
  },
  orbs: {
    id: 'orbs',
    label: 'Orbes fantomatiques',
    short: 'Orbes',
    color: 'var(--ev-orbs)',
    howTo: 'Petites lumières flottantes visibles à la caméra vidéo (vision nocturne) dans la pièce favorite.',
    found: 'À la caméra, de petites lumières flottent dans la pièce favorite.',
    notFound: 'La caméra filme la pièce favorite depuis le début : aucune lumière flottante.',
    side: 'lumières à la caméra',
  },
  writing: {
    id: 'writing',
    label: 'Écriture fantomatique',
    short: 'Écriture',
    color: 'var(--ev-writing)',
    howTo: "L'entité écrit ou dessine dans le livre posé dans sa pièce favorite.",
    found: 'Le livre posé dans la pièce favorite est couvert de gribouillis.',
    notFound: 'Le livre est resté dans la pièce favorite depuis le début : pages vierges.',
    side: 'dans le livre',
  },
  spiritbox: {
    id: 'spiritbox',
    label: 'Spirit Box',
    short: 'Spirit Box',
    color: 'var(--ev-spiritbox)',
    howTo: 'Une voix répond dans la Spirit Box (lumières éteintes, près de l’entité).',
    found: 'Lumières éteintes, une voix grésillante répond dans la Spirit Box.',
    notFound: 'Lumières éteintes, tu poses des questions à la Spirit Box depuis des minutes : aucune réponse.',
    side: 'une voix répond, lumières éteintes',
  },
}

export const EVIDENCE_IDS: EvidenceId[] = ['emf', 'dots', 'uv', 'freezing', 'orbs', 'writing', 'spiritbox']

export function evidenceLabel(id: EvidenceId): string {
  return EVIDENCE[id].label
}
