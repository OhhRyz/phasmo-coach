import { UNKNOWN_APP, type Browser, type Device } from '../engine/device'

/**
 * La marche à suivre pour installer l'app, selon l'appareil et le navigateur. Les libellés entre « »
 * sont ceux des menus des systèmes en français ; quand ils changent d'une version à l'autre, la phrase
 * reste vraie pour toutes (« l'option qui commence par « Installer » »).
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

const STEP_HOME_SCREEN: Step = {
  text: 'Touche « Sur l’écran d’accueil ».',
  hint: 'Tu ne le vois pas ? Fais défiler la liste, ou touche « En voir plus ».',
}
const STEP_ADD: Step = {
  text: 'Change le nom si tu veux, puis touche « Ajouter ».',
  hint: 'Si une option pour l’ouvrir comme une app web s’affiche, laisse-la activée.',
}
const STEP_ADD_SHORT: Step = { text: 'Change le nom si tu veux, puis touche « Ajouter ».' }
const SAFARI_FALLBACK = 'Tu ne trouves pas « Sur l’écran d’accueil » ? Ouvre ce lien dans Safari : là, ça marche à coup sûr.'
/**
 * Un lien touché dans Discord, WhatsApp… s'ouvre souvent dans une vue Safari intégrée à l'app : elle signe
 * exactement comme Safari, mais n'a ni « … » près de l'adresse ni « Sur l'écran d'accueil ».
 */
const SAFARI_VIEW_FALLBACK =
  'Pas de « Sur l’écran d’accueil » dans la liste ? Tu es sans doute dans le navigateur d’une autre app (Discord, WhatsApp…) : touche la boussole ou « Ouvrir dans Safari », puis recommence.'
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
        { text: `Choisis « Ouvrir dans le navigateur » (ou « Ouvrir dans ${target} »).` },
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
        return {
          key: 'ipad-safari',
          title: 'Sur iPad, avec Safari',
          steps: [
            {
              text: 'Touche le bouton Partager (un carré avec une flèche vers le haut), en haut de l’écran.',
              hint: 'Tu ne le vois pas ? Touche « … » près de la barre d’adresse, puis « Partager ».',
            },
            STEP_HOME_SCREEN,
            STEP_ADD,
          ],
          after: SAFARI_VIEW_FALLBACK,
          copyLink: true,
        }
      }
      // jusqu'à iOS 18, Partager est dans la barre du bas ; depuis iOS 26 (Version/26), derrière « … » à côté de
      // l'adresse, sauf si l'on a gardé la barre d'onglets en bas ou en haut
      const shareBelow = d.version != null && d.version < 26
      return {
        key: 'ios-safari',
        title: 'Sur iPhone, avec Safari',
        steps: [
          shareBelow
            ? { text: 'Touche le bouton Partager (un carré avec une flèche vers le haut), en bas de l’écran.' }
            : {
                text: 'Touche « … » à droite de la barre d’adresse, puis « Partager ».',
                hint: 'Tu vois le bouton Partager (un carré avec une flèche vers le haut) en bas de l’écran ? Touche-le directement.',
              },
          STEP_HOME_SCREEN,
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
          { text: 'Touche le bouton Partager, dans la barre d’adresse.', hint: 'Tu ne le vois pas ? Ouvre le menu « … », puis « Partager ».' },
          { text: 'Touche « Sur l’écran d’accueil ».', hint: 'Fais défiler la liste si besoin.' },
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
        { text: `Ouvre ${menuOf(d.browser)}, puis « Partager ».` },
        { text: 'Touche « Sur l’écran d’accueil ».', hint: 'Fais défiler la liste si besoin.' },
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
