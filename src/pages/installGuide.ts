import { detectDevice, isTablet, UNKNOWN_APP, type Browser, type Device } from '../engine/device'
import { fr, NNBSP } from '../engine/format'

/**
 * La marche à suivre pour installer l'app, selon l'appareil et le navigateur. Les libellés entre « »
 * sont ceux des menus des systèmes en français (sur iPhone, suivis de l'anglais entre parenthèses) ; quand ils
 * changent d'une version à l'autre, la phrase reste vraie pour toutes (« l'option qui commence par
 * « Installer » »). Un bouton dont on ne connaît pas le libellé français se décrit par sa forme et sa place.
 */

export interface Step {
  text: string
  /** Précision en plus petit sous l'étape (ancienne version, bouton introuvable…). */
  hint?: string
}

export type GuideKey =
  | 'ios-safari'
  | 'ipad-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'in-app'
  | 'android-chrome'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-other'
  | 'desktop-chrome'
  | 'desktop-edge'
  | 'desktop-safari'
  | 'desktop-safari-old'
  | 'desktop-firefox'
  | 'desktop-other'

export interface Guide {
  key: GuideKey
  /** « Sur iPhone, avec Safari ». */
  title: string
  /** Une phrase avant les étapes. */
  intro?: string
  /** Les étapes, numérotées 1, 2, 3 (aucune quand ce navigateur ne sait pas installer). */
  steps: Step[]
  /** Une phrase après les étapes. */
  after?: string
  /** Proposer « Copier le lien » : pour l'ouvrir dans le bon navigateur, ou sur le téléphone. */
  copyLink?: boolean
}

const BROWSER_NAMES: Record<Browser, string | null> = {
  safari: 'Safari',
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  samsung: 'Samsung Internet',
  opera: 'Opera',
  other: null,
}

export function browserName(b: Browser): string | null {
  return BROWSER_NAMES[b]
}

/** « le menu de Chrome », « le menu d’Edge », « le menu du navigateur » (élision devant une voyelle). */
export function menuOf(b: Browser): string {
  const name = browserName(b)
  if (!name) return 'le menu du navigateur'
  return /^[AEIOUYÉÈ]/i.test(name) ? `le menu d’${name}` : `le menu de ${name}`
}

/** « iPhone », « iPad », « Android » ou « ordinateur ». */
export function deviceName(d: Pick<Device, 'os' | 'ipad'>): string {
  if (d.os === 'ios') return d.ipad ? 'iPad' : 'iPhone'
  return d.os === 'android' ? 'Android' : 'ordinateur'
}

/**
 * Le lien de l'accueil vers la marche à suivre : « sur ton iPad », « sur ta tablette » (Android, même en
 * version ordinateur), sinon « sur ton téléphone ».
 */
export function installLinkText(ua: string, maxTouchPoints = 0): string {
  const d = detectDevice(ua, maxTouchPoints)
  return `Installer l’app ${d.ipad ? 'sur ton iPad' : isTablet(ua, maxTouchPoints) ? 'sur ta tablette' : 'sur ton téléphone'}`
}

/** Le bouton principal : « Ajouter à l'écran d'accueil » sur téléphone, « Installer l'app » sur ordinateur. */
export function installLabel(d: Pick<Device, 'os'>): string {
  return d.os === 'desktop' ? 'Installer l’app' : 'Ajouter à l’écran d’accueil'
}

/** « iPhone · Safari », « Android · Instagram »… (en-tête de la page). */
export function deviceLabel(d: Device): string {
  const where = d.os === 'desktop' ? 'Ordinateur' : deviceName(d)
  const what = d.inApp && d.inApp !== UNKNOWN_APP ? d.inApp : d.inApp ? 'autre app' : browserName(d.browser)
  return what ? `${where} · ${what}` : where
}

/**
 * Beaucoup d'iPhone sont réglés en anglais : le libellé anglais suit le français, entre parenthèses, pour les
 * gestes qui comptent (relevés sur iOS 26 en anglais ; « Partager », « Sur l'écran d'accueil » et « Ajouter »
 * sont ceux d'iOS en français).
 */
