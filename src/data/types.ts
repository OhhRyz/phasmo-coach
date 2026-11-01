export type EvidenceId = 'emf' | 'dots' | 'uv' | 'freezing' | 'orbs' | 'writing' | 'spiritbox'

export interface TextItem {
  text: string
  zeroEvidence?: boolean
}

export interface ConfirmationTest {
  text: string
  definitive: boolean
  /**
   * Pourquoi le test désigne l'entité, dit simplement avec les faits de la fiche : la correction d'une question
   * qui le cite (sinon, le résumé de la fiche). Pour un test dont la conclusion ne va pas de soi.
   */
  why?: string
  /** test faisable seulement si cette preuve est présente (ex. empreintes UV de l'Obake) : hors révision et hors quiz */
  requires?: EvidenceId
}

export type ObservationKind = 'behavior' | 'hunt' | 'interaction' | 'event' | 'tell'
export type ObservationStrength = 'definitive' | 'strong' | 'hint'

export interface Observation {
  text: string
  kind: ObservationKind
  strength: ObservationStrength
  /** pourquoi l'observation désigne l'entité (voir ConfirmationTest.why) */
  why?: string
  /** observation visible seulement si cette preuve est présente dans la partie (ex. Goryo et D.O.T.S) */
  requires?: EvidenceId
}

export interface AuthoredQuestion {
  q: string
  choices: string[]
  answer: number
  explain: string
}

export interface GhostSpeed {
  /** m/s, -1 si inconnu */
  min: number
  max: number | null
  alt: number | null
  isRange: boolean
  /** accélération standard en ligne de vue */
  los: boolean
  /** l'accélération en ligne de vue dépend des conditions (ex. Kormos) : le filtre ne l'élimine jamais */
  losVaries?: boolean
  summary: string
  details: string[]
}

export interface GhostSanity {
  /** %, -1 si inconnu */
  normal: number
  low: number
  high: number
  summary: string
  details: string[]
}

export interface Ghost {
  id: string
  name: string
  nameEn: string
  evidence: EvidenceId[]
  forcedEvidence: EvidenceId | null
  fakeEvidence: EvidenceId | null
  speed: GhostSpeed
  huntSanity: GhostSanity
  summary: string
  keyTells: string[]
  tells: TextItem[]
  behaviors: TextItem[]
  abilities: TextItem[]
  confirmationTests: ConfirmationTest[]
  eliminationTests: { text: string }[]
  confusions: { with: string; why: string }[]
  observations: Observation[]
  quiz: AuthoredQuestion[]
  changes: string[]
  sources: string[]
  uncertain: string[]
}

export interface MechanicsFact {
  id: string
  text: string
  q: string
  a: string
  /**
   * La carte posée en QCM : 3 ou 4 réponses, la bonne comprise (comme les questions rédigées des fiches).
   * Sans elles, la carte reste une question à retourner (« Je savais » / « Je ne savais pas »).
   */
  choices?: string[]
  /** rang de la bonne réponse dans `choices` */
  answer?: number
  /** utile seulement pour relever les preuves : bon à savoir, hors révision et hors quiz */
  evidence?: boolean
}

export type TopicIcon = 'hunt' | 'smudge' | 'equipment' | 'evidence' | 'myth' | 'cursed' | 'sanity' | 'speed'

export interface MechanicsTopic {
  id: string
  title: string
  icon: TopicIcon
  facts: MechanicsFact[]
}

export interface TrueFalse {
  id: string
  claim: string
  answer: boolean
  explain: string
  /** porte sur les preuves : hors quiz, comme les faits « bon à savoir » */
  evidence?: boolean
}

export interface Mechanics {
  topics: MechanicsTopic[]
  trueFalse: TrueFalse[]
}
