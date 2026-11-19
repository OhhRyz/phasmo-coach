import type { Ghost, Mechanics } from '../data/types'
import { de, isFeminine, le, mentionsEvidence, MIMIC, namesGhost, reverseTells, tellNumbers, testNeedsEvidence, TESTS_PER_GHOST, withoutEvidenceAsides, zeroTests } from './cards'
import { fr, NNBSP, redactGhostName as redact } from './format'
import {
  agrees,
  asksOf,
  cap,
  closeLengths,
  confusionWithoutEvidence,
  distractorSigns,
  duelQuestion,
  duelsFor,
  endSentence,
  factKeys,
  GENDER_TALK,
  hintAlone,
  hints,
  homogeneous,
  keepsSense,
  losAsked,
  losQuestion,
  namesAny,
  nearSpeed,
  NEEDS_CONTEXT,
  noLeadingMais,
  numberQuestion,
  plainSign,
  plural,
  pronounClash,
  quoteFor,
  REDACTED,
  rivals,
  screenOf,
  SENTENCES,
  shortened,
  signOfGhost,
  signVersions,
  SPEED_OR_SANITY,
  standsOut,
  strayCheck,
  summaryQuestion,
  themesOf,
  TRUE_OF_ALL,
  whichTest,
  withoutAsides,
  wrongClaimsFor,
  type Ctx,
  type Option,
  type Question,
  type QuizTopic,
  type Sign,
  type SignStyle,
} from './quiz'
import { createRng, shuffle, weightedPick, type Rng } from './random'

/**
 * La copie sur une seule entité (« Me tester sur X »). Deux règles :
 *  - savoir que la copie porte sur X ne rapporte rien : aucun choix entre des noms d'entités, et chaque réponse fixe
 *    (vrai ou faux, oui ou non) sort autant que l'autre ;
 *  - chaque question porte sur X, et son contenu vient de la fiche de X. Aucune autre entité n'est le sujet d'une
 *    question (le coach, 18 novembre 2026 : « dans un test sur X, chaque question parle de X »), et toutes
 *    s'inscrivent sur X (ghostId). Ni « de qui parle-t-on : X ou Y ? », ni scène tirée de la fiche d'une entité
 *    proche : la première demandait un nom, la seconde montrait le comportement d'une autre.
 *
 * Ce qui reste d'une autre fiche : le signe d'une entité qu'on confond avec X, cité comme FAUX pour X (« Vrai ou
 * faux pour X ? » : une question sur cinq au plus, voir FOREIGN_EVERY) ou parmi les mauvaises réponses, sans nom
 * (« Lequel de ces signes est celui de X ? »), sous les mêmes garde-fous que les mauvaises réponses du quiz : il ne
 * convient en rien à X. Et le départage dans le seul
 * sens où sa réponse parle de X (« à quoi reconnais-tu X plutôt que Y ? »). Ce qui exclut X vient de ses propres
 * tests d'élimination. Le Mimic copie l'entité imitée : aucun comportement d'une autre fiche n'est jamais présenté
 * comme faux pour lui, et il n'est jamais l'entité proche.
 *
 * Ce module importe quiz.ts, qui l'importe à son tour (buildQuiz confie les listes d'une seule entité à
 * buildSoloQuiz) : rien de quiz.ts ne sert ici au chargement du module, seulement à l'intérieur des fonctions.
 */

/** Le nombre de questions de « Me tester sur X », quel que soit le réglage du quiz général. */
export const SOLO_COUNT = 10

/**
 * Les sortes de questions d'une copie sur une seule entité, reconnues au début de leur identifiant :
 * T1 nombres et profil (q:san, q:spd, q:sansum, q:spdsum, q:los), T2 signe de X (q:sign-of), T3a test de X
 * (q:test-of), T3b « ce test suffit-il ? » (q:suffit), T4 ce qui exclut X (q:exclut), T5 l'intrus (q:intrus),
 * T6 vrai ou faux (q:vf), T7a départage (q:dist), T8 « tu observes ceci : est-ce que ça suffit ? » (q:constat), et
 * les questions rédigées de la fiche (q:auth).
 */
export type SoloType = 'T1' | 'T2' | 'T3a' | 'T3b' | 'T4' | 'T5' | 'T6' | 'T7a' | 'T8' | 'auth'

const PREFIXES: readonly [string, SoloType][] = [
  ['q:san:', 'T1'],
  ['q:spd:', 'T1'],
  ['q:sansum:', 'T1'],
  ['q:spdsum:', 'T1'],
  ['q:los:', 'T1'],
  ['q:sign-of:', 'T2'],
  ['q:test-of:', 'T3a'],
  ['q:suffit:', 'T3b'],
  ['q:exclut:', 'T4'],
  ['q:intrus:', 'T5'],
  ['q:vf:', 'T6'],
  ['q:dist:', 'T7a'],
  ['q:constat:', 'T8'],
  ['q:auth:', 'auth'],
]

/** La sorte d'une question d'une copie sur une seule entité (null : une question d'une autre origine). */
export function soloType(q: Pick<Question, 'id'> | string): SoloType | null {
  const id = typeof q === 'string' ? q : q.id
  return PREFIXES.find(([p]) => id.startsWith(p))?.[1] ?? null
}

/**
 * Les réponses fixes : « est-ce que ça suffit ? » (un test, T3b ; une observation, T8) et « vrai ou faux » (T6).
 * L'observation n'a plus que deux réponses : la troisième (« Non, ça l'exclut ») ne valait que pour les scènes
 * d'une autre entité, qui ne se posent plus.
 */
export const SOLO_ANSWERS = {
  enough: { yes: 'yes', no: 'no' },
  trueFalse: { true: 'true', false: 'false' },
} as const

export interface SoloOptions {
  ghost: Ghost
  allGhosts: Ghost[]
  rng: Rng
  /** nombre de questions (10 : la copie de « Me tester sur X ») */
  count?: number
  /** les identifiants des questions déjà posées dans les copies précédentes (« Encore 10 ») : les autres passent d'abord */
  seen?: ReadonlySet<string> | readonly string[]
  /** seulement ces thèmes (le quiz général sur une seule entité étudiée) ; sans eux, tout, questions rédigées comprises */
  topics?: readonly QuizTopic[]
  /** aucune question ne nomme une autre entité (un débutant qui n'a étudié que celle-ci) */
  onlyListed?: boolean
  /**
   * Jusqu'où compléter la copie d'une fiche trop courte pour dix questions : le dernier palier permis de LADDER
   * (par défaut, tous). 0 : un objet, une question.
   */
  relax?: number
}

/**
 * Les paliers d'une copie de dix qui ne se remplit pas, du plus strict au plus souple. Aucun ne redemande un fait,
 * ni ne demande une réponse déjà montrée, ni ne touche à la variété de la copie (voir FEW_MAX, TWO_FREE) : ils
 * jouent sur la finesse des faits.
 *  0. chaque objet en bloc (un objet, une question, voir FACETS) ;
 *  1. les faits d'un même objet se distinguent (la cadence des lancers du Poltergeist, puis son explosion ; la
 *     vitesse du Revenant sans cible, puis ce qui le fait accélérer).
 * Une fiche qui n'a pas dix questions à ce prix donne une copie plus courte.
 *
 * Le départage ne se pose que dans un sens : « à quoi reconnais-tu X plutôt que Y ? », dont la réponse parle de X.
 * Posé à l'envers (« à quoi reconnais-tu Y plutôt que X ? »), il demandait de connaître Y : une question sur une
 * autre entité, que le coach a écartée (18 novembre 2026). Une copie sur X parle de X ; mieux vaut cinq questions
 * sur lui que sept dont deux sur celles qu'on confond avec lui. Un seul départage par copie : deux départages
 * d'une même entité citent le plus souvent le même trait (voir duelSeeds).
 */
const LADDER = [{ fine: false }, { fine: true }] as const
/** Le dernier palier se retente : une question à quatre phrases ne se compose pas à chaque tirage (voir MISSES). */
const LAST_ROUNDS = 3
/**
 * La variété d'une copie. Les questions à deux réponses (vrai ou faux, « est-ce que ça suffit ? », la ligne de vue)
 * sont les plus simples à lire, et une sur deux se trouve au hasard : jusqu'à trois dans toute copie (TWO_FREE),
 * et au-delà pas plus de la moitié de la copie telle qu'elle est (quatre sur sept ou huit, cinq sur neuf ou dix).
 * Les questions à moins de quatre réponses ne dépassent jamais cinq sur dix (FEW_MAX) : une copie de dix compte
 * cinq questions à quatre réponses au moins. Une fiche qui n'a presque que des questions à deux réponses (le Mimic)
 * donne une copie courte plutôt qu'une copie qui se devine.
 */
const TWO_FREE = 3
const FEW_MAX = 5
/** Au plus autant de questions en nombres par copie de dix sur le seuil, et autant sur la vitesse (le Gallu a trois états, donc six nombres). */
const NUMBERS_MAX = 2
/** Au plus autant de « ce test suffit-il ? » (T3b) et de « tu observes ceci : est-ce que ça suffit ? » (T8) par copie de dix. */
const WORTH_MAX = { T3b: 1, T8: 2 } as const
/**
 * Une question sur cinq au plus puise dans la fiche d'une autre entité (une dans une copie de cinq questions ou
 * moins, deux au-delà) : un vrai ou faux dont le « Faux » serait le signe d'une entité proche (il se tire à pile ou
 * face entre ce signe et un signe de X, et compte quelle que soit sa réponse), ou l'intrus. Une copie sur X parle de
 * X : ce qu'elle dit faux pour lui vient d'abord de sa propre fiche (ses tests d'élimination, voir `own`). Compter le
 * tirage, et non la seule réponse « Faux », garde chaque réponse indépendante des précédentes : arrêter après le
 * premier « Faux » faisait du premier vrai ou faux d'une copie un « Faux » 55 fois sur 100, et des suivants des
 * « Vrai ». Mesuré sur 1 200 copies : une affirmation d'une autre fiche dans une copie sur deux en moyenne, deux dans
 * une copie sur dix ; 6,6 questions par copie (6,3 avec un seul tirage par copie, 6,7 avec trois, 7,4 sans limite,
 * mais alors une question sur deux est un vrai ou faux et une sur sept cite une autre fiche).
 */
const FOREIGN_EVERY = 5

/* ---------- ce qu'une question demande, ce qu'elle montre ---------- */

/** Une phrase d'une fiche, et l'entité dont elle parle. */
interface Stmt {
  who: string
  text: string
  /** la ligne de la fiche d'où elle vient (un test cité sans sa conclusion reste le même test) */
  item?: string
  /**
   * Ce que la question en demande : à qui est le fait (`own`, par défaut), ou ce qu'il vaut, une preuve
   * (`proof`) ou un simple indice (`hint`) ; `ownProof` : les deux (« Quel test confirme X ? »). Savoir que la
   * cachette est le signe de l'Aswang ne dit pas si l'observer suffit à le confirmer : les deux se demandent dans
   * une même copie, dans cet ordre. Et une preuve, puis un indice sur le même objet, sont deux faits (la chasse
   * qui s'arrête dans la cachette ; l'entité qui marche vers le joueur à la chasse suivante) ; deux preuves, le
   * plus souvent le même. `any` : un corrigé rédigé, qui peut dire l'un ou l'autre. `value` : une question dont la
   * réponse est une valeur (« Combien de santé mentale fait perdre l'explosion ? 2 % par objet ») ne demande que
   * cette valeur : savoir que l'entité lance des objets ne la donne pas.
   */
  aspect?: 'own' | 'proof' | 'hint' | 'ownProof' | 'any' | 'value'
  /**
   * Un signe clé (`keyTells`) : les signes clés d'une fiche sont des faits différents, même quand ils parlent du
   * même objet (le disjoncteur du Hantu : sa buée quand il est coupé, et il ne le rallume jamais). Entre eux, le
   * même objet ne dit pas « le même fait » ; face à une autre ligne de la fiche (un test, une observation, une
   * question rédigée), qui redit souvent un signe clé, si.
   */
  key?: boolean
}

/** Une question composée, avec ce qu'elle demande et tout ce qu'elle montre une fois corrigée (clés de factKeys, lignes des fiches). */
interface Built {
  q: Question
  type: SoloType
  asks: Set<string>
  shows: Set<string>
  /** l'intrus : ce que demanderait chacune de ses trois affirmations vraies ; une seule au plus est connue par une autre question */
  truths?: string[][]
  /** ses réponses en phrases (signes, tests, départages), sans nom d'entité : aucune ne se relit dans la copie */
  sentences?: string[]
  /**
   * Une réponse en fourchette (« Entre 150 et 170 s après le premier ») : une valeur de la même entité, dans la même
   * unité, lue entre ses bornes (« une seconde fois environ 2 min 40 plus tard », soit 160 s) la donnerait.
   */
  range?: { who: string; unit: string; lo: number; hi: number }
  /** les phrases qu'elle demande, mot à mot (voir sameSaid) : ce que les clés ne reconnaissent pas, les mots le reconnaissent */
  said: Said[]
  /** les phrases qu'elle montre une fois corrigée, celles qu'elle demande comprises */
  told: Said[]
}

/** Une phrase dite d'une entité, réduite à ses mots porteurs ; `worth` : ce que la question en demande, ou en montre (preuve, indice). */
interface Said {
  who: string
  words: ReadonlySet<string>
  worth: readonly string[]
  /** elle demande ce que vaut le fait, pas à qui il est (voir Stmt.aspect) */
  worthOnly?: boolean
}

/** Une question possible sur X : son identifiant, stable, et de quoi la composer pour un tirage. */
interface Seed {
  id: string
  type: SoloType
  topic: QuizTopic
  /** nombre de réponses */
  width: 2 | 3 | 4
  /** la réponse, pour les questions dont les réponses sont fixes ou à deux noms (tirée avant la question) */
  cls?: string
  /** d'où vient la phrase : signes clés, phrases rédigées, départages */
  register?: string
  /** T1 : seuil, vitesse ou ligne de vue */
  group?: 'san' | 'spd' | 'los'
  /** ne se pose que si le tirage de la copie l'a décidé (valeur standard, ligne de vue) */
  gate?: 'stdSan' | 'stdSpd' | 'stdAuth' | 'los'
  /** à essayer après les autres de sa sorte (un signe qui ne parle que de vitesse ou de seuil) */
  late?: boolean
  /** ce qu'elle cite vient de la fiche d'une autre entité (un signe d'une entité proche, dit faux pour X) : voir FOREIGN_EVERY */
  foreign?: boolean
  /** la citation jugée (vrai ou faux, « est-ce que ça suffit ? »), pour l'apparier à une citation de même longueur qui a l'autre réponse */
  text?: string
  /**
   * Ce que la question demandera à coup sûr, connu sans la composer : si la copie le demande déjà, inutile de
   * chercher ses mauvaises réponses (la recherche de réponses de même forme est ce qui coûte).
   */
  pre?: () => string[]
  make: (rng: Rng) => Built | null
}

/** Une clé d'objet ou de geste (le sel, la cachette, les objets lancés), prise en bloc : toute phrase qui en parle. */
const isSoft = (k: string) => k.includes('|~')
/** La même, par fait : ce que la phrase dit de l'objet (voir FACETS). */
const isFine = (k: string) => k.includes('|§')

/**
 * Ce qu'une fiche dit d'un même objet, fait par fait. Presque toutes les lignes du Poltergeist parlent d'objets
 * lancés, celles du Cauchemar de lumières : pris en bloc, l'objet ne laisserait à la copie qu'une seule question
 * sur l'entité (« à qui est ce signe ? »), alors que la fiche en dit plusieurs choses sans rapport (la cadence des
 * lancers en chasse ; l'explosion et ce qu'elle coûte en santé mentale). Une phrase qui ne dit aucun de ces faits,
 * ou dont on ne sait pas lequel, les recoupe tous : dans le doute, c'est le même fait. Sans entrée ici, un objet
 * est un seul fait.
 *
 * La copie se compose d'abord en prenant chaque objet en bloc (un objet, une question : la copie la plus variée),
 * et ne distingue ses faits que pour se compléter (voir LADDER). À relire quand une fiche change : une ligne
 * nouvelle qui ne dit aucun de ces faits reste prudente (elle les recoupe tous), jamais fausse.
 */