const SHARE = '« Partager » (Share)'
const HOME_SCREEN = '« Sur l’écran d’accueil » (Add to Home Screen)'
const ADD = '« Ajouter » (Add)'
/**
 * Le bouton « View More » de la fenêtre de partage d'iOS 26 : un rond avec une flèche vers le bas, au bout de la
 * rangée de ronds (« Copy », « Add to Bookmarks »…). Son libellé français n'est pas connu : on le décrit.
 */
const VIEW_MORE = 'le rond avec une flèche vers le bas, au bout de la rangée de ronds (View More)'

/** « Sur l'écran d'accueil », sur un iPhone ou un iPad dont on ne sait pas si la fenêtre de partage le cache. */
const STEP_HOME_SCREEN: Step = {
  text: `Touche ${HOME_SCREEN}.`,
  hint: 'Tu ne le vois pas ? Touche d’abord le rond avec une flèche vers le bas (View More), ou fais défiler la liste.',
}
/** Le nom se change avant d'ajouter ; l'écran qui suit n'a pas encore été vu sur iOS 26 : l'indice reste vrai partout. */
const STEP_ADD: Step = {
  text: `Change le nom si tu veux, puis touche ${ADD}.`,
  hint: 'Si une option pour l’ouvrir comme une app web s’affiche, laisse-la activée.',
}
const STEP_ADD_SHORT: Step = { text: `Change le nom si tu veux, puis touche ${ADD}.` }
const SAFARI_FALLBACK = 'Tu ne trouves pas « Sur l’écran d’accueil » ? Ouvre ce lien dans Safari : là, ça marche à coup sûr.'
/**
 * Un lien touché dans Discord, WhatsApp… s'ouvre souvent dans une vue Safari intégrée à l'app : elle signe
 * exactement comme Safari, mais n'a ni la barre d'adresse de Safari ni « Sur l'écran d'accueil ».
 */
const SAFARI_VIEW_FALLBACK =
  'Toujours pas de « Sur l’écran d’accueil » ? Tu es sans doute dans le navigateur d’une autre app (Discord, WhatsApp…) : touche la boussole ou « Ouvrir dans Safari » (Open in Safari), puis recommence.'
const PHONE_LINK = 'Pour ton téléphone : envoie-toi ce lien et ouvre-le dessus, la page te montrera quoi faire.'
const INSTALL_OPTION = 'Touche « Ajouter à l’écran d’accueil », ou l’option qui commence par « Installer ».'

/** Le navigateur où l'installation marche : Safari sur iPhone, Chrome sur Android. */
function realBrowser(d: Pick<Device, 'os'>): string {
  return d.os === 'ios' ? 'Safari' : d.os === 'android' ? 'Chrome' : 'ton navigateur'
}

/**
 * Au crayon sous le bouton, avant qu'on le touche : ce qui va se passer. `canPrompt` : le navigateur a
 * envoyé son invitation, le bouton ouvrira sa fenêtre d'installation.
 */
export function buttonHint(d: Device, canPrompt: boolean): string {
  if (d.inApp) return `Depuis ${d.inApp}, impossible d’installer : il faut d’abord ouvrir ce lien dans ${realBrowser(d)}. Le bouton te montre comment.`
  if (canPrompt) return 'Une fenêtre s’ouvre : confirme avec « Installer ».'
  const name = browserName(d.browser)
  if (d.os === 'ios') {
    return `Sur ${deviceName(d)}, Apple ne prévoit pas d’installation en un geste : ça se fait en trois étapes dans ${name ?? 'le navigateur'}. Le bouton te les montre.`
  }
  if (guideFor(d).steps.length) return `Ça se fait en trois étapes dans ${menuOf(d.browser)} : le bouton te les montre.`
  return 'Le bouton te dit quoi faire avec ce navigateur.'
}