type Facets = readonly (readonly [string, RegExp])[]
/** Le Deildegast : sa vitesse et les objets que les joueurs manipulent sont un seul sujet, quatre faits. */
const DEILDEGAST_SPEED: Facets = [
  // 3,0 m/s si personne n'a rien touché ; retour à 3,0 m/s après chaque chasse
  ['départ', /3,0|(?<![\d,])3\s?m\/s|rien touché|plus personne ne touche|revient|retour à|remonte|ultra-rapide|extrêmement rapide/iu],
  // −0,1 m/s par objet différent, jusqu'à 0,4 m/s (26 actions)
  ['par objet', /0,1|0,4|minimum|(?<!\d)26(?!\d)|(?<!\d)13(?!\d)|par action|chaque action|nombre d[’']objets|combien d[’']objets|quinzaine/iu],
  // ce qui compte : un objet ramassé ou utilisé par un joueur (même mort), une seule fois par objet
  ['ce qui compte', /ramass|interrupteur|robinet|qu[’']une fois|même chaussure|lancés? par l[’']entité|projeté par|manipulés par|(?<!\p{L})mort/iu],
  // vitesse verrouillée pendant toute la chasse : ni accélération en ligne de vue, ni ralentissement
  ['fixe', /fixe|verrouill|ligne de vue|constante|ne bouge pas|pas d[’']accélération|sans accélérer|réguliers/iu],
]

const FACETS: Readonly<Record<string, Readonly<Record<string, Facets>>>> = {
  poltergeist: {
    objets: [
      // la cadence des lancers pendant une chasse, et le test des objets alignés sur son passage
      ['cadence', /0,5\s?s(?!\p{L})|rafale|par seconde|passage|passera|align/iu],
      // l'explosion : plusieurs objets d'un coup, 2 % de santé mentale par objet, le test du tas
      ['explosion', /explosion|d[’']un coup|en même temps|(?<!\p{L})tas(?!\p{L})|2\s?%|ensemble/iu],
      // des lancers plus forts, plus loin, plus fréquents
      ['force', /plus vite|plus loin|(?<!\p{L})loin(?!\p{L})|souvent|plus de chances|plus de force|force accrue/iu],
      ['pièce éclairée', /éclairée/iu],
      // il ne touche aux objets qu'en les lançant, mais actionne portes et interrupteurs
      ['lancer seulement', /qu[’']en les lançant|autrement qu/iu],
    ],
  },
  mare: {
    lumiere: [
      // son seuil de chasse selon la lumière de la pièce où il se trouve
      ['seuil', /seuil|\d\s?%|ne chasse pas|chasse dès/iu],
      // sa capacité : éteindre aussitôt une lumière allumée à moins de 4 m, même pendant un événement
      ['éteint aussitôt', /aussitôt|immédiatement|vient d[’']allumer|que tu allumes|4\s?m(?!\p{L})|capacité|l[’']éteint|les éteint|pendant (?:un|les) événements?/iu],
      ['n’allume jamais', /n[’']allume jamais|ne peut (?:pas|jamais) (?:en )?r?allumer|jamais allumé|l[’']entité allume/iu],
      ['erre davantage', /(?<!\p{L})erre|en sort|quitte plus souvent/iu],
      // il préfère éteindre les lumières et faire éclater les ampoules
      ['éteint souvent', /ampoule|préfère|éteint (?:beaucoup|vite|souvent)|en a éteint/iu],
      ['clignotement', /clignot/iu],
    ],
  },
  onryo: {
    flamme: [
      // sa capacité : une chasse à n'importe quelle santé mentale après trois flammes éteintes
      ['trois flammes', /3e|(?<!\p{L})trois|3 flammes|troisième|n[’']importe quel|toute santé|80\s?%|capacité/iu],
      // une flamme proche agit comme un crucifix, et passe avant lui
      ['comme un crucifix', /crucifix|4\s?m(?!\p{L})|au lieu de chasser|à la place|empêch/iu],
      ['seuil', /seuil|60\s?%|40\s?%|35\s?%/iu],
      ['deux fois la même', /deux fois|20\s?s(?!\p{L})|de nouveau/iu],
      ['n’allume pas', /allume une source|ne peut pas allumer/iu],
      ['joueurs morts', /(?<!\p{L})morts?(?!\p{L})|meurent/iu],
    ],
  },
  hantu: {
    froid: [
      ['buée', /buée|(?:souffle|air) glacé/iu],
      ['vitesse', /vitesse|rapide|plus vite|(?<!\p{L})lente?(?!\p{L})|ralenti|m\/s|tiède|chaud|°C/iu],
    ],
    disjoncteur: [
      ['buée', /buée|(?:souffle|air) glacé/iu],
      // il ne rallume jamais le disjoncteur, et le coupe plus souvent
      ['courant', /rallum|(?<!\p{L})coupe|éteindre le disjoncteur/iu],
    ],
  },
  banshee: {
    cible: [
      ['seuil', /(?:selon|en fonction de) la santé|se base|pour chasser/iu],
      ['poursuite', /poursui|traquer le même|ignore les joueurs|qui n[’']est pas sa cible/iu],
      ['errance', /(?<!\p{L})errer|66\s?%/iu],
      ['choix de la cible', /choisi|hasard|en solo|patte de singe/iu],
      ['chant', /(?<!\p{L})chant(?!\p{L})/iu],
      ['cri', /(?<!\p{L})cri(?!\p{L})|parabolique/iu],
    ],
  },
  raiju: {
    electronique: [
      // (« l'accélération » seule ne dit pas la vitesse : « quel équipement déclenche l'accélération du Raiju ? »)
      ['vitesse', /vitesse|2,5|accélèr|n[’']accélère|rapide|allumer? (?:et|puis) éte/iu],
      ['perturbations', /perturb|15\s?m(?!\p{L})/iu],
      ['seuil', /6[35]\s?%|chasser (?:dès|à)|peut chasser|chasse démarre|niveau de santé/iu],
      // quel appareil compte : posé ou tenu en main, celui du joueur, allumé
      ['quel appareil', /posés?(?!\p{L})|tenus?(?!\p{L})|en main|quel équipement|éteint ne déclenche/iu],
    ],
    vitesse: [
      // 2,5 m/s près d'un appareil électronique actif, 1,7 m/s loin de lui
      ['près de l’électronique', /2,5|1,7|vitesse (?:fixe|accrue|standard)|plus rapides?|rapide près|accélèr|n[’']accélère|monte et redescend/iu],
      ['quel appareil', /posés?(?!\p{L})|tenus?(?!\p{L})|en main|quel équipement|éteint ne déclenche/iu],
      ['ligne de vue', /ligne de vue|plateaux/iu],
    ],
  },
  yurei: {
    porte: [
      ['porte de sortie', /porte de sortie|porte principale/iu],
      // son pouvoir : fermer une porte, 15 % de santé mentale en moins pour les joueurs proches
      ['pouvoir', /15\s?%|(?<!à )pouvoir|santé/iu],
      ['jusqu’au bout', /complètement|entrouverte|jusqu[’']au bout|mi-course/iu],
      ['enfermé par l’encens', /encens/iu],
    ],
  },
  jinn: {
    disjoncteur: [
      ['vitesse', /2,5|accél|allure|vitesse|comment chasse|m\/s/iu],
      ['ne le coupe jamais', /ne coupe|couper (?:directement )?le disjoncteur|coupé directement|jamais coupé/iu],
      ['capacité', /25\s?%|capacité|EMF/iu],
    ],
  },
  wraith: {
    sel: [
      ['intact', /perturb|touch|intact|bougé|passe dessus|interagi/iu],
      ['rang 3', /ralenti|rang 3/iu],
    ],
  },
  goryo: {
    errance: [
      ['pièce favorite fixe', /chang|toujours la même|jamais déplacée/iu],
      ['s’éloigne peu', /éloigne|rarement|longue errance|reste plus souvent|abords/iu],
    ],
  },
  myling: {
    ecoute: [
      // ses pas et sa voix ne s'entendent pas au-delà de 12 m pendant une chasse
      ['portée', /1[26]\s?m(?!\p{L})|20\s?m(?!\p{L})|quinzaine|silencieu|de loin|inaudible|son vocal|ni ses pas|surgissent/iu],
      ['sons paranormaux', /micro|enregistreur|plus de sons/iu],
    ],
    son: [
      ['plus de sons', /plus de sons|davantage de sons|deux sons|80\s?s(?!\p{L})|d[’']une minute/iu],
      ['grésillement', /grésillement/iu],
    ],
  },
  obake: {
    visible: [
      ['un clignotement', /le temps d[’']un seul clignotement|l[’']espace d[’']un instant|en boucle/iu],
      ['12e clignotement', /12e|8\s?s(?!\p{L})/iu],
      ['ordre fixe', /ordre|sexe|en premier/iu],
      ['posture', /posture/iu],
    ],
  },
  aswang: {
    cachette: [
      ['la chasse s’arrête', /s[’']arrête|s[’']est arrêtée|se termine|terminée|prend fin|met fin/iu],
      ['chasse suivante', /suivante|précédente|marche (?:droit )?vers/iu],
    ],
    vitesse: [
      // sa vitesse de base, un peu lente
      ['base', /1,53|1,5\s?m\/s|vitesse de base de|pas de départ|démarrent|un peu (?:plus )?lents?/iu],
      // sa prise de vitesse en ligne de vue : 8,7 s au lieu de 13 s
      ['ligne de vue', /8,7|8,667|9\s?s(?!\p{L})|13\s?s(?!\p{L})|ligne de vue|en vue|maximale|pointe/iu],
    ],
  },
  // les fiches dont presque toutes les lignes parlent de vitesse : sans ces faits, une seule question sur la vitesse
  // (un nombre) écartait de la copie tout ce que la fiche en dit d'autre
  revenant: {
    vitesse: [
      // 1,0 m/s tant qu'il n'a détecté personne
      ['sans cible', /1,0|(?<![\d,])1\s?m\/s|sans cible|aucun joueur|n[’']a (?:repéré|détecté) personne|sans t[’']avoir détecté|habituelle|très lents?|extrêmement lents/iu],
      // 3,0 m/s dès qu'il détecte un joueur : par la vue, la voix, un appareil électronique
      ['détection', /3,0|(?<![\d,])3\s?m\/s|dès qu[’']\p{L}+ (?:te |t[’'])?(?:détecte|repère|voit)|où il détecte|laisses détecter|es repéré|voix|électronique|appareil|pleine vitesse|très rapides?/iu],
      // d'un coup, jamais peu à peu : pas d'accélération en ligne de vue
      ['d’un coup', /instantan|d[’']un coup|immédiat|jamais progressive|montée progressive|peu à peu pendant|saute|ligne de vue|brusqu|aussitôt|n[’']augmente plus|déjà au maximum/iu],
      // il garde sa vitesse jusqu'à ta dernière position connue, puis ralentit peu à peu
      ['ralentit', /ralenti|dernière position|là où elle t[’']a perdu/iu],
    ],
  },
  dayan: {
    vitesse: [
      // à moins de 10 m : 2,25 m/s si tu bouges, 1,2 m/s si tu restes immobile
      ['près', /2,25|1,2(?!\d)|bouge|immobile|marche|t[’']arrêtes|repars|très lent|ralentit soudainement/iu],
      // dans ce rayon, sa vitesse est fixe : plus d'accélération en ligne de vue
      ['fixe', /fix[eé]|plus d[’']accélération|ne gagne plus|ne s[’']applique plus|accumul|semble-t-elle disparaître/iu],
      ['loin', /1,7|plus de 10\s?m|de loin|au-delà/iu],
    ],
  },
  deogen: {
    vitesse: [
      // il fonce de loin (3,0 m/s) et ralentit une fois sur toi (0,4 m/s)
      ['loin puis près', /3,0|0,4|fonce|ralenti|chute|très élevée|toute vitesse|très lent|au ralenti/iu],
      ['ligne de vue', /ligne de vue/iu],
    ],
  },
  thaye: {
    vitesse: [
      // de 2,75 m/s jeune à 1,0 m/s vieux : plus lent d'une chasse à l'autre
      ['âge', /2,75|1,0|(?<![\d,])1\s?m\/s|0,175|vieilli|jeune|vieux|plus lente?(?!\p{L})|ralentit d[’']une chasse|diminue|exposé|toute vitesse|très rapide|très lents?/iu],
      ['ligne de vue', /ligne de vue|accél|te voit|en vue/iu],
    ],
  },
  deildegast: {
    vitesse: DEILDEGAST_SPEED,
    objets: DEILDEGAST_SPEED,
  },
  shade: {
    // ce que l'Ombre ne fait pas dans la pièce où se trouve un joueur
    presence: [
      ['chasse', /chass/iu],
      ['activité', /interact|EMF|événement/iu],
      ['flamme', /bougie|flamme|souffl/iu],
    ],
    evenement: [
      ['chant', /chant/iu],
      // aucun événement dans la pièce où se trouve un joueur
      ['même pièce', /(?<!\p{L})pièce(?!\p{L})|joueur/iu],
      // aucun événement à 100 % de santé mentale, de plus en plus quand elle baisse
      ['santé', /100\s?%|santé|début de partie/iu],
      // en silhouette noire aux événements des objets maudits
      ['silhouette', /silhouette|noire|cercle|boîte à musique|patte de singe|apparence complète/iu],
      ['brume', /brume|bulle/iu],
    ],
  },
  oni: {
    evenement: [
      // ses événements coûtent 20 % de santé mentale au lieu de 10 %
      ['santé', /20\s?%|10\s?%|20 points|santé|draine/iu],
      ['brume', /brume|bulle|sifflement/iu],
      ['apparence', /apparence complète/iu],
      ['activité', /activité|actif|plusieurs/iu],
    ],
    visible: [
      // plus visible en chasse : il clignote plus fréquemment
      ['clignote', /clignot|plus visibles?|suis facilement/iu],
      ['apparence', /apparence complète/iu],
    ],
  },
  spirit: {
    encens: [
      // 180 s sans pouvoir chasser après un encens, au lieu de 90 s
      ['délai', /180\s?s(?!\p{L})|3 minutes|90\s?s(?!\p{L})|attend(?!s)|rechass|ne lance aucune chasse/iu],
      // le test du double encens : le second entre 150 et 170 s, puis une chasse dans la minute
      ['double encens', /150|170|160|2\smin\s40|double|second|deuxième|de nouveau|une première fois/iu],
    ],
  },
}

/** Les objets d'une entité dont les faits se distinguent (voir FACETS), pour relire la table face aux fiches. */
export const soloFacets = (who: string): string[] => Object.keys(FACETS[who] ?? {})

/** Les faits d'une phrase sur l'objet d'une clé souple (voir FACETS). */
function facetsOf(who: string, key: string, text: string): string[] {
  const theme = key.slice(key.indexOf('|~') + 2)
  const base = `${who}|§${theme}`
  const known = FACETS[who]?.[theme]
  if (!known) return [`${base}:*`]
  const said = known.filter(([, re]) => re.test(text))
  return (said.length ? said : known).map(([name]) => `${base}:${name}`)
}

/**
 * Ce que la table FACETS reconnaît dans une phrase dite de `who`, objet par objet (seulement les objets de la table) :
 * les faits que la phrase dit, et `known: false` quand elle n'en dit aucun de ceux de la table. Elle les recoupe
 * alors tous (`facts` les donne tous) : la copie ne posera pas d'autre question sur cet objet à côté d'elle. C'est
 * prudent, jamais faux, mais cela coûte des questions : un test liste ces phrases, pour que la personne qui
 * modifie une fiche sache qu'une ligne nouvelle n'est pas reconnue (voir solo.test.ts).
 */
export function soloFacetsOf(who: string, text: string): { object: string; facts: string[]; known: boolean }[] {
  return keysOf(who, text)
    .filter(isSoft)
    .flatMap((key) => {
      const object = key.slice(key.indexOf('|~') + 2)
      const table = FACETS[who]?.[object]
      if (!table) return []
      const lead = `${who}|§${object}:`
      return [{ object, facts: facetsOf(who, key, text).map((k) => k.slice(lead.length)), known: table.some(([, re]) => re.test(text)) }]
    })
}

/** « Quitte rarement sa pièce », « reste dans sa pièce » : le même fait que « s'éloigne peu de sa pièce favorite » (thème `errance` de factKeys). */
const OWN_ROOM = /(?<!\p{L})(?:sa|leur)\s+pièce(?!\p{L})/iu

/** Une allure dite sans nombre : « à pas très lents », « un rythme nettement rapide », « une allure très rapide ». */
const PACE = /(?<!\p{L})(?:lente?s|rapides)(?!\p{L})|(?<!\p{L})(?:rythme|allure)(?!\p{L})/iu

/**
 * Les objets propres à une fiche, que les thèmes des signes (voir factKeys) ne connaissent pas, et que les mots ne
 * suffisent pas à reconnaître d'une ligne à l'autre (voir sameSaid) : le joueur immobile du Kormos (« Immobile et
 * silencieux, il ne te détecte pas », puis « Une chasse commence… Tu t'immobilises en silence ») et sa vue, la pièce que
 * l'Ombre partage avec un joueur (elle n'y fait rien : ni chasse, ni interaction, ni flamme soufflée, voir FACETS),
 * l'EMF 2 que laisse la téléportation du Spectre. Comme tout objet, chacun ne se demande qu'une fois par copie.
 */
const OWN_OBJECTS: Readonly<Record<string, readonly (readonly [string, RegExp])[]>> = {
  kormos: [
    ['immobile', /immobil|(?<!\p{L})figé|sans bouger/iu],
    // presque aveugle : « Ne te voit que si tu bouges à moins de 5 m de lui », « quand le Kormos peut-il te voir ? »
    ['vue', /(?<!\p{L})(?:voi[rt]|vois|aveugle)(?!\p{L})|ligne de vue/iu],
  ],
  shade: [['presence', /même pièce|pièce où tu(?!\p{L})|pièce où (?:elle|il|l[’']entité) (?:est|se trouve)|avec un joueur|sa pièce favorite/iu]],
  wraith: [['emf2', /EMF\s*2(?!\d)|niveau 2(?!\d)/iu]],
}

/** Les clés déjà calculées : les mêmes phrases des fiches reviennent d'une question à l'autre, d'une copie à l'autre. */
const keyCache = new Map<string, string[]>()

/** Les clés du fait que porte un texte sur une entité (voir factKeys) : valeurs, objets et gestes, ligne de vue. */
function keysOf(who: string, text: string): string[] {
  const id = `${who}\u0000${text}`
  let keys = keyCache.get(id)
  if (!keys) {
    if (keyCache.size > 20_000) keyCache.clear()
    keyCache.set(id, (keys = computeKeys(who, text)))
  }
  return keys
}

/**
 * Les thèmes des signes (voir THEMES, quiz.ts) sont taillés large : ils écartent une mauvaise réponse au moindre
 * doute, et là un doute de trop ne coûte rien. Ici, un thème reconnu à tort fait de deux faits sans rapport « le
 * même fait », et la copie perd une question : « sans objet maudit » et « lance un chronomètre » ne parlent pas des
 * objets qu'une entité lance (tous les tests du Démon se recoupaient ainsi) ; « portée du crucifix +50 % », « 33 % de
 * chances », « −25 % de santé » ne disent rien du seuil de chasse ; « portée » n'est pas une porte ; « tes
 * déplacements » (ce que le Kormos détecte) ne sont pas ceux de l'entité. Chaque règle ne fait que retirer un thème
 * reconnu à tort : les valeurs communes et les mots communs (voir sameSaid) continuent de reconnaître un même fait.
 */
const NOT_OBJECTS =
  /objets?\s+maudits?|(?<!\p{L})(?:re)?lanc\p{L}*(?:\s+(?:pas|plus|jamais|aucune?|ou|ni|(?:re)?lanc\p{L}*))*\s+(?:(?:une?|la|sa|ses|des|les|de|d[’'])\s*)?(?:nouvelle\s+)?(?:chasses?|chrono\p{L}*|tentatives?|événements?)|chasses?\s+(?:\p{L}+\s+)?lancées?/giu
const OBJECTS = /objets?(?!\p{L})|lance|projet/iu
/** « seuil », « chasse dès 60 % », « chasse à toute santé mentale », « chasse selon la santé de sa cible » (pas « d'une chasse à l'autre », ni « chasse à 1,7 m/s »). */
const THRESHOLD = /seuil|chass\p{L}*\s+(?:(?:dès|à|sous|avant|jusqu[’']à)\s+\d+(?:,\d+)?\s?%|à\s+(?:n[’']importe|toute?s?\s)|selon\s+la\s+santé)/iu
/** Un pourcentage dit d'une chasse ou de la santé mentale moyenne… */
const PERCENT_OF_HUNT = /chass|santé\s+(?:mentale\s+)?moyenne/iu
/** … sauf une durée ou une vitesse (« 20 % plus courte », « 15 % plus rapides », « vitesse d'entité de 100 % »). */
const PERCENT_OF_ELSE = /plus\s+(?:courte?s?|rapides?|vite)|de\s+moins|durée|vitesse\s+d[’']entité|de\s+chances/iu
const CLAUSE = /\s*(?:[;·:()]|[.!?…](?=\s|$))\s*/u
const DOOR = /(?<!\p{L})portes?(?!\p{L})/iu
const PLAYER_MOVES = /(?<!\p{L})(?:tes|ton|vos)\s+déplacements?/giu
const ROAMING = /(?<!\p{L})erre|errance|pièce favorite|de pièce|s[’']éloigne|déplacement|téléport|abords/iu
function refined(who: string, text: string, keys: Set<string>): void {
  const drop = (theme: string) => keys.delete(`${who}|~${theme}`)
  if (!OBJECTS.test(text.replace(NOT_OBJECTS, ' '))) drop('objets')
  // un pourcentage ne parle du seuil que dans une proposition qui parle d'une chasse ou de la santé moyenne
  const level = (clause: string) => /\d\s?%/u.test(clause) && PERCENT_OF_HUNT.test(clause) && !PERCENT_OF_ELSE.test(clause)
  if (!THRESHOLD.test(text) && !text.split(CLAUSE).some(level)) drop('seuil')
  if (!DOOR.test(text)) drop('porte')
  if (!ROAMING.test(text.replace(PLAYER_MOVES, ' '))) drop('errance')
}

function computeKeys(who: string, text: string): string[] {
  const all = factKeys({ ghostId: who, prompt: text, choices: [], correct: [] })
  // la vitesse ou le seuil en général comptent aussi pour une phrase chiffrée : « fonce à 3,0 m/s puis ralentit à 0,4 m/s
  // en arrivant sur toi » redit « arrive à toute vitesse, puis tombe presque au ralenti une fois tout près ». Entre deux
  // phrases chiffrées, ce sont les valeurs qui disent si c'est le même fait (voir sameFact)
  // une valeur à deux décimales ou plus se lit aussi arrondie : « près de 3,7 m/s » (une observation) donne
  // « 3,71 m/s » ; « en 8,7 s » (une question rédigée de l'Aswang) redit « en 8,667 s » (son signe, son corrigé)
  const rounded = all.flatMap((k) => {
    const m = /^(.+\|)(\d+),(\d)(\d+)$/u.exec(k)
    if (!m) return []
    const v = Number(`${m[2]}.${m[3]}${m[4]}`)
    return [`${m[1]}${m[2]},${m[3]}`, `${m[1]}${(Math.round(v * 10) / 10).toFixed(1).replace('.', ',')}`]
  })
  // une vitesse dite sans décimale (« à pas très lents (environ 1 m/s) », une observation) donne « 1,0 m/s »
  const whole = all.flatMap((k) => {
    const m = /^(.+\|)(\d+) m\/s$/u.exec(k)
    return m ? [`${m[1]}${m[2]},0`] : []
  })
  const keys = new Set([...all, ...rounded, ...whole])
  refined(who, text, keys)
  if (OWN_ROOM.test(text)) keys.add(`${who}|~errance`)
  // une allure dite sans nombre (« des pas extrêmement lents tant que l'entité n'a repéré personne ») parle de la vitesse
  if (PACE.test(text)) keys.add(`${who}|~vitesse`)
  for (const [object, re] of OWN_OBJECTS[who] ?? []) if (re.test(text)) keys.add(`${who}|~${object}`)
  return [...keys]
}

/** Le début d'une réponse, tous noms d'entités retirés : la même phrase dite de deux entités se reconnaît. */
const namelessCache = new Map<string, string>()
function nameless(label: string, all: readonly Ghost[]): string {
  let v = namelessCache.get(label)
  if (v === undefined) {
    if (namelessCache.size > 20_000) namelessCache.clear()
    v = all
      .reduce((t, o) => redact(t, o), label)
      .toLocaleLowerCase('fr')
      .replace(/[^\p{L}\d]+/gu, ' ')
      .trim()
      .slice(0, 60)
    namelessCache.set(label, v)
  }
  return v
}

/** Un texte tel qu'on le relirait : sans nom d'entité, sans ponctuation ni majuscules. */
const plainCache = new Map<string, string>()
function plainText(text: string, all: readonly Ghost[]): string {
  let v = plainCache.get(text)
  if (v === undefined) {
    if (plainCache.size > 20_000) plainCache.clear()
    v = all
      .reduce((t, o) => redact(t, o), text)
      .toLocaleLowerCase('fr')
      .replace(/cette entité/gu, ' ')
      .replace(/[^\p{L}\d]+/gu, ' ')
      .trim()
    plainCache.set(text, v)
  }
  return v
}

/** Une phrase reconnue à son début, quelle que soit sa version (entière, sans apartés, première partie). */
const lineKey = (who: string, text: string) =>
  `${who}#${text
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\d]+/gu, ' ')
    .trim()
    .slice(0, 28)}`

/** La clé d'un objet ou d'un geste, quand on demande ce que le fait vaut (preuve, ou simple indice) et non à qui il est. */
const worthOf = (aspect: Stmt['aspect']): string[] => (aspect === 'proof' || aspect === 'ownProof' ? ['!preuve'] : aspect === 'hint' ? ['!indice'] : aspect === 'any' ? ['!preuve', '!indice'] : [])
/** Une phrase qui dit elle-même ce qu'elle vaut (« un pas manquant après le sel le confirme », « 90 ans ou plus : signe certain ») le montre. */
const SAYS_PROOF = /confirm|(?<!\p{L})certaine?s?(?!\p{L})|prouv|décisi|définiti|à coup sûr/iu
/** « …, c'est un Aswang » : une majuscule après l'article, donc un nom d'entité. */
const SAYS_NAME = /c[’']est (?:une? |le |la |l[’']|les )\p{Lu}/u
const SAYS_HINT = /(?<!\p{L})indices?(?!\p{L})|pourrait|peut-être/iu
const saidWorth = (text: string): string[] => [...(SAYS_PROOF.test(text) || SAYS_NAME.test(text) ? ['!preuve'] : []), ...(SAYS_HINT.test(text) ? ['!indice'] : [])]
const lineKeys = (s: Stmt): string[] => [lineKey(s.who, s.text), ...(s.item ? [s.item] : [])]

/**
 * Deux phrases sur le même objet (le sel, la cachette, les objets lancés) disent-elles le même fait ? Pas deux
 * signes clés d'une même fiche (voir Stmt.key), ni deux phrases chiffrées qui ne citent aucune valeur commune
 * (« lance un objet toutes les 0,5 s », « −2 % de santé par objet lancé » : deux faits ; une valeur commune, elle,
 * se voit à sa propre clé). Dans les autres cas, oui : une observation, un test, une question rédigée redisent le
 * plus souvent un signe. Chaque phrase montre l'objet sous sa sorte (signe clé ou non, chiffrée ou non), et une
 * question demande l'objet sous les sortes qui diraient le même fait qu'elle.
 */
const SORTS = ['KV', 'K', 'V', 'P'] as const
const sortOf = (key: boolean, valued: boolean) => (key ? (valued ? 'KV' : 'K') : valued ? 'V' : 'P')
const sameFact = (a: (typeof SORTS)[number], b: (typeof SORTS)[number]) => !(a.startsWith('K') && b.startsWith('K')) && !(a.endsWith('V') && b.endsWith('V'))

/**
 * Les clés d'une phrase : dures (valeurs, ligne de vue), et son objet ou son geste, avec sa sorte. L'objet deux
 * fois : en bloc (`|~`), et fait par fait (`|§`, voir FACETS). Deux phrases qui disent le même fait d'un objet
 * parlent du même objet : ce que les clés par fait écartent, les clés en bloc l'écartent aussi.
 */
function parts(s: Stmt): { hard: string[]; soft: string[]; sort: (typeof SORTS)[number] } {
  const keys = keysOf(s.who, s.text)
  const hard = keys.filter((k) => !isSoft(k))
  const whole = keys.filter(isSoft)
  // une scène (un rapport de terrain, un test) cite des nombres pour l'exemple (« vers 60 % », « environ 1 m/s ») :
  // elle redit le fait de son objet quelles que soient ses valeurs, comme une phrase sans nombre
  const valued = hard.length > 0 && !(s.item && SCENE_LINE.test(s.item))
  return { hard, soft: [...whole, ...whole.flatMap((k) => facetsOf(s.who, k, s.text))], sort: sortOf(!!s.key, valued) }
}
/** Une ligne de fiche qui décrit une scène : un rapport de terrain (`#O2`), un test de confirmation (`#C0`) ou d'élimination (`#E1`). */
const SCENE_LINE = /#[OCE]\d+$/u

/** Ce que demande une question qui pose cette phrase : ses valeurs et son objet (à qui est-ce ?), ou ce qu'elle vaut. */
function askKeys(s: Stmt): string[] {
  const { hard, soft, sort } = parts(s)
  if (s.aspect === 'value' && hard.length) return [...hard, ...lineKeys(s)]
  const own = s.aspect === 'proof' || s.aspect === 'hint' ? [] : [...hard, ...soft.flatMap((k) => SORTS.filter((o) => sameFact(sort, o)).map((o) => `${k}/${o}`))]
  // ce que vaut le fait se demande aussi par ses valeurs : deux phrases chiffrées qui citent une même valeur (les chasses du
  // Mimic à 1,0 puis 3,0 m/s, dans une observation et dans un test) valent la même chose, quel que soit leur objet
  return [...own, ...[...soft, ...hard].flatMap((k) => worthOf(s.aspect).map((w) => `${k}${w}`)), ...lineKeys(s)]
}

/** Ce que montre une phrase une fois la question corrigée : à qui elle est, toujours ; ce qu'elle vaut, si la question le disait. */
function showKeys(s: Stmt): string[] {
  const { hard, soft, sort } = parts(s)
  const worth = [...new Set([...worthOf(s.aspect), ...saidWorth(s.text)])]
  return [...hard, ...soft.map((k) => `${k}/${sort}`), ...[...soft, ...hard].flatMap((k) => worth.map((w) => `${k}${w}`)), ...lineKeys(s)]
}

/** Un pourcentage ou une vitesse, tels qu'on les lit : « 50 % », « 1,7 m/s ». */
const READ_VALUE = /\d+(?:,\d+)?\s?(?:%|m\/s)/gu
/** « 3 m/s » se lit « 3,0 m/s » : la même vitesse, dite sans décimale dans une observation. */
const asRead = (v: string) => `=${v.replace(/\s/gu, '').replace(/^(\d+)m\/s$/u, '$1,0m/s')}`

/** Les mots outils : ils ne disent rien du fait. */
const HOLLOW = new Set(
  'avec dans pour sans sous vers chez entre mais donc alors puis quand dont comme plus moins très tout tous toute toutes cette cet ces leur leurs elle elles lui est-ce être sont était fait peut peux même aussi après avant pendant entité autre autres quel quelle quels quelles que qui quoi est pas une des les aux son ses sur par'.split(
    ' ',
  ),
)
/** Les noms des entités, sous la forme des mots de `gist` : ils disent de qui l'on parle, pas ce qu'on en dit. */
const NAME_WORDS = new Set<string>()
const gists = new Map<string, ReadonlySet<string>>()
const stem = (w: string) => w.slice(0, 6)
/** Les mots porteurs d'une phrase : trois lettres au moins (ou un nombre), sans mots outils ni noms d'entités, réduits à leur début. */
function gist(text: string): ReadonlySet<string> {
  let v = gists.get(text)
  if (!v) {
    if (gists.size > 20_000) gists.clear()
    const found = text.toLocaleLowerCase('fr').match(/\p{L}+|\d+(?:,\d+)?/gu) ?? []
    v = new Set(found.filter((w) => (w.length >= 3 || /\d/u.test(w)) && !HOLLOW.has(w)).map(stem).filter((w) => !NAME_WORDS.has(w)))
    gists.set(text, v)
  }
  return v
}
/**
 * La même phrase, dite autrement ? « Plus actif quand on parle près de lui » (un signe clé), puis « Quand un Yokai
 * est-il plus actif ? Quand quelqu'un parle près de l'entité » (une question rédigée) : aucune valeur, aucun objet
 * connu des clés (voir factKeys), et pourtant le même fait. Deux phrases sur la même entité disent le même fait
 * quand l'une reprend les deux tiers des mots porteurs de l'autre, ou la moitié s'il y en a trois au moins
 * (« Immobile et silencieux, il ne te détecte pas (sauf s'il te percute par hasard) », « Ne peut pas te détecter si
 * tu restes complètement immobile… si l'entité passe sur toi par hasard »). Dans le doute, c'est le même fait : une
 * question en moins ne coûte rien, une réponse déjà lue fausse la copie.
 */
function sameSaid(a: Said, b: Said): boolean {
  if (a.who !== b.who) return false
  const [small, big] = a.words.size <= b.words.size ? [a.words, b.words] : [b.words, a.words]
  if (small.size < 3) return false
  let shared = 0
  for (const w of small) if (big.has(w)) shared++
  return shared * 3 >= small.size * 2 || (shared >= 3 && shared * 2 >= small.size)
}
const saidOf = (s: Stmt, asking: boolean): Said => ({
  who: s.who,
  words: gist(s.text),
  worth: asking ? worthOf(s.aspect) : [...new Set([...worthOf(s.aspect), ...saidWorth(s.text)])],
  ...(asking && (s.aspect === 'proof' || s.aspect === 'hint') ? { worthOnly: true } : {}),
})

function built(q: Question, type: SoloType, asked: readonly Stmt[], shown: readonly Stmt[] = [], extra: readonly string[] = []): Built {
  const asks = new Set([...asked.flatMap(askKeys), ...extra])
  // tout ce qu'elle demande est montré une fois corrigée, son objet sous toutes les sortes qui diraient le même fait :
  // deux questions qui DEMANDENT le même objet (ou le même fait de cet objet, voir FACETS) ne vont jamais ensemble
  const shows = new Set([...asks, ...asked.flatMap(showKeys), ...shown.flatMap(showKeys)])
  // une question en nombres demande une valeur telle qu'on la lit : elle passe avant toute question dont l'énoncé, la
  // citation, une réponse ou le corrigé l'écrit, de qui qu'elle parle (ses propres mauvaises valeurs ne montrent rien)
  const numeric = /^q:(?:san|spd):/u.test(q.id)
  const right = q.choices.filter((c) => q.correct.includes(c.id)).map((c) => c.label)
  for (const t of [q.prompt, q.quote ?? '', q.explain, ...(numeric ? right : q.choices.map((c) => c.label))]) for (const m of t.matchAll(READ_VALUE)) shows.add(asRead(m[0]))
  if (numeric) for (const r of right) asks.add(asRead(r))
  return { q, type, asks, shows, said: asked.map((a) => saidOf(a, true)), told: [...asked, ...shown].map((a) => saidOf(a, false)) }
}

/* ---------- petites aides ---------- */

const NO_MECHANICS: Mechanics = { topics: [], trueFalse: [] }
const ctxFor = (x: Ghost, all: Ghost[], rng: Rng): Ctx => ({ topics: [], ghosts: [x], allGhosts: all, mechanics: NO_MECHANICS, count: 1, rng })

/** « du Yurei, de l’Oni et du Thayé » */
function listOf(parts: readonly string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

/** « l’ », « les » devant un verbe qui commence par une voyelle (« ils ne l’excluent pas »). */
const themElided = (g: Ghost) => (plural(g) ? 'les ' : 'l’')
/** « C’est le Deogen », « Ce sont les Jumeaux » */
const itIs = (g: Ghost) => `${plural(g) ? 'Ce sont' : 'C’est'} ${le(g.name)}`

/** Un corrigé qui ne dirait rien de plus que la phrase qu'il corrige (la même fin, au nom de l'entité près). */
const tail = (t: string) => t.replace(/[\s.]+$/u, '').slice(-40)
const restates = (explain: string, said: string) => tail(explain) === tail(said)

function memo<T>(f: (x: Ghost, all: Ghost[]) => T): (x: Ghost, all: Ghost[]) => T {
  const cache = new WeakMap<readonly Ghost[], Map<string, T>>()
  return (x, all) => {
    let byGhost = cache.get(all)
    if (!byGhost) cache.set(all, (byGhost = new Map()))
    if (!byGhost.has(x.id)) byGhost.set(x.id, f(x, all))
    return byGhost.get(x.id)!
  }
}

function memoList<T>(f: (all: Ghost[]) => T): (all: Ghost[]) => T {
  const cache = new WeakMap<readonly Ghost[], T>()
  return (all) => {
    if (!cache.has(all)) cache.set(all, f(all))
    return cache.get(all)!
  }
}

/** Les entités qu'on confond avec x (jamais le Mimic ; aucune pour le Mimic, qui copie : rien n'est faux pour lui). */
const rivalsOf = (x: Ghost, all: Ghost[]): Ghost[] => (x.id === MIMIC ? [] : (rivals(all).get(x.id) ?? []))

/* ---------- les tests d'une fiche : leur condition, sans leur conclusion ---------- */

const bareName = (n: string) => n.replace(/^(?:The |Le |Les |La |L['’])/u, '')
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const conclusions = new WeakMap<Ghost, RegExp>()

/**
 * La conclusion d'un test (« …, c'est un Aswang », « …, ça pourrait être un Aswang », « …, ce n'est pas un
 * Goryo », « … désigne un Oni ») : elle dit à elle seule si le test confirme, suggère ou exclut.
 */
function conclusionOf(x: Ghost): RegExp {
  let re = conclusions.get(x)
  if (!re) {
    const names = [...new Set([bareName(x.name), bareName(x.nameEn)])].map(escapeRe).join('|')
    re = new RegExp(
      `[\\s,]*(?:alors\\s+)?(?:c[’']est(?:\\s+peut-être)?|ce\\s+sont|ça\\s+(?:pourrait|peut)\\s+être|ce\\s+n[’']est\\s+pas|ce\\s+ne\\s+sont\\s+pas|désigne)\\s+(?:une?\\s+|le\\s+|la\\s+|les\\s+|l[’'])?(?:${names})(?![\\p{L}])`,
      'u',
    )
    conclusions.set(x, re)
  }
  return re
}

/** Ce qui, avant la conclusion, dirait déjà si le test suffit. */
const VERDICT = /pourrait|peut-être|(?<!\p{L})indices?(?!\p{L})|à coup sûr|forcément|certitude/iu

/**
 * Un test de la fiche de x sans sa conclusion ni ce qui la suit : sa mise en place et sa condition (« Laisse
 * l'entité te voir pendant une chasse, puis cache-toi dans une cachette officielle. Si l'entité atteint ta
 * cachette et que la chasse s'arrête aussitôt »). Null sans conclusion reconnue, ou si le test passe par une preuve.
 */
function testBody(text: string, x: Ghost): string | null {
  const m = conclusionOf(x).exec(text)
  if (!m || m.index < 20) return null
  const body = withoutEvidenceAsides(text.slice(0, m.index))
    .replace(/[\s,;:]+$/u, '')
    .trim()
  if (body.length < 20 || mentionsEvidence(body) || VERDICT.test(body)) return null
  return body
}

/**
 * La condition d'un test, seule, quand elle se comprend sans sa mise en place (« Si tu vois une buée sortir de
 * l'entité ») : elle nomme l'entité ou le joueur, et ne renvoie pas à la phrase d'avant (« Si c'est le cas »).
 */
function conditionOf(body: string): string | null {
  const parts = body.split(SENTENCES)
  const last = parts[parts.length - 1]
  if (parts.length < 2 || !/^Si\s/u.test(last) || /^Si\s+(?:c[’']est|elles?|ils?|ce|cette|ces|oui|non)(?!\p{L})/u.test(last)) return null
  return /l[’']entité|(?<!\p{L})tu(?!\p{L})/u.test(last) ? last : null
}

/**
 * Un test sans sa conclusion, dit comme ce qu'on observe : sa mise en place, puis sa condition sans « si » (« Laisse
 * l'entité te voir pendant une chasse, puis cache-toi dans une cachette officielle. L'entité atteint ta cachette
 * et la chasse s'arrête aussitôt. »). Null si la condition ne commence pas par « si ».
 */
function situationOf(body: string): string | null {
  const parts = body.split(SENTENCES)
  const last = parts[parts.length - 1]
  // la condition qui suit la mise en place (« …, allume-le : si l'entité apparaît… ») d'abord ; sinon celle qui ouvre la phrase
  let said = last.replace(/([,:])\s+si,?\s+/u, '$1 ').replace(/([,:])\s+s[’']il(s?)\s+/u, '$1 il$2 ')
  if (said === last) {
    said = last.replace(/^Si,?\s+/u, '').replace(/^S[’']il(s?)\s+/u, 'Il$1 ')
    // « Si l'affichage est activé, relève… : une baisse de 20 % » : ce « si » n'était pas la condition du test
    if (/\s:\s/u.test(said)) return null
  }
  if (said === last) return null
  said = said
    .replace(/\s+mais\s+qu(?:e\s+|[’'])/gu, ' mais ')
    .replace(/\s+et\s+qu(?:e\s+|[’'])/gu, ' et ')
    .replace(/\s+ou\s+(?:si\s+|s[’'](?=il)|qu(?:e\s+|[’']))/gu, ' ou ')
    .replace(/,\s+qu(?:e\s+|[’'])/gu, ', ')
  // une autre condition (« …, si … ») resterait sans suite
  if (/[,:;]\s+si\s/iu.test(said)) return null
  return [...parts.slice(0, -1), endSentence(cap(said))].join(' ')
}

/** Au-delà, un test cité devient une page à lire avant de répondre : il se demande autrement (« Quel test confirme X ? »). */
const QUOTE_MAX = 340

interface OwnTest {
  /** rang dans la fiche */
  i: number
  text: string
  body: string
  definitive: boolean
  why?: string
}

/**
 * Ce que la fiche de x conclut d'un test, et ce qu'elle ajoute (« c'est un Aswang (…). Attention : … », « ça
 * pourrait être un Aswang. », « ce n'est pas un Goryo. Prudence si… ») : la suite d'un corrigé qui vient de citer
 * sa condition (« Dans ce cas, … »). Le test entier quand sa conclusion ne se lit pas ainsi (« … désigne un Oni »).
 */
function verdictOf(text: string, x: Ghost): string {
  const m = conclusionOf(x).exec(text)
  const rest = m ? text.slice(m.index).replace(/^[\s,:;]+/u, '') : ''
  return /^(?:alors\s+)?(?:c[’']est|ce\s+sont|ça|ce\s+n)/u.test(rest) ? `Dans ce cas, ${rest}` : text
}

/** Les tests de confirmation de x qui se font sans preuve et se citent sans leur conclusion. */
const ownTests = memo((x): OwnTest[] =>
  x.confirmationTests.flatMap((t, i) => {
    if (t.requires || testNeedsEvidence(t.text)) return []
    const body = testBody(t.text, x)
    return body ? [{ i, text: t.text, body, definitive: t.definitive, ...(t.why ? { why: t.why } : {}) }] : []
  }),
)

/** Les tests d'élimination de x qui se font sans preuve et se citent sans leur conclusion. */
const ownEliminations = memo((x): { i: number; text: string; body: string }[] =>
  x.eliminationTests.flatMap((t, i) => {
    if (testNeedsEvidence(t.text)) return []
    const m = conclusionOf(x).exec(t.text)
    // un test d'élimination conclut « ce n'est pas X » : rien d'autre ne l'exclut
    if (!m || !/n[’']est\s+pas|ne\s+sont\s+pas/u.test(m[0])) return []
    const body = testBody(t.text, x)
    return body ? [{ i, text: t.text, body }] : []
  }),
)

/**
 * Un test dit comme ce qu'on observe (voir situationOf), sans le nom de x (« … déclencher la capacité du
 * Cauchemar » : son nom dirait déjà que la scène est la sienne) ni celui d'une autre entité, et assez court pour se
 * lire d'un coup d'œil.
 */
function sceneOfTest(body: string, x: Ghost, all: readonly Ghost[]): string | null {
  const said = situationOf(body)
  const quote = said && redact(said, x)
  return quote && quote.length <= QUOTE_MAX && !namesAny(quote, all) ? quote : null
}

/** Les rapports de terrain de la fiche de x qui se citent sans preuve ni nom d'entité : ce qu'on observe avec lui. */
const ownScenes = memo((x, all): { i: number; text: string; quote: string; strength: Ghost['observations'][number]['strength']; why?: string }[] =>
  x.observations.flatMap((o, i) => {
    if (o.requires) return []
    const quote = quoteFor(o.text, x)
    return quote && !namesAny(quote, all) ? [{ i, text: o.text, quote, strength: o.strength, ...(o.why ? { why: o.why } : {}) }] : []
  }),
)

/* ---------- T1 : nombres et profil ---------- */

/**
 * Les chances qu'une entité au seuil (ou à la vitesse) standard ait sa valeur standard demandée dans une copie :
 * 22 entités chassent d'habitude à 50 %, 20 à 1,7 m/s. Posée plus souvent, la valeur standard, toujours parmi
 * les choix, gagnerait d'office ; la copie préfère les nombres propres à l'entité. Aussi haut que le permettent les
 * deux verrous (la valeur standard n'est la bonne réponse que 40 fois sur 100 au plus quand elle est proposée) :
 * mesuré, « 50 % » 34 fois sur 100 dans les copies entières (les questions rédigées la demandent aussi), « 1,7 m/s »
 * 32 fois sur 100 parmi les questions en nombres (44 fois à 0,12 : trop).
 */
const SOLO_STANDARD = { san: 0.08, spd: 0.08, authored: 0.5 } as const
/** Une question rédigée dont la bonne réponse est la valeur standard elle-même : elle passe une copie sur deux (`authored`). */
const STANDARD_ANSWER = /^(?:50\s?%|1,7\s?m\/s)$/u

/**
 * Les chances que la ligne de vue se demande dans une copie : souvent pour les rares entités qui n'accélèrent
 * pas, rarement pour les autres, pour qu'au fil des copies « Oui » ne gagne pas plus souvent que « Non ». C'est ce
 * tirage qui décide, d'une copie à l'autre : la question revient même si la copie d'avant l'a posée.
 */
const losChance = memoList((all) => {
  const asked = all.filter(losAsked)
  const no = asked.filter((g) => !g.speed.los).length
  const yes = asked.length - no
  return { no: LOS_NO, yes: yes ? Math.min(LOS_NO, (LOS_NO * no) / yes) : 0 }
})
/** Une copie sur deux, pour une entité qui n'accélère pas : la question revient ainsi rarement deux copies de suite. */
const LOS_NO = 0.5

/** « cet interrupteur », « ces 3,0 m/s », « dans ce rayon » : une précision de la fiche qui renvoie à la phrase d'avant. */
const POINTS_BACK = /(?<!\p{L})(?:cet|cette|ces)\s+[\p{L}\d]|(?<!\p{L})ce\s+(?!qui(?!\p{L})|que(?!\p{L})|qu[’']|sont(?!\p{L})|n[’']|ne\s)\p{L}/iu

/**
 * Le corrigé d'une question en nombres, dans une copie sur une seule entité : la précision de la fiche qui cite la
 * valeur demandée, et elle seule (« Dès qu'il détecte un joueur (…), il accélère immédiatement à 3,0 m/s. »). Le
 * corrigé du quiz général recopie le résumé entier et deux précisions : toutes les vitesses de la fiche étaient
 * alors montrées dès la première question, et plus aucune ne pouvait se demander dans la copie. Une précision qui
 * renvoie à la phrase d'avant (« Chasse dès 60 % si cet interrupteur… ») la reprend avec elle. Null si aucune
 * précision ne cite la valeur : le corrigé du quiz général reste.
 */
function leanNumber(details: readonly string[], value: number, unit: '%' | 'm/s'): string | null {
  const n = unit === '%' ? String(value) : mpsNumber(value)
  const cited = new RegExp(`(?<![\\d,])${n.replace('.', '\\.')}(?![\\d,])${unit === '%' ? '\\s?%' : ''}`, 'u')
  const at = details.findIndex((d) => cited.test(d))
  if (at < 0) return null
  return POINTS_BACK.test(details[at]) && at > 0 ? `${details[at - 1]} ${details[at]}` : details[at]
}
/** « 1,0 », « 2,25 », « 1,7 » : une vitesse telle que les fiches l'écrivent, sans son unité. */
const mpsNumber = (v: number) => (Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',')

function numberSeeds(x: Ghost, all: Ghost[]): Seed[] {
  if (x.id === MIMIC) return []
  const out: Seed[] = []
  /** la question telle que le quiz la compose : ce qu'elle demande (sa valeur), ce que montre son corrigé */
  const wrap = (q: Question | null): Built | null => {
    if (!q) return null
    const right = q.choices.filter((c) => q.correct.includes(c.id)).map((c) => c.label)
    const asks = factKeys(q).filter((k) => !k.startsWith('carte:') && !isSoft(k))
    // « vitesse très élevée, qui chute près du joueur » redit « 3,0 m/s loin → 0,4 m/s près » : la question demande aussi
    // la vitesse (ou le seuil) en général, comme une phrase chiffrée face à une phrase sans nombre
    const theme = q.topic === 'sanity' ? 'seuil' : 'vitesse'
    // en bloc, et fait par fait quand la fiche en distingue plusieurs (voir FACETS) : la vitesse du Revenant sans
    // cible n'est pas ce qui le fait accélérer
    const whole = `${x.id}|~${theme}`
    const broad = [whole, ...facetsOf(x.id, whole, [q.prompt, ...right].join(' '))]
    // un résumé se reconnaît aussi à sa condition (« 35 % · jamais dans la même pièce qu'un joueur ») : il demande les
    // objets de sa bonne réponse, comme une phrase (une valeur seule, « 70 % », ne demande que sa valeur)
    const told = /^q:(?:sansum|spdsum):/u.test(q.id) ? right.map((text) => ({ who: x.id, text })) : []
    const objects = told.flatMap((t) => parts(t).soft)
    const general = [...broad, ...objects].flatMap((k) => SORTS.filter((o) => sameFact('V', o)).map((o) => `${k}/${o}`))
    const b = built(q, 'T1', [], [{ who: x.id, text: [q.prompt, ...right, q.explain].join(' \n ') }], [...asks, ...general])
    // ce qu'elle montre de la vitesse (ou du seuil) en général est une phrase chiffrée, et rien d'autre : une phrase sans
    // nombre la redirait (elle passe avant, ou ne se pose pas), mais un signe chiffré qui ne cite aucune de ses valeurs
    // (« enragé : 1,96 m/s, chasse dès 60 % », après le seuil normal du Gallu) reste un autre fait. Demander la
    // vitesse « en général » n'est pas l'avoir montrée sous toutes ses formes : sans cela, une question en nombres
    // écartait de la copie tous les signes chiffrés de la fiche (le Gallu, l'Obambo, la Dayan n'avaient aucun vrai ou faux)
    for (const k of general) b.shows.delete(k)
    for (const k of broad) b.shows.add(`${k}/V`)
    b.said.push(...told.map((t) => saidOf(t, true)))
    return b
  }
  for (const kind of ['san', 'spd'] as const) {
    const topic: QuizTopic = kind === 'san' ? 'sanity' : 'speed'
    const details = kind === 'san' ? x.huntSanity.details : x.speed.details
    for (const a of asksOf(kind, x)) {
      out.push({
        id: a.key,
        type: 'T1',
        topic,
        width: 4,
        group: kind,
        ...(a.weight < 1 ? { gate: kind === 'san' ? ('stdSan' as const) : ('stdSpd' as const) } : {}),
        make: (rng) => {
          const q = numberQuestion(a, ctxFor(x, all, rng))
          const lean = q && leanNumber(details, a.value, kind === 'san' ? '%' : 'm/s')
          return wrap(q && lean ? { ...q, explain: lean } : q)
        },
      })
    }
    out.push({
      id: `q:${kind === 'san' ? 'sansum' : 'spdsum'}:${x.id}`,
      type: 'T1',
      topic,
      width: 4,
      group: kind,
      // le résumé demande toutes les valeurs à la fois (« 1,0 m/s · 3,0 m/s en te détectant · … ») : posé d'abord, il ne
      // laisserait plus rien à demander sur la vitesse. Il passe après les valeurs que la fiche permet de demander une à une
      late: asksOf(kind, x).some((a) => a.weight >= 1),
      make: (rng) => {
        // la bonne réponse est le résumé de la fiche : le corrigé n'ajoute que sa première précision
        const q = summaryQuestion(kind, x, ctxFor(x, all, rng))
        return wrap(q && details.length ? { ...q, explain: details[0] } : q)
      },
    })
  }
  // la ligne de vue : son corrigé ne donne que ce qui la concerne, pour ne pas souffler une vitesse demandée ensuite
  const part = x.speed.summary.split(/\s+·\s+/u).find((p) => /ligne de vue/iu.test(p) && !/m\/s/u.test(p))
  const detail = x.speed.details.find((d) => /ligne de vue/iu.test(d))
  // la précision de la fiche redit toujours la réponse (« Pas d'accélération en ligne de vue : il sait… ») : elle suffit
  const about = detail ?? (part ? endSentence(cap(part)) : '')
  if (losAsked(x)) {
    out.push({
      id: `q:los:${x.id}`,
      type: 'T1',
      topic: 'speed',
      width: 2,
      group: 'los',
      gate: 'los',
      cls: x.speed.los ? 'yes' : 'no',
      make: () => {
        const q = losQuestion(x)
        return q && wrap(about ? { ...q, explain: about } : q)
      },
    })
  }
  return out
}

/* ---------- T2 : « Lequel de ces signes est celui de X ? » ---------- */

function signSeeds(x: Ghost, all: Ghost[]): Seed[] {
  if (x.id === MIMIC) return []
  const byId = new Map(all.map((o) => [o.id, o]))
  /** le corrigé dit de qui est chaque signe, sans rien montrer d'autre de la fiche */
  const wrap = (q: Question | null, full: string, cardId: string, key: boolean): Built | null => {
    if (!q) return null
    const right = q.choices.find((c) => q.correct.includes(c.id))!.label
    const others = q.choices.filter((c) => !q.correct.includes(c.id))
    const owners = others.map((c) => byId.get(c.id))
    if (owners.some((o) => !o)) return null
    const whole = right === full ? '' : `${NNBSP}: «${NNBSP}${full}${NNBSP}»`
    const explain = `C’est un signe ${de(x.name)}${whole}. Les trois autres sont, dans l’ordre, des signes ${listOf(owners.map((o) => de(o!.name)))}.`
    return built(
      { ...q, explain, cardId },
      'T2',
      [{ who: x.id, text: full, key }],
      others.map((c) => ({ who: c.id, text: c.label, key })),
    )
  }
  const out: Seed[] = x.keyTells.map((t, k) => ({
    id: `q:sign-of:${x.id}:${k}`,
    type: 'T2' as const,
    topic: 'behavior' as const,
    width: 4 as const,
    register: 'key',
    late: SPEED_OR_SANITY.test(t),
    pre: () => askKeys({ who: x.id, text: t, key: true }),
    make: (rng: Rng) => wrap(signOfGhost(x, ctxFor(x, all, rng), undefined, k), t, `g:${x.id}:tells`, true),
  }))
  // les signes « 0 preuve » rédigés en phrases, face à des phrases d'autres fiches
  const numbers = tellNumbers(x)
  const reverse = new Set(reverseTells(x, all).map((r) => r.k))
  for (const t of x.tells) {
    if (!t.zeroEvidence) continue
    const k = numbers.get(t)!
    const text = redact(withoutEvidenceAsides(t.text), x)
    out.push({
      id: `q:sign-of:${x.id}:t${k}`,
      type: 'T2',
      topic: 'behavior',
      width: 4,
      register: 'tell',
      late: true,
      pre: () => askKeys({ who: x.id, text }),
      make: (rng) => wrap(signOfGhost(x, ctxFor(x, all, rng), { text, k: `t${k}` }), text, reverse.has(k) ? `g:${x.id}:rev:${k}` : `g:${x.id}:tells`, false),
    })
  }
  return out
}

/* ---------- T3 : les tests de X ---------- */

function testSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const byId = new Map(all.map((o) => [o.id, o]))
  const out: Seed[] = []
  // T3a « Quel test confirme X sans preuve ? »
  zeroTests(x).forEach((t, p) => {
    const i = x.confirmationTests.findIndex((c) => c.text === t.text)
    const why = x.confirmationTests[i]?.why
    out.push({
      id: `q:test-of:${x.id}:${t.k}`,
      type: 'T3a',
      topic: 'zero',
      width: 4,
      pre: () => [`${x.id}#C${i}`],
      make: (rng) => {
        // aucune réponse ne nomme une autre entité (« un Revenant qui te détecte accélère aussi », dans la mise en garde d'un
        // test du Raiju) : la question porte sur X, et sur lui seul
        const q = whichTest(x, t, ctxFor(x, all, rng), p < TESTS_PER_GHOST ? `g:${x.id}:test:${t.k}` : `g:${x.id}:tells`, true)
        if (!q) return null
        const others = q.choices.filter((c) => !q.correct.includes(c.id))
        const owners = others.map((c) => byId.get(c.id))
        if (owners.some((o) => !o)) return null
        const explain = `C’est un test de confirmation ${de(x.name)}.${why ? ` ${why}` : ''} Les trois autres sont, dans l’ordre, des tests ${listOf(owners.map((o) => de(o!.name)))}.`
        const right = q.choices.find((c) => q.correct.includes(c.id))!.label
        return built(
          { ...q, explain },
          'T3a',
          [{ who: x.id, text: right, item: `${x.id}#C${i}`, aspect: 'ownProof' }],
          // les tests des autres fiches, et ce que le corrigé ajoute sur celui de X (`why`)
          [...others.map((c) => ({ who: c.id, text: c.label })), ...(why ? [{ who: x.id, text: why }] : [])],
        )
      },
    })
  })
  // T3b « Ce test suffit-il, à lui seul, à confirmer X ? » : sa conclusion retirée, c'est elle qu'on demande
  const cards = new Map(zeroTests(x).map((t, p) => [t.text, p < TESTS_PER_GHOST ? `g:${x.id}:test:${t.k}` : undefined]))
  for (const t of ownTests(x, all)) {
    if (t.body.length > QUOTE_MAX) continue
    const cardId = cards.get(t.text)
    out.push({
      id: `q:suffit:${x.id}:${t.i}`,
      type: 'T3b',
      topic: 'zero',
      width: 2,
      cls: t.definitive ? 'yes' : 'no',
      text: t.body,
      make: () => {
        const explain = `${t.definitive ? 'Oui, ce test suffit.' : 'Non, ce n’est qu’un indice.'} ${verdictOf(t.text, x)}${t.why ? ` ${t.why}` : ''}`
        return built(
          {
            id: `q:suffit:${x.id}:${t.i}`,
            topic: 'zero',
            ghostId: x.id,
            prompt: `Ce test suffit-il, à lui seul, à confirmer ${le(x.name)}${NNBSP}?`,
            quote: `${t.body}…`,
            multi: false,
            choices: [
              { id: SOLO_ANSWERS.enough.yes, label: 'Oui, ce test suffit' },
              { id: SOLO_ANSWERS.enough.no, label: 'Non, ce n’est qu’un indice' },
            ],
            correct: [t.definitive ? SOLO_ANSWERS.enough.yes : SOLO_ANSWERS.enough.no],
            explain,
            ...(cardId ? { cardId } : {}),
          },
          'T3b',
          [{ who: x.id, text: t.body, item: `${x.id}#C${t.i}`, aspect: t.definitive ? 'proof' : 'hint' }],
          // son corrigé cite la suite du test (« … bien plus rapide qu'un Djinn ou un Raiju (3,0 m/s au lieu de 2,5 m/s) ») :
          // une question qui demanderait cette valeur passe avant
          [{ who: x.id, text: explain }],
        )
      },
    })
  }
  return out
}

/* ---------- T4 : ce qui exclut X ---------- */

function exclusionSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const tests = ownTests(x, all)
  if (tests.length < 3) return []
  // les trois autres cas sont des tests de X lui-même : sa fiche dit qu'ils le désignent, pas qu'ils l'excluent
  const versions = (body: string) => {
    const short = conditionOf(body)
    return [body, withoutAsides(body), ...(short ? [short, withoutAsides(short)] : [])].filter((v, k, a) => a.indexOf(v) === k && (v.length >= 25 || v === body))
  }
  const pool: Option<OwnTest>[] = tests.flatMap((t) => versions(t.body).map((label) => ({ value: t, label })))
  const itself = plural(x) ? 'eux-mêmes' : isFeminine(x.name) ? 'elle-même' : 'lui-même'
  return ownEliminations(x, all).map((e) => ({
    id: `q:exclut:${x.id}:${e.i}`,
    type: 'T4' as const,
    topic: 'zero' as const,
    width: 4 as const,
    make: (rng: Rng) => {
      // quatre cas de même longueur, et le bon ne se remarque pas à sa forme (voir truthsAround)
      const around = truthsAround(rng, x, versions(e.body), pool)
      if (!around) return null
      const found = { right: around.right, wrong: around.truths }
      const q: Question = {
        id: `q:exclut:${x.id}:${e.i}`,
        topic: 'zero',
        ghostId: x.id,
        prompt: `Dans lequel de ces cas peux-tu exclure ${le(x.name)}${NNBSP}?`,
        multi: false,
        choices: shuffle(rng, [{ id: 'excludes', label: found.right }, ...found.wrong.map((o) => ({ id: `test:${o.value.i}`, label: o.label }))]),
        correct: ['excludes'],
        explain: `${e.text} Les trois autres cas viennent des tests ${de(x.name)} ${itself}${NNBSP}: ils ne ${themElided(x)}excluent pas.`,
      }
      return built(
        q,
        'T4',
        [{ who: x.id, text: e.body, item: `${x.id}#E${e.i}` }],
        // les trois tests de X, et le test d'élimination entier que cite le corrigé
        [...found.wrong.map((o) => ({ who: x.id, text: o.value.body, item: `${x.id}#C${o.value.i}` })), { who: x.id, text: e.text }],
      )
    },
  }))
}

/* ---------- les signes de X et ceux, faux pour lui, des entités qu'on confond avec lui ---------- */

const STYLES: readonly SignStyle[] = ['key', 'tell']
const letter = (style: SignStyle) => (style === 'key' ? 'K' : 'T')

/** Le rang d'un signe dans sa fiche (signes clés), ou son numéro de carte (phrases « 0 preuve »). */
function signRank(s: Sign, style: SignStyle): number {
  if (style === 'key') return s.ghost.keyTells.indexOf(s.text)
  const numbers = tellNumbers(s.ghost)
  const t = s.ghost.tells.find((t) => t.zeroEvidence && redact(withoutEvidenceAsides(t.text), s.ghost) === s.text)
  return t ? numbers.get(t)! : -1
}

/**
 * Les signes de x qui se citent tels quels (ni preuve, ni nom d'entité, ni genre) : les mêmes filtres que ceux des
 * autres fiches. Un signe clé un peu long, ou qui dit « ce joueur » après l'avoir présenté, reste un signe de x.
 */
function ownSigns(x: Ghost, all: Ghost[], style: SignStyle): Sign[] {
  const listed = distractorSigns(all, style).filter((s) => s.ghost.id === x.id)
  if (style !== 'key') return listed
  const have = new Set(listed.map((s) => s.text))
  const alone = (t: string) => {
    const at = t.search(/(?<!\p{L})ce joueur(?!\p{L})/u)
    return !/^Chasse suivante(?!\p{L})/u.test(t) && (at < 0 || /joueur/u.test(t.slice(0, at)))
  }
  return x.keyTells
    .filter((t) => have.has(t) || (plainSign(t) && !GENDER_TALK.test(t) && t.length <= 200 && !namesAny(t, all) && alone(t)))
    .map((t) => listed.find((s) => s.text === t) ?? { text: t, ghost: x, themes: themesOf(t) })
}

/**
 * Les signes des entités qu'on confond avec x qui sont faux pour lui : ils ne touchent aucun thème de ses signes,
 * ne conviennent en rien à sa fiche (signVersions), et ni un pronom ni un accord ne les écarte d'emblée.
 */
function falseSigns(x: Ghost, all: Ghost[], style: SignStyle): Option<Sign>[] {
  const near = new Set(rivalsOf(x, all).map((o) => o.id))
  if (!near.size) return []
  // signVersions écarte déjà ce qui convient à x, même en partie, ou de trop près (« 1,5 ou 1,9 m/s », les Jumeaux, face
  // à l'Aswang, à 1,53 m/s), et les signes vrais de toutes les entités (voir TRUE_OF_ALL)
  return signVersions(x, all, style).filter((o) => near.has(o.value.ghost.id) && !pronounClash(o.label, x) && agrees(o.label, o.value.ghost, x) && !nearSpeed(o.label, x))
}

/* ---------- T5 : l'intrus ---------- */

/** Un mot porteur que toutes ces phrases contiennent, et pas `other`. */
function sharedWithout(labels: readonly string[], other: string): boolean {
  const [first, ...rest] = labels.map(gist)
  const mine = gist(other)
  for (const w of first) if (!mine.has(w) && rest.every((r) => r.has(w))) return true
  return false
}

/**
 * Trois signes différents de x de même longueur que l'intrus (l'une de ses versions), tels que l'intrus ne se
 * remarque pas : quatre réponses de même forme (homogeneous), l'intrus ni le seul à porter une marque (un chiffre,
 * une parenthèse…), ni le seul à ne pas en porter une, ni le seul à ne pas contenir le mot que souffle le nom de x,
 * ou un mot que les trois autres partagent. Le nombre de signes plus longs que lui se tire :
 * il n'est ni toujours le plus long, ni toujours le plus court.
 */
function truthsAround<T>(rng: Rng, x: Ghost, intruders: readonly string[], pool: readonly Option<T>[]): { right: string; truths: Option<T>[] } | null {
  const mixed = shuffle(rng, pool)
  for (const wanted of shuffle(rng, [0, 1, 2, 3])) {
    for (const right of intruders) {
      const near = mixed.filter((o) => closeLengths(Math.min(o.label.length, right.length), Math.max(o.label.length, right.length)))
      for (let a = 0; a < near.length; a++) {
        for (let b = a + 1; b < near.length; b++) {
          if (near[b].value === near[a].value) continue
          for (let c = b + 1; c < near.length; c++) {
            if (near[c].value === near[a].value || near[c].value === near[b].value) continue
            const truths = [near[a], near[b], near[c]]
            const labels = truths.map((o) => o.label)
            const lens = [right, ...labels].map((l) => l.length)
            if (labels.filter((l) => l.length > right.length).length !== wanted || !closeLengths(Math.min(...lens), Math.max(...lens))) continue
            if (standsOut(right, labels) || (labels.every((l) => hints(x, l)) && !hints(x, right))) continue
            // quatre réponses de même forme (voir homogeneous), et aucun mot que les trois phrases de X partagent sans
            // l'intrus (« lumière », trois fois, pour le Cauchemar) : l'intrus se trouverait sans rien savoir
            if (!homogeneous([right, ...labels]) || sharedWithout(labels, right)) continue
            return { right, truths }
          }
        }
      }
    }
  }
  return null
}

function intruderSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const out: Seed[] = []
  for (const style of STYLES) {
    const own = ownSigns(x, all, style)
    if (own.length < 3) continue
    const pool: Option<Sign>[] = own.flatMap((s) => [s.text, ...shortened(s.text).filter((v) => keepsSense(s.text, v))].map((label) => ({ value: s, label })))
    const bySign = new Map<Sign, string[]>()
    for (const o of falseSigns(x, all, style)) bySign.set(o.value, [...(bySign.get(o.value) ?? []), o.label])
    for (const [sign, labels] of bySign) {
      const y = sign.ghost
      const id = `q:intrus:${x.id}:${y.id}:${letter(style)}${signRank(sign, style)}`
      out.push({
        id,
        type: 'T5',
        topic: 'behavior',
        width: 4,
        register: style,
        foreign: true,
        pre: () => askKeys({ who: y.id, text: sign.text, key: style === 'key' }),
        make: (rng) => {
          const found = truthsAround(rng, x, labels, pool)
          if (!found) return null
          const q: Question = {
            id,
            topic: 'behavior',
            ghostId: x.id,
            prompt: `Une seule de ces affirmations est fausse pour ${le(x.name)}. Laquelle${NNBSP}?`,
            multi: false,
            choices: shuffle(rng, [{ id: y.id, label: found.right }, ...found.truths.map((o, k) => ({ id: `own:${k}`, label: o.label }))]),
            correct: [y.id],
            explain: `«${NNBSP}${sign.text}${NNBSP}» est un signe ${de(y.name)}, pas ${de(x.name)}. Les trois autres sont bien ${plural(x) ? 'leurs' : 'ses'} signes.`,
            cardId: `g:${x.id}:tells`,
          }
          const key = style === 'key'
          const truths = found.truths.map((o) => ({ who: x.id, text: o.value.text, key }))
          // les trois signes de X sont jugés eux aussi : un seul au plus est connu par une autre question de la copie
          return { ...built(q, 'T5', [{ who: y.id, text: sign.text, key }], truths), truths: truths.map(askKeys) }
        },
      })
    }
  }
  return out
}

/* ---------- ce que les fiches disent pour départager X d'une entité proche ---------- */

/** Une phrase de départage : l'entité qu'elle décrit (z), la fiche qui la dit (y), et la phrase où z laisse sa place au sujet. */
interface NearClaim {
  y: Ghost
  z: Ghost
  /** la phrase qui nomme l'entité de la question à la place de z */
  label: string
  explain: string
}

/** Ce que la fiche de `host` dit de l'entité z qu'on confond avec lui, qui est faux pour `host` (voir wrongClaimsFor). */
function claimsAbout(host: Ghost, z: Ghost, all: Ghost[]): NearClaim[] {
  const pair = host.confusions.find((c) => c.with === z.id)
  if (!pair) return []
  const explain = noLeadingMais(confusionWithoutEvidence(pair.why))
  const seen = new Set<string>()
  return wrongClaimsFor(host, all)
    .filter((c) => c.y.id === host.id && c.z.id === z.id && !nearSpeed(c.text, host))
    .filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)))
    .map((c) => ({ y: c.y, z: c.z, label: c.label, explain }))
}

/** « Idée reçue : … », « Bug connu : … », « Cette faiblesse… » : une ligne qui ne se juge pas seule en vrai ou faux. */
const NOT_A_STATEMENT = /^(?:Idée reçue|Bug connu|Bizarrerie|Contrairement|Ciblage|Règles? générales?|Ce(?:t|tte|s)?\s)/u

/**
 * Les comportements et les capacités de la fiche de x qui se citent tels quels, comme ses signes « 0 preuve » (les
 * mêmes filtres que distractorSigns : ni preuve, ni nom d'entité, ni genre, ni phrase vraie de toutes les entités) :
 * des affirmations vraies de plus pour « Vrai ou faux pour X ? ». `tag` : B ou A, et le rang de la ligne dans la fiche.
 */
const ownLines = memo((x, all): { tag: string; text: string }[] =>
  (
    [
      ['B', x.behaviors],
      ['A', x.abilities],
    ] as const
  ).flatMap(([letter, lines]) =>
    lines.flatMap((l, i) => {
      if (!l.zeroEvidence) return []
      const text = redact(withoutEvidenceAsides(l.text), x)
      const fits = !REDACTED.test(text) && plainSign(text) && !GENDER_TALK.test(text) && !NEEDS_CONTEXT.test(text) && !TRUE_OF_ALL.test(text) && !NOT_A_STATEMENT.test(text) && text.length <= 200 && !namesAny(text, all)
      return fits ? [{ tag: `${letter}${i}`, text }] : []
    }),
  ),
)

/* ---------- T6 : vrai ou faux ---------- */

/** Un pronom qui renverrait au sujet retiré (« … alors qu'elle est dans la même pièce »), ou l'entité nommée une seconde fois. */
const SUBJECT_AGAIN = /(?<!\p{L})(?:elles?|ils?|l[’']entité)(?!\p{L})/iu
/**
 * La condition d'un test d'élimination, dite comme un signe de la fiche : « L'entité rallume le disjoncteur. »
 * devient « Rallume le disjoncteur. », de la même forme que « Ne peut pas rallumer le disjoncteur. » (un signe
 * du Hantu). Seulement une phrase seule qui s'ouvre sur « L'entité » et ne la reprend pas ensuite ; les autres
 * restent des scènes (« Tu entends l'entité entre 12 m et 20 m de toi pendant une chasse. »).
 */
function asSign(scene: string): string {
  const m = /^L[’']entité\s+(\p{Ll}[^.!?]*[.!?]?)$/u.exec(scene)
  return m && !SUBJECT_AGAIN.test(m[1]) ? cap(m[1]) : scene
}
/**
 * La tournure d'une affirmation jugée en vrai ou faux : un signe écrit sans sujet (« Ne rallume jamais le
 * disjoncteur »), une phrase qui s'ouvre sur « L'entité », ou une scène (elle parle de l'entité, ou s'adresse au
 * joueur). Un « Vrai » et un « Faux » tirés de la fiche de X ne s'apparient que dans la même tournure.
 */
const SCENE_LIKE = /l[’']entité|(?<!\p{L})(?:tu|toi|ton|ta|tes|t[’'])(?!\p{L})/iu
const formOf = (text: string) => (/^L[’']entité(?!\p{L})/u.test(text) ? 'led' : SCENE_LIKE.test(text) ? 'scene' : 'sign')
/** Deux citations de longueur voisine (voir closeLengths) : la longueur ne dit pas laquelle des deux est posée. */
const sameSize = (a: string, b: string) => closeLengths(Math.min(a.length, b.length), Math.max(a.length, b.length))

const TRUE_FALSE = [
  { id: SOLO_ANSWERS.trueFalse.true, label: 'Vrai' },
  { id: SOLO_ANSWERS.trueFalse.false, label: 'Faux' },
]

function trueFalseSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const out: Seed[] = []
  const about = `Vrai ou faux pour ${le(x.name)}${NNBSP}?`
  // Ce que la fiche de X dit elle-même faux pour lui : ses tests d'élimination (« si l'entité rallume le
  // disjoncteur, ce n'est pas un Hantu » : un Hantu ne le rallume jamais). Le corrigé est la ligne de la fiche, mot
  // pour mot. Chacun se pose face à une affirmation vraie de la même fiche, de même forme et de même longueur (voir
  // l'emplacement `own` de la copie) : ses observations (`scene`), ses signes, ses comportements.
  // Seulement une condition qui tient en une phrase : précédée de sa mise en place (« Place des détecteurs de
  // mouvement aux entrées de la pièce et encense l'entité. Elle quitte la pièce avant 90 s. »), elle se lirait comme
  // une consigne, pas comme une affirmation à juger
  const eliminations = ownEliminations(x, all).flatMap((e) => {
    const scene = sceneOfTest(e.body, x, all)
    return scene && scene.split(SENTENCES).length === 1 ? [{ ...e, quote: asSign(scene) }] : []
  })
  // (sans test d'élimination à leur opposer, ses observations ne se jugent pas en vrai ou faux : « Vrai » sortirait toujours)
  for (const o of eliminations.length ? ownScenes(x, all) : []) {
    const id = `q:vf:${x.id}:${x.id}:O${o.i}`
    out.push({
      id,
      type: 'T6',
      topic: 'behavior',
      width: 2,
      cls: 'true',
      register: 'scene',
      text: o.quote,
      make: () =>
        built(
          { id, topic: 'behavior', ghostId: x.id, prompt: about, quote: o.quote, multi: false, choices: TRUE_FALSE, correct: [SOLO_ANSWERS.trueFalse.true], explain: `Vrai. C’est l’une des observations de la fiche ${de(x.name)}.`, cardId: `g:${x.id}:tells` },
          'T6',
          [{ who: x.id, text: o.text, item: `${x.id}#O${o.i}` }],
        ),
    })
  }
  for (const e of eliminations) {
    const quote = e.quote
    const id = `q:vf:${x.id}:${x.id}:E${e.i}`
    out.push({
      id,
      type: 'T6',
      topic: 'behavior',
      width: 2,
      cls: 'false',
      register: 'own',
      text: quote,
      make: () =>
        built(
          { id, topic: 'behavior', ghostId: x.id, prompt: about, quote, multi: false, choices: TRUE_FALSE, correct: [SOLO_ANSWERS.trueFalse.false], explain: `Faux. ${e.text}` },
          'T6',
          [{ who: x.id, text: e.body, item: `${x.id}#E${e.i}` }],
          // le test d'élimination entier, que cite le corrigé
          [{ who: x.id, text: e.text }],
        ),
    })
  }
  const seed = (id: string, register: string, truth: boolean, prompt: string, quote: string, explain: string, asked: Stmt, topic: QuizTopic, cardId?: string, shown: Stmt[] = []) =>
    out.push({
      id,
      type: 'T6',
      topic,
      width: 2,
      cls: truth ? 'true' : 'false',
      register,
      text: quote,
      // ces vrai ou faux tirent leurs « Faux » de la fiche d'une entité proche (voir FOREIGN_EVERY)
      foreign: !truth,
      make: () =>
        built(
          { id, topic, ghostId: x.id, prompt, quote, multi: false, choices: TRUE_FALSE, correct: [truth ? SOLO_ANSWERS.trueFalse.true : SOLO_ANSWERS.trueFalse.false], explain, ...(cardId ? { cardId } : {}) },
          'T6',
          [asked],
          shown,
        ),
    })
  for (const style of STYLES) {
    const own = ownSigns(x, all, style)
    // d'autres phrases de la fiche de X, écrites comme ses signes « 0 preuve » : ses comportements, ses capacités
    const more = style === 'tell' ? ownLines(x, all).filter((l) => !own.some((o) => lineKey(x.id, o.text) === lineKey(x.id, l.text))) : []
    // les deux réponses d'un tirage viennent de la même sorte de phrases, sinon la forme dirait la réponse : sans
    // « Vrai » de cette sorte, aucun « Faux » (le Revenant, la Dayan : aucune phrase rédigée à juger) ; sans « Faux »
    // de cette sorte, ces « Vrai » ne servent que face à un test d'élimination de X (voir `own`) ; et sans l'un ni
    // l'autre, rien ne se juge (le Mimic, qui copie : rien d'une autre fiche n'est faux pour lui, et son test
    // d'élimination ne se dit pas en une phrase)
    const wrong = own.length + more.length ? falseSigns(x, all, style).filter((o) => o.label === o.value.text) : []
    if (!wrong.length && !eliminations.length) continue
    const source = style === 'key' ? `C’est l’un des signes clés ${de(x.name)}.` : `C’est écrit sur la fiche ${de(x.name)}.`
    for (const s of own) {
      seed(`q:vf:${x.id}:${x.id}:${letter(style)}${signRank(s, style)}`, style, true, about, s.text, `Vrai. ${source}`, { who: x.id, text: s.text, key: style === 'key' }, 'behavior', `g:${x.id}:tells`)
    }
    for (const l of more) seed(`q:vf:${x.id}:${x.id}:${l.tag}`, style, true, about, l.text, `Vrai. ${source}`, { who: x.id, text: l.text }, 'behavior', `g:${x.id}:tells`)
    for (const o of wrong) {
      const y = o.value.ghost
      seed(`q:vf:${x.id}:${y.id}:${letter(style)}${signRank(o.value, style)}`, style, false, about, o.label, `Faux. C’est un signe ${de(y.name)}, pas ${de(x.name)}.`, { who: y.id, text: o.label, key: style === 'key' }, 'behavior', `g:${x.id}:tells`)
    }
  }
  if (x.id === MIMIC) return out
  // les phrases de départage : ce qu'une fiche proche dit de X (vrai), ce que la fiche de X dit d'une entité proche (faux pour X)
  const truths = plural(x) ? [] : duelsFor(x, all)
  const lies = rivalsOf(x, all).flatMap((z) => claimsAbout(x, z, all).slice(0, 1))
  if (truths.length && lies.length) {
    for (const d of truths) {
      // la fiche ne dit rien de plus que la phrase jugée : le corrigé dit d'où elle vient, sans la redire
      const source = restates(d.explain, d.rights[0]) ? `C’est ce que la fiche ${de(d.x.name)} dit ${de(x.name)}.` : d.explain
      seed(`q:vf:${x.id}:${x.id}:L${d.x.id}`, 'claim', true, `Vrai ou faux${NNBSP}?`, d.rights[0], `Vrai. ${source}`, { who: x.id, text: d.rights[0] }, 'zero', undefined, [
        { who: x.id, text: d.explain },
        { who: d.x.id, text: d.explain },
      ])
    }
    for (const c of lies) {
      // un corrigé qui nomme déjà l'entité dont on parlait (« Le Spectre ne perturbe jamais le sel ; l'Esprit le perturbe ») se suffit
      const source = restates(c.explain, c.label) ? `C’est ce que la fiche ${de(x.name)} dit ${de(c.z.name)}.` : namesGhost(c.explain, c.z) ? c.explain : `${itIs(c.z)}. ${c.explain}`
      seed(`q:vf:${x.id}:${c.z.id}:L${x.id}`, 'claim', false, `Vrai ou faux${NNBSP}?`, c.label, `Faux. ${source}`, { who: c.z.id, text: c.label, item: `${x.id}>${c.z.id}` }, 'zero', undefined, [
        { who: x.id, text: c.explain },
        { who: c.z.id, text: c.explain },
      ])
    }
  }
  return out
}

/* ---------- T7 : X face à une entité qu'on confond avec lui ---------- */

function duelSeeds(x: Ghost, all: Ghost[]): Seed[] {
  if (x.id === MIMIC) return []
  const out: Seed[] = []
  const near = rivalsOf(x, all)
  const byId = new Map(all.map((o) => [o.id, o]))
  /**
   * Le départage du quiz, entre X et Y seulement : « à quoi reconnais-tu X plutôt que Y ? ». La bonne réponse parle
   * de X ; jamais posé à l'envers (voir LADDER).
   */
  const duel = (other: Ghost): Seed => ({
    id: `q:dist:${other.id}:${x.id}`,
    type: 'T7a',
    topic: 'zero',
    width: 4,
    cls: 'x',
    pre: () => [`${x.id}|départage`],
    make: (rng) => {
      const made = duelQuestion(x, ctxFor(x, all, rng), other)
      if (!made) return null
      const { cardId: _card, ...rest } = made
      const owners = made.choices.filter((c) => !made.correct.includes(c.id)).map((c) => byId.get(c.id))
      // le corrigé du quiz (ce que la fiche dit pour les départager), et de qui parlent les trois autres réponses
      const right = made.choices.find((c) => made.correct.includes(c.id))!.label
      // la fiche ne dit rien de plus que la bonne réponse : le corrigé dit d'où elle vient, sans la redire
      const source = restates(made.explain, right) ? `C’est ce que la fiche ${de(other.name)} dit ${de(x.name)}.` : made.explain
      const explain = owners.every((o) => o) ? `${source} Les trois autres réponses décrivent, dans l’ordre, ${listOf(owners.map((o) => le(o!.name)))}.` : source
      const q: Question = { ...rest, explain, ghostId: x.id, cardId: `g:${x.id}:tells` }
      return built(
        q,
        'T7a',
        [{ who: x.id, text: right }],
        [
          { who: x.id, text: q.explain },
          { who: other.id, text: q.explain },
          ...q.choices.filter((c) => !q.correct.includes(c.id)).map((c) => ({ who: c.id, text: c.label })),
        ],
        // deux départages d'une même entité citent le plus souvent le même trait
        [`${x.id}|départage`],
      )
    },
  })
  if (!plural(x)) for (const d of duelsFor(x, all)) if (near.some((o) => o.id === d.x.id)) out.push(duel(d.x))
  return out
}

/* ---------- T8 : « Tu observes ceci. Est-ce que ça suffit pour confirmer X ? » ---------- */

/** La même scène, dite avec les mêmes mots (voir sameSaid) ? */
const echoes = (a: string, b: string) => sameSaid({ who: '', words: gist(a), worth: [] }, { who: '', words: gist(b), worth: [] })

/** « Est-ce que ça suffit ? » : les deux réponses, pour un test (T3b) comme pour une observation (T8). */
const ENOUGH = [SOLO_ANSWERS.enough.yes, SOLO_ANSWERS.enough.no] as const

/**
 * Les rapports de terrain de la fiche de X, et eux seuls : ce qu'on observe avec X suffit-il à le confirmer ? Deux
 * réponses, celles de « ce test suffit-il ? » : « Oui, ça suffit » pour un rapport que la fiche dit décisif, « Non,
 * ce n'est qu'un indice » pour les autres. La troisième réponse d'avant (« Non, ça l'exclut ») ne valait que pour
 * les scènes tirées de la fiche d'une entité proche, qui ne se posent plus : sans elles, elle n'était juste que
 * 7 fois sur 100. Les tests de la fiche dits comme une scène se lisaient comme des consignes (« Place du sel… ») :
 * ils se demandent sous leur forme de test (T3b). Les tests d'élimination de X sont jugés en vrai ou faux (T6).
 */
function observationSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const out: Seed[] = []
  const choices = [
    { id: SOLO_ANSWERS.enough.yes, label: 'Oui, ça suffit' },
    { id: SOLO_ANSWERS.enough.no, label: 'Non, ce n’est qu’un indice' },
  ]
  const decisive = [...x.confirmationTests.filter((t) => t.definitive).map((t) => t.text), ...x.observations.filter((o) => o.strength === 'definitive').map((o) => o.text)]
  for (const o of ownScenes(x, all)) {
    // « ça ne suffit pas » ne se dit jamais d'une scène qu'un test décisif de la même fiche décrit avec d'autres mots
    // (« ton coéquipier se retrouve au contact de l'entité et survit », un indice fort de la Banshee ; « ceux-ci peuvent
    // la toucher sans mourir, c'est une Banshee », son test) : la copie enseignerait les deux verdicts. Les mots ne
    // suffisent pas à reconnaître ces paires. Un indice fort ne se pose donc que sur une fiche où rien n'est décisif ;
    // un simple indice, que s'il ne reprend les mots d'aucun test ou rapport décisif.
    if (o.strength === 'strong' && decisive.length) continue
    if (o.strength === 'hint' && decisive.some((d) => echoes(o.text, d))) continue
    const sure = o.strength === 'definitive'
    const id = `q:constat:${x.id}:${x.id}:O${o.i}`
    const why = o.why ? ` ${o.why}` : ''
    const explain = sure
      ? `Oui, ça suffit${NNBSP}: sur la fiche ${de(x.name)}, cette observation est décisive.${why}`
      : `Non${NNBSP}: sur la fiche ${de(x.name)}, c’est un ${o.strength === 'strong' ? 'indice fort' : 'simple indice'}, pas une confirmation.${why}`
    const asked: Stmt = { who: x.id, text: o.text, item: `${x.id}#O${o.i}`, aspect: sure ? 'proof' : 'hint' }
    out.push({
      id,
      type: 'T8',
      topic: 'behavior',
      width: 2,
      cls: sure ? SOLO_ANSWERS.enough.yes : SOLO_ANSWERS.enough.no,
      text: o.quote,
      make: () =>
        built(
          {
            id,
            topic: 'behavior',
            ghostId: x.id,
            prompt: `Tu observes ceci. Est-ce que ça suffit pour confirmer ${le(x.name)}${NNBSP}?`,
            quote: o.quote,
            multi: false,
            choices,
            correct: [sure ? SOLO_ANSWERS.enough.yes : SOLO_ANSWERS.enough.no],
            explain,
            cardId: `g:${x.id}:tells`,
          },
          'T8',
          [asked],
          [{ who: x.id, text: explain }],
        ),
    })
  }
  return out
}

/** Les deux « est-ce que ça suffit ? » : sur un test de la fiche (T3b), sur l'une de ses observations (T8). */
const WORTH = ['T3b', 'T8'] as const
type Worth = (typeof WORTH)[number]
/**
 * Une entité qui n'a qu'une réponse possible à l'une de ces questions (tous ses tests suffisent, ou aucun ; aucune de
 * ses observations n'est décisive) : la part des copies où elle la pose. Pour les tests, neuf fiches n'ont que des
 * tests définitifs et deux n'en ont aucun : les premières posent la question deux copies sur dix, les secondes six
 * sur dix, pour qu'au fil des copies « Oui » sorte autant que « Non ». Pour les observations, six fiches n'ont rien
 * de décisif et une n'a que cela : elles posent la question dans toute copie, et ce sont les fiches à deux réponses
 * qui compensent (voir worthPlan). Une fiche qui n'a qu'une réponse aux deux questions (les Jumeaux, le Kormos :
 * « Non » aux tests comme aux observations) n'en pose qu'une des deux par copie (voir addWorth), donc chacune moins
 * souvent que sa part. Mesuré sur 1 200 copies : 51 % de « Oui » aux tests, 46 % aux observations (50 % sur les 900
 * copies du verrou, dont une sur deux est un « Encore 10 »).
 */
const ONE_SIDED = { T3b: { yes: 0.2, no: 0.6 }, T8: { yes: 1, no: 1 } } as const

/**
 * Deux citations « de longueur voisine » : moins de trente caractères d'écart, et d'autant plus voisines que l'écart
 * est petit. Sur les fiches, un fait décisif se décrit en détail (ses conditions, sa suite) et un simple indice tient
 * en une ligne : sans précaution, qui répondrait « Oui » aux longues observations et « Non » aux courtes gagnerait
 * deux fois sur trois (mesuré sur 2 700 copies avant ce réglage : 68 %).
 */
const NEAR = 30
const nearness = (a: number, b: number) => Math.max(0, 1 - Math.abs(a - b) / NEAR)
/**
 * Ce que l'équilibre par longueur ne retire jamais (voir worthPlan) : une fiche qui a les deux réponses pose chacune
 * au moins une fois sur quatre. Sur une fiche qui a des tests décisifs et d'autres non, on demande les uns et les
 * autres.
 */
const BOTH = 0.25

/**
 * Les « est-ce que ça suffit ? » qui ne se posent pas : une citation qu'aucune citation de l'autre réponse n'approche
 * en longueur, toutes fiches confondues (deux observations décisives de plus de 220 caractères, quand aucun simple
 * indice n'en fait 200 ; deux simples indices de 50 caractères au plus, quand aucune observation décisive n'en fait
 * moins de 85 ; un test de 325 caractères qui ne suffit pas). Sa longueur dirait sa réponse ; ce qu'elle décrit se
 * demande autrement (le test de la même fiche, ses signes, ses questions rédigées). Sauf si elle est la seule de sa réponse sur sa fiche (l'observation décisive du Revenant, du
 * Mimic, de l'Onryo, de l'Obambo) : la fiche ne poserait plus que l'autre réponse, comme si rien n'y était décisif.
 * Celle-là reste, et sa réponse se pose le moins souvent possible (voir BOTH).
 */
const unmatched = memoList((all): ReadonlySet<string> => {
  const out = new Set<string>()
  for (const type of WORTH) {
    const fiches = all.map((g) => everySeed(g, all).filter((s) => s.type === type))
    const quotes = fiches.flat()
    for (const mine of fiches) {
      for (const q of mine) {
        const alone = !mine.some((o) => o !== q && o.cls === q.cls)
        if (!alone && !quotes.some((o) => o.cls !== q.cls && nearness(q.text!.length, o.text!.length) > 0)) out.add(q.id)
      }
    }
  }
  return out
})

/**
 * « Est-ce que ça suffit ? » a deux énoncés : « Ce test suffit-il… ? » (T3b) et « Tu observes ceci… » (T8). Chacun
 * s'équilibre seul : les tests des fiches sont presque tous définitifs, leurs observations presque toutes de simples
 * indices, et qui répondrait « Oui » aux tests et « Non » aux observations gagnerait deux fois sur trois si les deux
 * se compensaient l'un l'autre (mesuré : 70 % de « Oui » aux tests, 36 % aux observations).
 *
 * Pour chaque énoncé, les chances de chaque réponse sur chaque fiche, choisies ensemble pour qu'au fil des copies, à
 * longueur voisine, « Oui » sorte autant que « Non » : ni la réponse, ni la longueur de la citation ne doivent rapporter
 * à qui ne sait rien. Bien des fiches n'ont rien de décisif (le Yurei, le Kormos, les Jumeaux : toujours « Non ») et
 * d'autres n'ont que cela : ce sont les autres fiches qui compensent, et d'abord celles dont les citations ont la
 * longueur qui manque à une réponse (une fiche dont l'observation décisive est courte pose plus souvent « Oui », une
 * fiche dont elle est longue plus souvent « Non »). Le calcul : à chaque tour, une réponse gagne des chances sur une
 * fiche si, parmi les citations de longueur voisine de toutes les fiches, l'autre réponse se pose plus souvent que
 * la sienne, et en perd dans le cas contraire ; puis les chances des deux réponses d'une fiche sont ramenées à un
 * total de 1 (la même idée que balancedRanks, quiz.ts, par longueur au lieu de par rang). Les citations d'une même
 * réponse gardent des chances égales : toutes se posent au fil des copies.
 *
 * Mesuré sur 2 700 copies : au pire seuil de longueur, « Oui » aux longues citations gagne encore 63 fois sur 100
 * aux observations (68 avant ce plan). Aux tests, rien de mesurable ne change (60 fois sur 100, 62 avant) : leurs
 * tests définitifs ne sont pas plus longs que les autres, et peu de fiches ont les deux. Le reste tient aux fiches
 * (une observation décisive se décrit plus longuement qu'un simple indice) et à ce que le calcul suppose : que
 * chaque fiche pose la question une fois par copie, alors qu'elle la pose de 0,4 à 1,8 fois selon ce que le reste
 * de la copie laisse à demander, et plus souvent quand elle penche vers « Non » (après un « Non », il lui reste de
 * quoi poser les deux réponses). C'est aussi pourquoi « Non » sort un peu plus que « Oui » aux observations (53 fois
 * sur 100 sur ces 2 700 copies). Donner en plus à chaque citation ses propres chances (les plus longues pour
 * « Non », les plus courtes pour « Oui ») ne rapportait rien de sûr, et la même citation revenait alors six fois sur
 * dix sur certaines fiches.
 *
 * `plan` : pour chaque entité et chaque énoncé, ses réponses possibles et leurs chances. La question ne se pose que
 * si chacune des réponses possibles pour X a de quoi se poser à cet instant, et une seule fois par copie quand X n'en
 * a qu'une (voir addWorth) : sans cela, la réponse la plus facile à composer sortirait plus souvent que l'autre.
 */
const worthPlan = memoList((all) => {
  const plan = new Map<string, { cls: string; weight: number }[]>()
  const rows: { id: string; type: Worth; who: string; answer: string; length: number; share: number; odds: number }[] = []
  for (const type of WORTH) {
    const fiches = all.flatMap((g) => {
      const mine = seedsFor(g, all).filter((s) => s.type === type)
      if (!mine.length) return []
      const classes = ENOUGH.filter((c) => mine.some((s) => s.cls === c))
      // la part des copies où l'entité pose la question : toutes, sauf si elle n'a qu'une réponse possible
      const share = classes.length === 1 ? ONE_SIDED[type][classes[0]] : 1
      return [{ who: g.id, classes, quotes: mine.map((s) => ({ id: s.id, cls: s.cls!, length: s.text!.length, share, p: 1 / mine.length })) }]
    })
    const quotes = fiches.flatMap((f) => f.quotes)
    for (let step = 0; step < 200; step++) {
      const next = quotes.map((q) => {
        let same = 0
        let other = 0
        for (const o of quotes) {
          const k = nearness(q.length, o.length) * o.share * o.p
          if (o.cls === q.cls) same += k
          else other += k
        }
        // (la racine : un pas prudent, pour que les chances ne balancent pas d'un tour à l'autre)
        return q.p * Math.sqrt(other / same)
      })
      quotes.forEach((q, i) => (q.p = next[i]))
      for (const f of fiches) {
        const sum = f.quotes.reduce((n, q) => n + q.p, 0)
        for (const cls of f.classes) {
          const mine = f.quotes.filter((q) => q.cls === cls)
          // les chances de cette réponse sur la fiche : jamais moins d'une fois sur quatre quand la fiche a les deux
          const weight = f.classes.length < 2 ? 1 : Math.min(1 - BOTH, Math.max(BOTH, mine.reduce((n, q) => n + q.p, 0) / sum))
          // et des chances égales entre ses citations
          for (const q of mine) q.p = weight / mine.length
        }
      }
    }
    for (const f of fiches) {
      plan.set(`${f.who}|${type}`, f.classes.map((cls) => ({ cls: cls as string, weight: f.quotes.reduce((n, q) => n + (q.cls === cls ? q.p : 0), 0) })))
      for (const q of f.quotes) rows.push({ id: q.id, type, who: f.who, answer: q.cls, length: q.length, share: q.share, odds: q.p })
    }
  }
  return { plan, rows }
})

/**
 * Le plan des « est-ce que ça suffit ? » (voir worthPlan), pour le relire et le vérifier : chaque citation qui peut se
 * poser, sa réponse, sa longueur, la part des copies où son entité pose la question (`share`) et ses chances d'être
 * la citation posée (`odds` : les chances de sa réponse, partagées entre les citations de cette réponse ; leur total
 * vaut 1 par entité et par énoncé).
 */
export function soloWorthPlan(all: Ghost[]): { id: string; type: 'T3b' | 'T8'; who: string; answer: string; length: number; share: number; odds: number }[] {
  return worthPlan(all).rows
}

/* ---------- questions rédigées de la fiche ---------- */

/** Au-delà, une phrase de contexte n'est plus courte : le corrigé s'en tient au fait demandé. */
const CONTEXT_MAX = 140

/**
 * Le corrigé d'une question rédigée, dans une copie sur une seule entité : sa première phrase (le fait demandé), et
 * la suivante si elle est courte et ne parle que de X. La fiche explique souvent ensuite pourquoi les autres
 * réponses étaient fausses (« 1,7 m/s est la vitesse standard, 1,4 m/s celle d'un Hantu au chaud… ») : dans une
 * copie sur X, ce sont les nombres d'autres entités, et chaque valeur de X ainsi récitée ne pouvait plus se
 * demander. Aucune phrase n'est réécrite : celles qui restent sont celles de la fiche, mot pour mot.
 */
function leanExplain(explain: string, x: Ghost, all: readonly Ghost[]): string {
  const [first, second] = explain.split(SENTENCES)
  if (!second) return explain
  const others = all.some((o) => o.id !== x.id && namesGhost(second, o))
  return !others && second.length <= CONTEXT_MAX ? `${first} ${second}` : first
}

/** « Seule entité qui peut… », « le seul à… » : la phrase dit que le fait désigne l'entité. */
const SAYS_ONLY = /(?<!\p{L})seule?s?\s+(?:entités?|à)(?!\p{L})/iu

function authoredSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const out: Seed[] = []
  x.quiz.forEach((a, i) => {
    if (a.choices.length < 2 || a.choices.length > 4 || a.answer < 0 || a.answer >= a.choices.length) return
    // rien sur les preuves ; et pas de choix entre des noms d'entités (« Qui suspectes-tu ? » : ce serait toujours X)
    if (mentionsEvidence(a.q) || a.choices.some((c) => mentionsEvidence(c))) return
    // ni dans son corrigé (« interaction EMF (écriture, …) ») ; sauf sur la fiche du Mimic, dont les orbes à 0 preuve
    // sont une capacité : c'est justement ce qu'il faut savoir sans preuve
    if (x.id !== MIMIC && mentionsEvidence(a.explain)) return
    const explain = leanExplain(a.explain, x, all)
    if (a.choices.every((c) => namesAny(c, all)) || a.choices.some((c) => redact(c, x) !== c)) return
    // ni la seule réponse qui contient le mot que souffle le nom de X (« disparaît » pour le Fantôme) : dans une copie
    // qui ne parle que de lui, elle se trouverait sans rien savoir
    if (hintAlone(x, a.choices[a.answer], a.choices.filter((_c, k) => k !== a.answer))) return
    const id = `q:auth:${x.id}:${i}`
    out.push({
      id,
      type: 'auth',
      topic: 'expert',
      width: a.choices.length as 2 | 3 | 4,
      // « À partir de quel seuil un Goryo peut-il chasser ? 50 % » : la valeur standard pour bonne réponse, une copie sur deux
      ...(STANDARD_ANSWER.test(a.choices[a.answer].trim()) ? { gate: 'stdAuth' as const } : {}),
      make: (rng) => {
        const q: Question = {
          id,
          topic: 'expert',
          ghostId: x.id,
          prompt: a.q,
          multi: false,
          choices: shuffle(rng, a.choices.map((label, k) => ({ id: String(k), label }))),
          correct: [String(a.answer)],
          explain,
        }
        // « Tu hésites entre un Esprit et un Spectre. Quel test les départage ? » : elle demande aussi un fait du Spectre
        const asked = `${a.q} \n ${a.choices[a.answer]}`
        const named = all.filter((o) => o.id !== x.id && namesGhost(a.q, o))
        // « Combien de santé mentale fait perdre l'explosion ? 2 % par objet lancé » : la réponse est une valeur, c'est elle qu'on demande
        const answered = keysOf(x.id, a.choices[a.answer]).filter((k) => !isSoft(k))
        const aspect = answered.length ? ('value' as const) : ('own' as const)
        // son corrigé, phrase par phrase : chacune montre ce qu'elle dit de X. Ce que vaut le fait (une preuve, un simple
        // indice) n'est montré que si l'énoncé, la réponse ou le corrigé le disent (« c'est un test de confirmation »,
        // « la seule entité qui… », « c'est un indice fort ») ; alors, par prudence, pour tout ce que dit le corrigé
        const worth = saidWorth(`${asked} ${explain}`)
        const says = SAYS_ONLY.test(`${asked} ${explain}`) || worth.includes('!preuve') ? (worth.includes('!indice') ? ('any' as const) : ('proof' as const)) : worth.includes('!indice') ? ('hint' as const) : undefined
        const b = built(
          q,
          'auth',
          [{ who: x.id, text: asked, aspect }, ...named.map((o) => ({ who: o.id, text: asked }))],
          explain.split(SENTENCES).map((text) => ({ who: x.id, text, ...(says ? { aspect: says } : {}) })),
        )
        const bounds = keysOf(x.id, a.choices[a.answer]).flatMap((k) => {
          const m = /^[^|]+\|(\d+) (\S+)$/u.exec(k)
          return m ? [{ n: Number(m[1]), unit: m[2] }] : []
        })
        if (bounds.length === 2 && bounds[0].unit === bounds[1].unit) {
          b.range = { who: x.id, unit: bounds[0].unit, lo: Math.min(bounds[0].n, bounds[1].n), hi: Math.max(bounds[0].n, bounds[1].n) }
        }
        return b
      },
    })
  })
  return out
}

/* ---------- toutes les questions possibles sur X ---------- */

/** Tout ce que la fiche de x permet de composer, avant ce que les autres fiches font écarter (voir unmatched). */
const everySeed = memo((x, all): Seed[] => {
  if (!NAME_WORDS.size) for (const g of all) for (const w of `${g.name} ${g.nameEn}`.toLocaleLowerCase('fr').match(/\p{L}+/gu) ?? []) if (w.length >= 3 && !HOLLOW.has(w)) NAME_WORDS.add(stem(w))
  return [
    ...numberSeeds(x, all),
    ...signSeeds(x, all),
    ...testSeeds(x, all),
    ...exclusionSeeds(x, all),
    ...intruderSeeds(x, all),
    ...trueFalseSeeds(x, all),
    ...duelSeeds(x, all),
    ...observationSeeds(x, all),
    ...authoredSeeds(x, all),
  ]
})

const seedsFor = memo((x, all): Seed[] => {
  const out = unmatched(all)
  return everySeed(x, all).filter((s) => !out.has(s.id))
})

/** Les identifiants de toutes les questions qu'une copie sur x peut poser (certaines ne se composent pas à chaque tirage). */
export function soloSupply(x: Ghost, all: Ghost[]): { id: string; type: SoloType; topic: QuizTopic }[] {
  return seedsFor(x, all).map(({ id, type, topic }) => ({ id, type, topic }))
}

/**
 * La question `id` sur x, composée seule pour ce tirage (null si elle n'existe pas, ou ne se compose pas cette
 * fois : pas de mauvaises réponses de même forme). Pour relire une question, ou la vérifier une à une.
 */
export function soloQuestion(x: Ghost, all: Ghost[], id: string, rng: Rng): Question | null {
  const b = seedsFor(x, all).find((s) => s.id === id)?.make(rng)
  if (!b) return null
  const q = { ...b.q, prompt: fr(b.q.prompt), explain: fr(noLeadingMais(b.q.explain)) }
  ledgers.set(q, b)
  return q
}

/* ---------- la copie ---------- */

/**
 * Les sortes de questions d'une copie de dix. D'abord la ligne de vue (les entités qui n'accélèrent pas en
 * parlent partout : posée après, « Non » sortirait moins que « Oui »), les nombres et un signe de l'entité, le
 * cœur de la copie ; puis les autres sortes dans le désordre ; le reste se complète (voir FILL). L'ordre des
 * questions dans la copie, lui, se décide à la fin. `T3` : une question sur un test de la fiche, « ce test suffit-il ? »
 * (T3b) quand elle peut se poser, sinon « quel test confirme X ? » (T3a) ; `T8` : une observation, « est-ce que ça
 * suffit ? » ; `T6` : un vrai ou faux, d'abord sur ce que la fiche de X dit elle-même faux pour lui.
 */
const FIRST = ['T1los', 'T1san', 'T1spd', 'T2'] as const
const BLUEPRINT = ['T2', 'T3', 'T4', 'T5', 'T8'] as const
/** Le départage après le reste : il cite le trait le plus connu de l'entité, que d'autres sortes demandent mieux. */
const DUELS = ['T7a'] as const
/** De quoi compléter une copie : un vrai ou faux, une question rédigée, puis une de plus des autres sortes. */
const FILL = ['T6', 'auth', 'T8', 'T3', 'T2', 'T7a', 'T5', 'T6', 'auth', 'T4', 'T1san', 'T1spd'] as const
/**
 * L'intrus montre trois signes de X pour n'en demander aucun : sur une fiche qui en a moins que cela, il ne fait
 * pas partie du plan (il prendrait la place de deux questions sur ces signes) et ne sert qu'à compléter la copie.
 */
const INTRUDER_SIGNS = 5
type Slot = (typeof FIRST)[number] | (typeof BLUEPRINT)[number] | (typeof DUELS)[number] | (typeof FILL)[number]

/** Après autant d'essais sans se composer (pas de mauvaises réponses de même forme, ou déjà lues), une question n'est plus tentée dans la copie. */
const MISSES = 4

/**
 * Compose la copie sur une seule entité : `count` questions (dix), toutes sur elle. Une question déjà posée dans
 * une copie précédente (`seen`) passe après les autres. Une même valeur, une même phrase ne se demandent qu'une
 * fois, et aucune réponse n'a été montrée plus tôt dans la copie : une question qui en montrerait une autre passe
 * après elle, ou ne se pose pas. Un même fait (la chasse qui s'arrête dans la cachette de l'Aswang) se demande une
 * fois pour dire à qui il est, puis pour dire ce qu'il vaut (une preuve, un simple indice), jamais deux fois sous
 * le même angle (voir Stmt). Quand la fiche n'a pas de quoi remplir la copie ainsi, elle se complète palier par
 * palier (voir LADDER) ; une fiche vraiment courte donne une copie de moins de `count` questions, plutôt qu'une
 * question dont la réponse vient d'être lue. Le tirage ne dépend que de `rng`.
 */
export function buildSoloQuiz(opts: SoloOptions): Question[] {
  const { ghost: x, allGhosts: all, rng } = opts
  const count = Math.max(0, Math.floor(opts.count ?? SOLO_COUNT))
  if (!count) return []
  const los = losChance(all)
  // ce qui décide des réponses se tire une fois, pour tous les essais : quelles questions rares se posent (valeur
  // standard, ligne de vue), et la réponse de chaque question à réponses fixes (vrai ou faux, oui ou non), dans
  // l'ordre où elles entrent. Garder la plus longue des copies ne fait donc pencher aucune réponse
  const draw: Draw = {
    gates: { stdSan: rng() < SOLO_STANDARD.san, stdSpd: rng() < SOLO_STANDARD.spd, los: rng() < (x.speed.los ? los.yes : los.no), stdAuth: rng() < SOLO_STANDARD.authored, oneSided: rng() },
    worth: Array.from({ length: COINS }, () => rng()),
    trueFalse: Array.from({ length: COINS }, () => rng()),
  }
  let best: Built[] = []
  for (let attempt = 0; attempt < ATTEMPTS + MORE_ATTEMPTS; attempt++) {
    // au-delà des essais de toute copie : seulement tant qu'elle reste très courte
    if (attempt >= ATTEMPTS && best.length >= Math.min(count, SHORT)) break
    const made = compose(opts, count, draw, createRng(Math.floor(rng() * 0x100000000)))
    if (made.length > best.length) best = made
    if (best.length >= count) break
  }
  // typographie française sur ce que l'app compose (les textes des fiches le sont déjà au chargement)
  return best.map((b) => {
    const q = { ...b.q, prompt: fr(b.q.prompt), explain: fr(noLeadingMais(b.q.explain)) }
    ledgers.set(q, b)
    return q
  })
}

/**
 * L'ordre dans lequel les questions entrent dans une copie décide de sa longueur : un signe qui dit deux faits de la
 * fiche (« Ne change jamais seul de pièce favorite et s'en éloigne peu »), posé d'abord, ne laisse plus rien à
 * demander sur l'un ni sur l'autre. La copie se compose donc plusieurs fois, dans des ordres différents, et la plus
 * longue est gardée. Deux essais : mesuré, +0,3 question par copie pour 20 ms de plus (médiane) ; le troisième
 * rapportait deux fois moins.
 */
const ATTEMPTS = 2
/** Une copie de moins de cinq questions se retente encore deux fois : ces copies-là se composent en quelques millisecondes. */
const MORE_ATTEMPTS = 2
const SHORT = 5
/** Autant de réponses tirées d'avance par sorte de question à réponses fixes (une copie de trente en compte au plus quinze). */
const COINS = 16
interface Draw {
  gates: { stdSan: boolean; stdSpd: boolean; los: boolean; stdAuth: boolean; oneSided: number }
  worth: number[]
  trueFalse: number[]
}

/** Une composition de la copie (voir buildSoloQuiz) : ses questions, dans l'ordre où les poser. */
function compose(opts: SoloOptions, count: number, draw: Draw, rng: Rng): Built[] {
  const { ghost: x, allGhosts: all } = opts
  // un signe de X déjà demandé (« lequel de ces signes… ») l'est aussi sous son autre forme (« vrai ou faux… »)
  const asked = [...(opts.seen ?? [])]
  const seen: ReadonlySet<string> = new Set([...asked, ...asked.flatMap(sameSign)])
  const topics = opts.topics ? new Set<QuizTopic>(opts.topics) : null
  const seeds = seedsFor(x, all).filter((s) => !topics || topics.has(s.topic))
  if (!seeds.length) return []
  const stray = opts.onlyListed ? strayCheck(all.filter((o) => o.id !== x.id)) : null
  const gates = draw.gates
  /** le rang de la prochaine réponse tirée d'avance, par sorte */
  const drawn = { worth: 0, trueFalse: 0 }
  const scale = count / SOLO_COUNT
  /** le palier en cours (voir LADDER) */
  let level = 0
  /** les plafonds, à la mesure de la copie demandée */
  const caps = {
    twoFree: Math.max(1, Math.floor(TWO_FREE * scale)),
    few: Math.max(1, Math.floor(FEW_MAX * scale)),
    numbers: Math.max(1, Math.round(NUMBERS_MAX * scale)),
    T3b: Math.max(1, Math.round(WORTH_MAX.T3b * scale)),
    T8: Math.max(1, Math.round(WORTH_MAX.T8 * scale)),
  }

  const picked: Built[] = []
  const ids = new Set<string>()
  const screens = new Set<string>()
  /** les citations de la copie : une même scène ne se relit pas sous une autre question (vrai ou faux, puis « est-ce que ça suffit ? ») */
  const quotes = new Set<string>()
  /** le nombre de questions de la copie tirées parmi les signes d'autres fiches (voir FOREIGN_EVERY) */
  let mixed = 0
  /** la copie pose déjà un « est-ce que ça suffit ? » dont la réponse est la seule possible pour X (voir addWorth) */
  let forced = false
  /** before[i] : les questions qui doivent passer avant la question i */
  const before: Set<number>[] = []
  const widthOf = (n: number) => picked.filter((b) => b.q.choices.length === n).length
  const countOf = (pred: (b: Built) => boolean) => picked.filter(pred).length
  /** seuil ou vitesse : le groupe d'une question en nombres déjà dans la copie */
  const numberGroup = (b: Built) => (/^q:san(?:sum)?:/u.test(b.q.id) ? 'san' : /^q:spd(?:sum)?:/u.test(b.q.id) ? 'spd' : null)
  /** La copie peut-elle encore tirer une question parmi les signes d'autres fiches ? Une par tranche de cinq questions commencée. */
  const borrowing = () => mixed < Math.ceil((picked.length + 1) / FOREIGN_EVERY)
  const roomFor = (s: Seed) => {
    // deux réponses : trois dans toute copie ; au-delà, pas plus de la moitié de la copie telle qu'elle serait avec elle
    if (s.width === 2 && widthOf(2) + 1 > Math.max(caps.twoFree, Math.ceil((picked.length + 1) / 2))) return false
    if (s.width < 4 && picked.length - widthOf(4) >= caps.few) return false
    if (s.type === 'T1' && s.group !== 'los' && countOf((b) => numberGroup(b) === s.group) >= caps.numbers) return false
    if ((s.type === 'T3b' || s.type === 'T8') && countOf((b) => b.type === s.type) >= caps[s.type]) return false
    if (s.type === 'T5' && !borrowing()) return false
    return true
  }
  /** Les clés qui comptent au palier en cours : les valeurs et les phrases toujours ; l'objet en bloc, ou fait par fait (voir LADDER). */
  const counts = (k: string, fine = LADDER[level].fine) => (fine ? !isSoft(k) : !isFine(k))
  /** `a` demande-t-elle ce que `b` montre une fois corrigée ? */
  const leaks = (a: Built, b: Built, fine = LADDER[level].fine): boolean => {
    for (const k of a.asks) if (counts(k, fine) && b.shows.has(k)) return true
    // la même phrase dite autrement, à tous les paliers : à qui est le fait, dès que `b` le dit ; ce qu'il vaut, si `b` le dit
    for (const s of a.said) for (const t of b.told) if (sameSaid(s, t) && (!s.worthOnly || s.worth.some((w) => t.worth.includes(w)))) return true
    if (a.range) {
      const { who, unit, lo, hi } = a.range
      const lead = `${who}|`
      const end = ` ${unit}`
      for (const k of b.shows) {
        if (!k.startsWith(lead) || !k.endsWith(end)) continue
        const n = k.slice(lead.length, -end.length)
        if (/^\d+$/u.test(n) && Number(n) > lo && Number(n) < hi) return true
      }
    }
    return false
  }
  /** `first` doit passer avant `after` par la question nouvelle : impossible si une question de `first` doit déjà suivre l'une de `after`. */
  const loops = (first: readonly number[], after: readonly number[]): boolean => {
    if (!first.length || !after.length) return false
    const reach = new Set<number>()
    const walk = (i: number) => {
      if (reach.has(i)) return
      reach.add(i)
      for (const j of before[i]) walk(j)
    }
    for (const i of after) walk(i)
    return first.some((i) => reach.has(i))
  }
  /**
   * Les questions que `b` doit précéder, celles qui doivent le précéder ; null s'il ne peut pas entrer dans la copie :
   * deux questions qui se montreraient l'une l'autre ne vont pas ensemble. Quand les faits d'un objet se
   * distinguent (voir LADDER), deux questions sur le même objet mais sur deux faits vont ensemble ; celle qui parle
   * de l'objet sans le demander passe quand même après l'autre, tant que l'ordre de la copie le permet.
   */
  const place = (b: Built): { first: number[]; after: number[] } | null => {
    const fine = LADDER[level].fine
    const first: number[] = []
    const after: number[] = []
    const rather: { first: number[]; after: number[] } = { first: [], after: [] }
    for (let i = 0; i < picked.length; i++) {
      const forward = leaks(b, picked[i])
      const backward = leaks(picked[i], b)
      if (forward && backward) return null
      if (forward) first.push(i)
      else if (backward) after.push(i)
      else if (fine) {
        const sooner = leaks(b, picked[i], false)
        const later = leaks(picked[i], b, false)
        if (sooner && !later) rather.first.push(i)
        else if (later && !sooner) rather.after.push(i)
      }
    }
    // un intrus dont deux des trois affirmations vraies sont déjà connues par d'autres questions n'en serait plus un :
    // connue, quand une autre question demande ce fait (sa bonne réponse le dit), ou en montre une valeur ou la phrase
    const chosen = [...picked, b]
    for (const p of chosen) {
      if (p.truths && p.truths.filter((t) => chosen.some((o) => o !== p && t.some((k) => !isSoft(k) && (o.asks.has(k) || (!isFine(k) && o.shows.has(k)))))).length > 1) return null
    }
    if (loops(first, after)) return null
    const wished = { first: [...first, ...rather.first], after: [...after, ...rather.after] }
    return loops(wished.first, wished.after) ? { first, after } : wished
  }
  type Found = { b: Built; at: { first: number[]; after: number[] } }
  /**
   * Les réponses en phrases d'une question (signes, tests, départages), le nom de l'entité retiré : lue une fois,
   * corrigée, une réponse qui reviendrait s'écarterait d'emblée (« … chasse à 1,53 m/s de base » dans deux
   * départages de suite ; la bonne réponse d'un départage parmi les mauvaises du suivant).
   */
  const wrongOf = (b: Built): string[] => {
    if (!b.sentences) {
      const sentences = b.type === 'T2' || b.type === 'T3a' || b.type === 'T4' || b.type === 'T7a'
      // ce qui est cité comme faux pour X (vrai ou faux, intrus : le signe d'une entité proche, un test d'élimination de
      // X) : relu parmi les réponses d'une autre question, il s'écarterait de même
      const foreign =
        b.type === 'T5'
          ? b.q.choices.filter((c) => b.q.correct.includes(c.id)).map((c) => c.label)
          : b.type === 'T6' && b.q.correct[0] === SOLO_ANSWERS.trueFalse.false
            ? [b.q.quote ?? '']
            : []
      b.sentences = (sentences ? b.q.choices.map((c) => c.label) : foreign).filter(Boolean).map((l) => nameless(l, all))
    }
    return b.sentences
  }
  const read = new Set<string>()
  /**
   * Deux questions jugent-elles la même phrase (vrai ou faux, « est-ce que ça suffit ? ») ? « Quand la lumière est
   * allumée dans la pièce où se trouve l'entité, elle en sort plus souvent » : un comportement du Cauchemar, jugé en
   * vrai ou faux, et l'une de ses observations, presque mot pour mot. Deux angles sur un même fait vont ensemble (à
   * qui est-il, que vaut-il), pas deux fois la même phrase : l'élève croirait relire la question d'avant. La
   * citation de l'une commence comme un passage de l'autre (ses soixante premiers caractères, noms d'entités retirés).
   */
  const rereads = (b: Built) => {
    if (!b.q.quote) return false
    const mine = plainText(b.q.quote, all)
    return picked.some((p) => {
      if (!p.q.quote) return false
      const theirs = plainText(p.q.quote, all)
      return (mine.length >= 20 && theirs.includes(mine.slice(0, 60))) || (theirs.length >= 20 && mine.includes(theirs.slice(0, 60)))
    })
  }
  /** tout ce que la copie demande déjà */
  const askedAll = new Set<string>()
  const doomed = (s: Seed) => !!s.pre && s.pre().some((k) => counts(k) && askedAll.has(k))
  /**
   * Ce que l'énoncé et le corrigé d'une question rédigée montrent d'une autre entité qu'ils nomment (« le Spectre ne
   * touche jamais au sel ; l'Esprit le perturbe normalement », dans le corrigé d'une question sur l'Esprit), phrase
   * par phrase : une question qui le demanderait passe avant, ou ne se pose pas. Les questions composées, elles,
   * disent déjà de qui parle chacune de leurs phrases.
   */
  const noted = new WeakSet<Built>()
  const mentions = (b: Built) => {
    if (b.type !== 'auth' || noted.has(b)) return
    noted.add(b)
    for (const sentence of `${b.q.prompt} ${b.q.explain}`.split(SENTENCES)) {
      for (const o of all) if (o.id !== x.id && namesGhost(sentence, o)) for (const k of showKeys({ who: o.id, text: sentence })) b.shows.add(k)
    }
  }
  const commit = ({ b, at }: Found) => {
    const n = picked.length
    picked.push(b)
    ids.add(b.q.id)
    screens.add(screenOf(b.q))
    if (b.q.quote) quotes.add(b.q.quote)
    if (b.type === 'T5') mixed++
    before.push(new Set(at.after))
    for (const i of at.first) before[i].add(n)
    for (const w of wrongOf(b)) read.add(w)
    for (const k of b.asks) askedAll.add(k)
  }
  /** « Encore 10 » : les questions des copies précédentes ne reviennent qu'une fois les autres épuisées, et pour la moitié de la copie au plus */
  let again = false
  const repeats = () => picked.filter((b) => seen.has(b.q.id)).length
  /** Les questions possibles d'une sorte, dans l'ordre où les essayer. */
  const ordered = (list: readonly Seed[]) => {
    const room = again && repeats() < Math.floor(count / 2)
    const usable = shuffle(rng, list.filter((s) => !ids.has(s.id) && !spent(s) && (!s.gate || gates[s.gate]) && roomFor(s) && (room || !seen.has(s.id) || s.gate === 'los') && !doomed(s)))
    const rank = (s: Seed) => (seen.has(s.id) ? 2 : 0) + (s.late ? 1 : 0)
    return usable
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
      .map(({ s }) => s)
  }
  /**
   * Les questions qui ne se poseront plus dans cette copie : elles demandent ce qu'une autre montre déjà (la copie
   * ne fait que grandir), ou ne se sont pas composées à plusieurs paliers de suite. Les retenter à chaque palier
   * (voir LADDER) coûterait le plus clair du temps d'une copie courte.
   */
  const out = new Set<string>()
  const failed = new Map<string, number>()
  const spent = (s: Seed) => out.has(s.id) || (failed.get(s.id) ?? 0) >= MISSES
  /** La première question de la liste qui se compose et entre dans la copie (sans l'y mettre). */
  const find = (list: readonly Seed[], tries = 10): Found | null => {
    let left = tries
    for (const s of ordered(list)) {
      if (left-- <= 0) break
      let b = s.make(rng)
      // une question à quatre phrases qui ne se compose pas à ce tirage, ou qui reprend une mauvaise réponse déjà lue, se retente une fois
      if (s.width === 4 && (!b || wrongOf(b).some((w) => read.has(w)))) b = s.make(rng)
      if (!b || screens.has(screenOf(b.q)) || (b.q.quote && quotes.has(b.q.quote)) || stray?.(b.q) || wrongOf(b).some((w) => read.has(w)) || rereads(b)) {
        failed.set(s.id, (failed.get(s.id) ?? 0) + 1)
        continue
      }
      mentions(b)
      const at = place(b)
      if (at) return { b, at }
      // refusée alors que les faits d'un objet se distinguent déjà : aucun palier ne la fera entrer
      if (LADDER[level].fine) out.add(s.id)
    }
    return null
  }
  const add = (list: readonly Seed[], tries?: number): boolean => {
    const found = find(list, tries)
    if (found) commit(found)
    return !!found
  }
  const of = (type: SoloType, pred: (s: Seed) => boolean = () => true) => seeds.filter((s) => s.type === type && pred(s))
  /**
   * Une question dont la réponse se tire entre `classes` (vrai ou faux) : elle ne se pose que si chaque réponse a de
   * quoi se poser à cet instant, dans la même sorte de phrases (`register`), puis la réponse se tire à pile ou face.
   * Sinon la réponse la plus facile à composer sortirait plus souvent que l'autre.
   */
  const addEither = (type: SoloType, classes: readonly [string, string]): boolean => {
    for (const r of shuffle(rng, [...new Set(of(type).map((s) => s.register))])) {
      // une sorte de phrases qui puise dans les autres fiches : leur part de la copie est comptée (voir FOREIGN_EVERY)
      const borrowed = of(type, (s) => s.register === r).some((s) => s.foreign)
      if (borrowed && !borrowing()) continue
      const found = classes.map((c) => find(of(type, (s) => s.register === r && s.cls === c), 6))
      if (!found[0] || !found[1]) continue
      commit(found[draw.trueFalse[drawn.trueFalse++ % COINS] < 0.5 ? 0 : 1]!)
      if (borrowed) mixed++
      return true
    }
    return false
  }
  /**
   * Un vrai ou faux tiré de la seule fiche de X : un de ses tests d'élimination (faux pour lui), ou une affirmation
   * vraie de sa fiche de même forme (une scène face à une scène, un signe face à un signe) et de longueur voisine.
   * Les deux doivent pouvoir se poser à cet instant, puis la réponse se tire : ni la longueur de la phrase, ni sa
   * tournure ne disent laquelle des deux est posée.
   */
  const addOwn = (): boolean => {
    const truths = of('T6', (s) => s.cls === 'true' && !!s.text && s.register !== 'claim')
    for (const f of shuffle(rng, of('T6', (s) => s.register === 'own'))) {
      const wrong = find([f], 1)
      if (!wrong) continue
      const form = formOf(f.text!)
      const right = find(truths.filter((t) => formOf(t.text!) === form && sameSize(t.text!, f.text!)), 6)
      if (!right) continue
      commit(draw.trueFalse[drawn.trueFalse++ % COINS] < 0.5 ? right : wrong)
      return true
    }
    return false
  }
  /** « Est-ce que ça suffit ? », sur un test (T3b) ou sur une observation (T8) : voir worthPlan. */
  const addWorth = (type: Worth): boolean => {
    const mine = (cls: string) => of(type, (s) => s.cls === cls)
    // les réponses possibles pour X, et leurs chances
    const plan = (worthPlan(all).plan.get(`${x.id}|${type}`) ?? []).filter((p) => mine(p.cls).length)
    if (!plan.length) return false
    /** La première citation de cette réponse qui peut se poser à cet instant, essayées dans le désordre. */
    const candidate = (cls: string): Found | null => {
      for (const s of shuffle(rng, mine(cls))) {
        const found = find([s], 1)
        if (found) return found
      }
      return null
    }
    // une entité qui n'a qu'une réponse possible (rien de décisif sur sa fiche, ou rien d'autre) ne la pose qu'une
    // fois par copie, tests et observations confondus : qui a lu la première sait répondre à la suivante (les
    // Jumeaux, le Kormos : « Non » aux deux) ; et, pour ses tests, dans une partie des copies seulement (voir
    // ONE_SIDED)
    if (plan.length < ENOUGH.length) {
      if (forced || gates.oneSided >= ONE_SIDED[type][plan[0].cls as 'yes' | 'no']) return false
      const only = candidate(plan[0].cls)
      if (!only) return false
      commit(only)
      forced = true
      return true
    }
    // chaque réponse possible pour X doit avoir de quoi se poser à cet instant, à tous les paliers, puis la réponse
    // se tire : sinon le tirage pencherait vers « Non » (« ça suffit » repose sur les faits décisifs de la fiche,
    // les premiers épuisés). Et jamais « l'autre réponse d'office » après la première : dans une copie, la réponse
    // d'une question ne se déduit pas de celle d'avant
    const found = plan.map((p) => candidate(p.cls))
    if (!found[0] || !found[1]) return false
    const coin = draw.worth[drawn.worth++ % COINS]
    commit(weightedPick(() => coin, plan.map((p, i) => ({ weight: p.weight, f: found[i]! })), (p) => p.weight).f)
    return true
  }
  const fillSlot = (slot: Slot): boolean => {
    switch (slot) {
      case 'T1los':
        return add(of('T1', (s) => s.group === 'los'))
      case 'T1san':
        return add(of('T1', (s) => s.group === 'san'))
      case 'T1spd':
        return add(of('T1', (s) => s.group === 'spd'))
      case 'T2':
        return add(of('T2'))
      case 'T3':
        return addWorth('T3b') || add(of('T3a'))
      case 'T4':
        return add(of('T4'))
      case 'T5':
        return add(of('T5'), 6)
      case 'T6':
        return addOwn() || addEither('T6', ['true', 'false'])
      case 'T7a':
        return add(of('T7a'), 5)
      case 'T8':
        return addWorth('T8')
      case 'auth':
        return add(of('auth'))
    }
  }

  // une copie plus courte que dix : les sortes dans le désordre, sans préférence
  const plan: Slot[] = count < SOLO_COUNT ? ['T1los', ...shuffle(rng, [...FIRST.slice(1), ...BLUEPRINT, ...DUELS])] : []
  for (let r = Math.max(1, Math.round(scale)); count >= SOLO_COUNT && r > 0; r--) plan.push(...FIRST, ...shuffle(rng, BLUEPRINT), ...shuffle(rng, DUELS))
  const rich = Math.max(...STYLES.map((style) => ownSigns(x, all, style).length)) >= INTRUDER_SIGNS
  for (const slot of plan) {
    if (picked.length >= count) break
    if (slot !== 'T5' || rich) fillSlot(slot)
  }
  const fill = () => {
    let progress = true
    while (picked.length < count && progress) {
      progress = false
      for (const slot of FILL) {
        if (picked.length >= count) break
        if (fillSlot(slot)) progress = true
      }
    }
  }
  // compléter, palier par palier (voir LADDER) : d'abord sans aucune question d'une copie précédente, puis avec
  const last = Math.min(LADDER.length - 1, Math.max(0, Math.floor(opts.relax ?? LADDER.length - 1)))
  for (const repeat of seen.size ? [false, true] : [false]) {
    again = repeat
    for (level = 0; level <= last && picked.length < count; level++) fill()
    level = last
    for (let round = 1; round < LAST_ROUNDS && picked.length < count; round++) fill()
  }
  level = last

  // une copie courte ne compte jamais plus d'une moitié de questions déjà posées : les dernières entrées en sortent
  const dropped = new Set<number>()
  for (let i = picked.length - 1; i >= 0 && repeats() - dropped.size > Math.floor((picked.length - dropped.size) / 2); i--) {
    if (seen.has(picked[i].q.id)) dropped.add(i)
  }
  // l'ordre : une question passe avant celles qui la montreraient ; pour le reste, au hasard, deux questions de la
  // même sorte ne se suivant que faute d'autre
  const order: number[] = []
  const placed = new Set<number>(dropped)
  while (order.length < picked.length - dropped.size) {
    const left = picked.map((_, i) => i).filter((i) => !placed.has(i))
    const ready = left.filter((i) => [...before[i]].every((j) => placed.has(j)))
    // les contraintes ne bouclent jamais (voir place) ; par prudence, une question bloquée passerait quand même
    const pool = ready.length ? ready : left
    const last = order.length ? picked[order[order.length - 1]].type : null
    // la copie s'ouvre sur du simple quand elle en a : un nombre de la fiche (vitesse, seuil) ou l'un des signes de
    // l'entité, avant les tests, les observations et les questions expertes
    const simple = order.length ? [] : pool.filter((i) => picked[i].type === 'T1' || picked[i].type === 'T2')
    const from = simple.length ? simple : pool
    const varied = from.filter((i) => picked[i].type !== last)
    const next = shuffle(rng, varied.length ? varied : from)[0]
    order.push(next)
    placed.add(next)
  }
  return order.map((i) => picked[i])
}

/**
 * Le même signe de X sous son autre forme : « Lequel de ces signes est celui de X ? » (q:sign-of:x:2, q:sign-of:x:t3)
 * et « Vrai ou faux pour X ? » (q:vf:x:x:K2, q:vf:x:x:T3) demandent le même fait. Dans « Encore 10 », la liste des
 * questions déjà posées ne connaît que des identifiants : sans cela, le signe de la copie précédente revenait sous
 * l'autre forme (mesuré : 42 copies enchaînées sur 450 reprenaient plus de la moitié des faits de la précédente).
 */
function sameSign(id: string): string[] {
  const sign = /^q:sign-of:([^:]+):(t?)(\d+)$/u.exec(id)
  if (sign) return [`q:vf:${sign[1]}:${sign[1]}:${sign[2] ? 'T' : 'K'}${sign[3]}`]
  const judged = /^q:vf:([^:]+):\1:([KT])(\d+)$/u.exec(id)
  return judged ? [`q:sign-of:${judged[1]}:${judged[2] === 'T' ? 't' : ''}${judged[3]}`] : []
}

/** Ce que chaque question d'une copie composée demande et montre (voir soloFacts). */
const ledgers = new WeakMap<Question, Built>()

/**
 * Ce qu'une question rendue par buildSoloQuiz demande (`asks`) et tout ce qu'elle montre une fois corrigée
 * (`shows`), sous les clés qui ont servi à composer la copie : `entité|valeur` et `entité|ligne de vue` (voir
 * factKeys), `entité#début de la phrase` et `entité#C2` (une ligne de sa fiche), `entité|§objet:fait/sorte` (à qui
 * est ce fait, voir FACETS), `entité|§objet:fait!preuve` (ce qu'il vaut). Dans une copie, aucune question ne
 * demande ce qu'une question placée avant elle montre. Null pour une question d'une autre origine (ou recopiée :
 * la question se reconnaît à l'objet rendu, pas à son identifiant).
 */
export function soloFacts(q: Question): { asks: string[]; shows: string[] } | null {
  const b = ledgers.get(q)
  return b ? { asks: [...b.asks].filter((k) => !isSoft(k)), shows: [...b.shows].filter((k) => !isSoft(k)) } : null
}