export function guideFor(d: Device): Guide {
  const where = deviceName(d)
  const name = browserName(d.browser)

  // ===== navigateur intégré à une autre app : il faut d'abord passer dans le vrai navigateur
  if (d.inApp) {
    const target = realBrowser(d)
    // pourquoi on ne peut pas installer d'ici : dit sous le bouton, avant qu'on le touche (buttonHint)
    return {
      key: 'in-app',
      title: `Ouvert dans ${d.inApp}`,
      steps: [
        { text: 'Touche le menu de l’app : « … » ou les trois points, souvent en haut à droite.' },
        // l'app peut être réglée en anglais, comme le téléphone : le libellé anglais suit, entre parenthèses
        { text: `Choisis « Ouvrir dans le navigateur » ou « Ouvrir dans ${target} » (Open in browser, Open in ${target}).` },
        { text: `Dans ${target}, touche à nouveau « ${installLabel(d)} » sur cette page.` },
      ],
      after: `Pas de menu ? Copie le lien, puis colle-le dans la barre d’adresse de ${target}.`,
      copyLink: true,
    }
  }

  // ===== iPhone et iPad : Apple ne donne aucun bouton direct, tout passe par « Partager »
  if (d.os === 'ios') {
    if (d.browser === 'safari') {
      if (d.ipad) {
        // iPadOS 18 : Partager est en haut à droite ; iPadOS 26 : pas encore vu sur un vrai iPad, la barre d'adresse
        // reste en haut. L'étape et son indice sont vrais dans les deux cas.
        return {
          key: 'ipad-safari',
          title: 'Sur iPad, avec Safari',
          steps: [
            {
              text: 'Touche le bouton Partager (Share), un carré avec une flèche vers le haut, en haut de l’écran.',
              hint: 'Tu ne le vois pas ? Touche le petit bouton à gauche de l’adresse, en haut (ou « … » près de la barre), puis « Partager ».',
            },
            STEP_HOME_SCREEN,
            STEP_ADD,
          ],
          after: SAFARI_VIEW_FALLBACK,
          copyLink: true,
        }
      }
      // jusqu'à iOS 18 (Version/18), Partager est dans la barre du bas. Depuis iOS 26 (Version/26, alors que le
      // système se dit encore « iPhone OS 18_6 »), relevé sur un vrai iPhone : barre d'adresse en bas, Partager
      // dans le menu du petit bouton à gauche de l'adresse, et « Add to Home Screen » caché derrière « View More »
      // dans la fenêtre de partage. Version inconnue (choix manuel « iPhone ») : celle d'aujourd'hui, iOS 26.
      if (d.version != null && d.version < 26) {
        return {
          key: 'ios-safari',
          title: 'Sur iPhone, avec Safari',
          steps: [
            { text: 'Touche le bouton Partager (Share), un carré avec une flèche vers le haut, en bas de l’écran.' },
            { text: `Touche ${HOME_SCREEN}.`, hint: 'Tu ne le vois pas ? Fais défiler la liste vers le bas.' },
            STEP_ADD,
          ],
          after: SAFARI_VIEW_FALLBACK,
          copyLink: true,
        }
      }
      return {
        key: 'ios-safari',
        title: 'Sur iPhone, avec Safari',
        steps: [
          {
            // relevé sur l'iPhone : « < » (retour), puis le cadre de l'adresse, qui porte à sa gauche le petit bouton
            // du menu de la page. « Le petit bouton à gauche de l'adresse » pourrait désigner le retour : on précise
            text: `Dans la barre en bas de l’écran, touche le petit bouton collé à gauche de l’adresse du site, dans le même cadre qu’elle (pas la flèche de retour), puis ${SHARE}.`,
            // les autres dispositions de Safari (réglages, onglets « en bas » ou « en haut ») : « … », ou Partager déjà là
            hint: 'Tu vois plutôt « … » à droite de la barre ? Touche-le, puis « Partager ». Un carré avec une flèche vers le haut en bas de l’écran ? C’est Partager : touche-le directement.',
          },
          {
            text: `Dans la fenêtre qui s’ouvre, touche ${VIEW_MORE}, puis ${HOME_SCREEN}.`,
            hint: 'Tu ne le vois pas ? Fais défiler la liste vers le bas.',
          },
          STEP_ADD,
        ],
        after: SAFARI_VIEW_FALLBACK,
        copyLink: true,
      }
    }
    // depuis iOS 16.4, Chrome, Edge et Firefox passent aussi par leur bouton Partager
    if (d.browser === 'chrome') {
      return {
        key: 'ios-chrome',
        title: `Sur ${where}, avec Chrome`,
        steps: [
          { text: 'Touche le bouton Partager (Share), dans la barre d’adresse.', hint: 'Tu ne le vois pas ? Ouvre le menu « … », puis « Partager ».' },
          STEP_HOME_SCREEN,
          STEP_ADD_SHORT,
        ],
        after: SAFARI_FALLBACK,
        copyLink: true,
      }
    }
    return {
      key: 'ios-other',
      title: name ? `Sur ${where}, avec ${name}` : `Sur ${where}`,
      steps: [
        { text: `Ouvre ${menuOf(d.browser)}, puis ${SHARE}.` },
        STEP_HOME_SCREEN,
        STEP_ADD_SHORT,
      ],
      after: SAFARI_FALLBACK,
      copyLink: true,
    }
  }

  // ===== Android : le bouton ouvre d'habitude la fenêtre d'installation ; sinon, le menu du navigateur
  if (d.os === 'android') {
    if (d.browser === 'chrome') {
      return {
        key: 'android-chrome',
        title: 'Sur Android, avec Chrome',
        steps: [
          { text: 'Touche le menu de Chrome (les trois points), en haut à droite.' },
          { text: INSTALL_OPTION, hint: 'Le libellé change selon la version de Chrome.' },
          { text: 'Si on te demande de choisir, prends « Installer », puis confirme.' },
        ],
      }
    }
    if (d.browser === 'samsung') {
      return {
        key: 'android-samsung',
        // court : le titre tient sur une ligne de la fiche, même sur un petit téléphone
        title: 'Avec Samsung Internet',
        steps: [
          {
            text: 'Touche le menu (les trois traits), en bas à droite.',
            hint: 'Plus court : touche l’icône d’installation dans la barre d’adresse, si elle s’affiche.',
          },
          { text: 'Touche « Ajouter la page à », puis « Écran d’accueil ».' },
          { text: 'Confirme avec « Ajouter » ou « Installer ».' },
        ],
      }
    }
    if (d.browser === 'firefox') {
      return {
        key: 'android-firefox',
        title: 'Sur Android, avec Firefox',
        steps: [
          { text: 'Touche le menu de Firefox (les trois points).' },
          { text: INSTALL_OPTION },
          { text: 'Confirme avec « Ajouter » ou « Installer ».' },
        ],
      }
    }
    return {
      key: 'android-other',
      title: name ? `Sur Android, avec ${name}` : 'Sur Android',
      steps: [
        { text: `Ouvre ${menuOf(d.browser)}.` },
        { text: INSTALL_OPTION },
        { text: 'Confirme avec « Ajouter » ou « Installer ».' },
      ],
      after: 'Rien de tel ? Ouvre ce lien dans Chrome.',
      copyLink: true,
    }
  }

  // ===== ordinateur : en bref, le carnet est d'abord fait pour le téléphone
  if (d.browser === 'chrome') {
    return {
      key: 'desktop-chrome',
      title: 'Sur ordinateur, avec Chrome',
      steps: [
        {
          text: 'Ouvre le menu de Chrome (les trois points), en haut à droite.',
          hint: 'Plus court : l’icône d’installation à droite de la barre d’adresse, quand elle s’affiche.',
        },
        { text: 'Va dans « Caster, enregistrer et partager », puis l’option qui commence par « Installer ».' },
        { text: 'Confirme avec « Installer ».' },
      ],
      after: PHONE_LINK,
      copyLink: true,
    }
  }
  if (d.browser === 'edge') {
    return {
      key: 'desktop-edge',
      title: 'Sur ordinateur, avec Edge',
      steps: [
        {
          text: 'Ouvre le menu d’Edge (« … »), en haut à droite.',
          hint: 'Plus court : l’icône d’installation à droite de la barre d’adresse, quand elle s’affiche.',
        },
        {
          text: 'Va dans « Applications », puis l’option qui commence par « Installer ».',
          hint: 'Selon la version, « Applications » est rangé dans « Autres outils ».',
        },
        { text: 'Confirme avec « Installer ».' },
      ],
      after: PHONE_LINK,
      copyLink: true,
    }
  }
  if (d.browser === 'safari') {
    if (d.version != null && d.version < 17) {
      return {
        key: 'desktop-safari-old',
        title: 'Sur Mac, avec Safari',
        intro: 'Cette version de Safari ne sait pas installer l’app : il faut macOS Sonoma (14) ou plus récent.',
        steps: [],
        after: PHONE_LINK,
        copyLink: true,
      }
    }
    return {
      key: 'desktop-safari',
      title: 'Sur Mac, avec Safari',
      steps: [
        { text: 'Clique sur « Fichier », dans la barre des menus en haut de l’écran.' },
        { text: 'Choisis « Ajouter au Dock… ».', hint: 'Pas de « Ajouter au Dock » ? Il faut macOS Sonoma (14) ou plus récent.' },
        { text: 'Change le nom si tu veux, puis clique sur « Ajouter ».' },
      ],
      after: PHONE_LINK,
      copyLink: true,
    }
  }
  if (d.browser === 'firefox') {
    return {
      key: 'desktop-firefox',
      title: 'Sur ordinateur, avec Firefox',
      intro: 'Sur ordinateur, Firefox ne propose pas d’installer l’app. Chrome et Edge, eux, savent le faire.',
      steps: [],
      after: PHONE_LINK,
      copyLink: true,
    }
  }
  return {
    key: 'desktop-other',
    title: name ? `Sur ordinateur, avec ${name}` : 'Sur ordinateur',
    intro: 'Ce navigateur ne propose peut-être pas d’installer l’app. Chrome et Edge, eux, savent le faire.',
    steps: [],
    after: PHONE_LINK,
    copyLink: true,
  }
}

/**
 * Sur ordinateur, « Copier un message pour Discord » : le lien de la page « Installer l'app », puis une
 * ligne par téléphone. Le lien touché dans Discord s'ouvre dans son navigateur intégré, d'où l'on ne peut
 * pas installer : d'abord Safari (iPhone) ou Chrome (Android), puis les gestes des étapes de la page, en bref.
 * iPhone : une phrase vraie pour iOS 18 (Partager dans la barre du bas) comme pour iOS 26 (Partager dans le menu du
 * petit bouton de l'adresse, « Sur l'écran d'accueil » derrière « View More ») ; la page ouverte par le lien montre
 * ensuite les gestes de l'iPhone qui l'ouvre.
 */
export function discordMessage(url: string): string {
  return [
    `Phasmo Coach${NNBSP}: ${url}`,
    fr(`Sur iPhone : ouvre ce lien dans Safari, touche ${SHARE}, sur iOS 26 dans le menu du petit bouton collé à gauche de l’adresse, puis ${HOME_SCREEN}, au besoin après le rond avec une flèche vers le bas (View More).`),
    fr('Sur Android : ouvre-le dans Chrome, touche le menu (les trois points), puis « Ajouter à l’écran d’accueil » ou l’option qui commence par « Installer ».'),
  ].join('\n')
}

/** Choix manuel de l'appareil (« Ce n'est pas ton appareil ? ») : le navigateur le plus courant de chacun. */
export type DeviceChoice = 'iphone' | 'android' | 'desktop'

const BASE: Device = { os: 'desktop', ipad: false, browser: 'chrome', version: null, inApp: null, standalone: false }
export const CHOICES: Record<DeviceChoice, Device> = {
  iphone: { ...BASE, os: 'ios', browser: 'safari' },
  android: { ...BASE, os: 'android', browser: 'chrome' },
  desktop: BASE,
}

export function choiceOf(d: Device): DeviceChoice {
  return d.os === 'ios' ? 'iphone' : d.os === 'android' ? 'android' : 'desktop'
}
