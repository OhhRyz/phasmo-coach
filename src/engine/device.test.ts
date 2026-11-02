import { describe, expect, it } from 'vitest'
import { buttonHint, CHOICES, deviceLabel, guideFor, installLabel, installLinkText, menuOf, type Guide } from '../pages/installGuide'
import { detectDevice, isTablet, UNKNOWN_APP, type Device } from './device'
import { fr } from './format'

/** User agents relevés sur de vrais appareils (versions récentes). */
const UA = {
  iphoneSafari18:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  // iOS 26 : Safari fige la version du système à 18_6 et annonce Version/26.0
  iphoneSafari26:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  // relevé sur l'iPhone du propriétaire (iOS 26, Safari réglé en anglais) : même figeage du système
  iphoneSafari261:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  // iPadOS 26 en « mode ordinateur » (réglage par défaut) : un Mac qui annonce Version/26.0
  ipadSafari26:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  // iPad en « mode ordinateur » : il se présente comme un Mac
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  ipadMobile:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/131.2903.68 Mobile/15E148 Safari/605.1.15',
  iphoneGoogleApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.665236494 Mobile/15E148 Safari/604.1',
  // app ouverte depuis l'écran d'accueil : plus de marque « Safari/ »
  iphoneHomeScreen: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  androidEdge:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0',
  androidOpera:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 OPR/86.0.4363.59',
  // tablette Android : Chrome y demande la version « ordinateur » des sites
  androidTabletDesktopMode:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; fr_FR; fr; scale=3.00; 1170x2532; 614287233; IABMV/1)',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 Instagram 343.0.0.33.101 Android (34/14; 420dpi; 1080x2205; Google/google; Pixel 7; panther; panther; fr_FR; 627400398)',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-G991B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/481.0.0.48.109;]',
  facebookIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/478.0.0.39.108;FBBV/650187563;FBDV/iPhone14,7;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBID/phone;FBLC/fr_FR;FBOP/5;FBRV/0]',
  messengerAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/468.0.0.43.109;]',
  tiktokIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/fr Region/FR isDarkMode/0 WKWebView/1 RevealType/Dialog',
  snapchatIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.10.0.40 (like Safari/8618.2.12.10.5, panda)',
  linkedinIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.2311',
  lineIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  desktopChromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  desktopSafari16:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
}

/**
 * Longueur maximale d'un titre de fiche : l'en-tête n'a qu'une ligne (la règle rouge de la fiche est à hauteur
 * fixe), soit 238 px à 320 px de large, en Courier Prime 12,5 px espacé (8,25 px par lettre) : 28 lettres.
 */
const TITLE_MAX = 28

const pick = (d: Device) => ({ os: d.os, browser: d.browser, inApp: d.inApp, standalone: d.standalone })

describe('Appareil reconnu pour installer l’app', () => {
  it('iPhone avec Safari (iOS 18 et iOS 26)', () => {
    for (const ua of [UA.iphoneSafari18, UA.iphoneSafari26]) {
      const d = detectDevice(ua, 5)
      expect(pick(d)).toEqual({ os: 'ios', browser: 'safari', inApp: null, standalone: false })
      expect(d.ipad).toBe(false)
    }
    expect(detectDevice(UA.iphoneSafari26, 5).version).toBe(26)
  })

  it('iPad : en mode ordinateur (il se dit Mac), on le reconnaît à l’écran tactile', () => {
    const d = detectDevice(UA.ipadDesktopMode, 5)
    expect(pick(d)).toEqual({ os: 'ios', browser: 'safari', inApp: null, standalone: false })
    expect(d.ipad).toBe(true)
    expect(detectDevice(UA.ipadMobile, 5)).toMatchObject({ os: 'ios', ipad: true, browser: 'safari' })
  })

  it('le même user agent sans écran tactile est un vrai Mac', () => {
    const d = detectDevice(UA.ipadDesktopMode, 0)
    expect(pick(d)).toEqual({ os: 'desktop', browser: 'safari', inApp: null, standalone: false })
    // un seul point de contact (pavé tactile signalé par certains Mac) ne suffit pas
    expect(detectDevice(UA.ipadDesktopMode, 1).os).toBe('desktop')
  })

  it('les autres navigateurs de l’iPhone signent de leur nom', () => {
    expect(pick(detectDevice(UA.iphoneChrome, 5))).toEqual({ os: 'ios', browser: 'chrome', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.iphoneFirefox, 5))).toEqual({ os: 'ios', browser: 'firefox', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.iphoneEdge, 5))).toEqual({ os: 'ios', browser: 'edge', inApp: null, standalone: false })
    // l'app Google n'est pas Safari, même si elle en porte la marque
    expect(detectDevice(UA.iphoneGoogleApp, 5)).toMatchObject({ os: 'ios', browser: 'other', inApp: null })
  })

  it('Android : Chrome, Samsung Internet, Firefox, Edge', () => {
    expect(pick(detectDevice(UA.androidChrome, 5))).toEqual({ os: 'android', browser: 'chrome', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.androidSamsung, 5))).toEqual({ os: 'android', browser: 'samsung', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.androidFirefox, 5))).toEqual({ os: 'android', browser: 'firefox', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.androidEdge, 5))).toEqual({ os: 'android', browser: 'edge', inApp: null, standalone: false })
  })

  it('navigateurs intégrés aux apps : on nomme l’app', () => {
    expect(detectDevice(UA.instagramIos, 5)).toMatchObject({ os: 'ios', inApp: 'Instagram' })
    expect(detectDevice(UA.instagramAndroid, 5)).toMatchObject({ os: 'android', inApp: 'Instagram' })
    expect(detectDevice(UA.facebookAndroid, 5)).toMatchObject({ os: 'android', inApp: 'Facebook' })
    expect(detectDevice(UA.facebookIos, 5)).toMatchObject({ os: 'ios', inApp: 'Facebook' })
    expect(detectDevice(UA.messengerAndroid, 5)).toMatchObject({ os: 'android', inApp: 'Messenger' })
    expect(detectDevice(UA.tiktokIos, 5)).toMatchObject({ os: 'ios', inApp: 'TikTok' })
    expect(detectDevice(UA.snapchatIos, 5)).toMatchObject({ os: 'ios', inApp: 'Snapchat' })
    expect(detectDevice(UA.linkedinIos, 5)).toMatchObject({ os: 'ios', inApp: 'LinkedIn' })
    expect(detectDevice(UA.lineIos, 5)).toMatchObject({ os: 'ios', inApp: 'LINE' })
  })

  it('une vue web d’app inconnue (Android « ; wv) ») reste une app, pas Chrome', () => {
    expect(detectDevice(UA.androidWebView, 5)).toMatchObject({ os: 'android', inApp: UNKNOWN_APP })
    // les vrais navigateurs n'en sont pas
    for (const ua of [UA.androidChrome, UA.androidSamsung, UA.androidFirefox, UA.iphoneSafari26, UA.iphoneChrome, UA.desktopChrome]) {
      expect(detectDevice(ua, 5).inApp).toBeNull()
    }
  })

  it('l’app ouverte depuis l’écran d’accueil n’est pas prise pour une app tierce', () => {
    const d = detectDevice(UA.iphoneHomeScreen, 5, true)
    expect(pick(d)).toMatchObject({ os: 'ios', inApp: null, standalone: true })
    // sans l'indication « installée », ce même user agent est celui d'une vue web d'app
    expect(detectDevice(UA.iphoneHomeScreen, 5, false).inApp).toBe(UNKNOWN_APP)
    expect(detectDevice(UA.androidChrome, 5, true).standalone).toBe(true)
  })

  it('ordinateur : Chrome, Edge, Firefox, Safari (avec sa version)', () => {
    expect(pick(detectDevice(UA.desktopChrome))).toEqual({ os: 'desktop', browser: 'chrome', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.desktopChromeMac))).toEqual({ os: 'desktop', browser: 'chrome', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.desktopEdge))).toEqual({ os: 'desktop', browser: 'edge', inApp: null, standalone: false })
    expect(pick(detectDevice(UA.desktopFirefox))).toEqual({ os: 'desktop', browser: 'firefox', inApp: null, standalone: false })
    expect(detectDevice(UA.desktopSafari)).toMatchObject({ os: 'desktop', browser: 'safari', version: 18 })
    expect(detectDevice(UA.desktopSafari16)).toMatchObject({ os: 'desktop', browser: 'safari', version: 16 })
    // un ordinateur Windows tactile reste un ordinateur
    expect(detectDevice(UA.desktopEdge, 10).os).toBe('desktop')
  })

  it('tablette Android en « version ordinateur » (X11; Linux) : reconnue à l’écran tactile', () => {
    expect(pick(detectDevice(UA.androidTabletDesktopMode, 10))).toEqual({ os: 'android', browser: 'chrome', inApp: null, standalone: false })
    // sans écran tactile, c'est un ordinateur Linux ; un Chromebook tactile reste un ordinateur
    expect(detectDevice(UA.androidTabletDesktopMode, 0).os).toBe('desktop')
    expect(detectDevice(UA.chromebook, 10).os).toBe('desktop')
    expect(guideFor(detectDevice(UA.androidTabletDesktopMode, 10)).key).toBe('android-chrome')
  })

  it('tablette ou téléphone : le lien de l’accueil nomme le bon appareil', () => {
    // Chrome sur tablette Android retire « Mobile » de sa signature ; Firefox s'y dit « Tablet »
    const androidTablet = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    const firefoxTablet = 'Mozilla/5.0 (Android 14; Tablet; rv:132.0) Gecko/132.0 Firefox/132.0'
    for (const [ua, touch] of [[UA.androidTabletDesktopMode, 10], [androidTablet, 5], [firefoxTablet, 5]] as const) {
      expect(isTablet(ua, touch), ua).toBe(true)
      expect(installLinkText(ua, touch)).toBe('Installer l’app sur ta tablette')
    }
    expect(installLinkText(UA.ipadDesktopMode, 5)).toBe('Installer l’app sur ton iPad')
    expect(installLinkText(UA.ipadMobile, 5)).toBe('Installer l’app sur ton iPad')
    for (const ua of [UA.iphoneSafari26, UA.androidChrome, UA.androidFirefox, UA.androidSamsung]) {
      expect(isTablet(ua, 5), ua).toBe(false)
      expect(installLinkText(ua, 5)).toBe('Installer l’app sur ton téléphone')
    }
    // un ordinateur Linux sans écran tactile n'est pas une tablette
    expect(isTablet(UA.androidTabletDesktopMode, 0)).toBe(false)
  })

  it('un user agent vide ne plante pas', () => {
    expect(detectDevice('')).toEqual({ os: 'desktop', ipad: false, browser: 'other', version: null, inApp: null, standalone: false })
  })
})


describe('Installer l’app : une seule marche à suivre, celle de l’appareil', () => {
  const g = (ua: string, touch = 5, standalone = false) => guideFor(detectDevice(ua, touch, standalone))
  const all = (guide: Guide) => [guide.intro, guide.after, ...guide.steps.flatMap((s) => [s.text, s.hint])].filter((t): t is string => !!t).join('\n')

  it('chaque appareil a sa fiche', () => {
    expect(g(UA.iphoneSafari26).key).toBe('ios-safari')
    expect(g(UA.iphoneSafari18).key).toBe('ios-safari')
    expect(g(UA.ipadDesktopMode).key).toBe('ipad-safari')
    expect(g(UA.iphoneChrome).key).toBe('ios-chrome')
    expect(g(UA.iphoneFirefox).key).toBe('ios-other')
    expect(g(UA.iphoneEdge).key).toBe('ios-other')
    expect(g(UA.androidChrome).key).toBe('android-chrome')
    expect(g(UA.androidSamsung).key).toBe('android-samsung')
    expect(g(UA.androidFirefox).key).toBe('android-firefox')
    expect(g(UA.androidEdge).key).toBe('android-other')
    for (const ua of [UA.instagramIos, UA.facebookAndroid, UA.tiktokIos, UA.androidWebView]) expect(g(ua).key).toBe('in-app')
    expect(g(UA.desktopChrome, 0).key).toBe('desktop-chrome')
    expect(g(UA.desktopEdge, 0).key).toBe('desktop-edge')
    expect(g(UA.desktopSafari, 0).key).toBe('desktop-safari')
    expect(g(UA.desktopSafari16, 0).key).toBe('desktop-safari-old')
    expect(g(UA.desktopFirefox, 0).key).toBe('desktop-firefox')
  })

  it('les étapes vont toujours par trois, une par ligne', () => {
    const uas = Object.values(UA)
    for (const ua of uas) {
      for (const touch of [0, 5]) {
        const guide = g(ua, touch)
        expect([0, 3]).toContain(guide.steps.length)
        // sans étape, la fiche dit pourquoi et propose d'emporter le lien
        if (!guide.steps.length) expect(guide.intro && guide.copyLink).toBeTruthy()
      }
    }
  })

  /** Les libellés entre « » d'un texte, dans l'ordre (espaces fines ou insécables comprises). */
  const quoted = (t: string) => [...t.matchAll(/«[\s\u202f\u00a0]*([^«»]+?)[\s\u202f\u00a0]*»/gu)].map((m) => m[1])

  it('iPhone, Safari (iOS 26, le système se dit encore 18_6) : petit bouton à gauche de l’adresse, Partager, « View More », « Sur l’écran d’accueil », « Ajouter »', () => {
    // la version vient de Version/26.x, pas de « iPhone OS 18_6 »
    expect(detectDevice(UA.iphoneSafari26, 5).version).toBe(26)
    expect(detectDevice(UA.iphoneSafari261, 5).version).toBe(26)
    for (const ua of [UA.iphoneSafari26, UA.iphoneSafari261]) {
      const guide = g(ua)
      expect(guide.key).toBe('ios-safari')
      expect(guide.title).toBe('Sur iPhone, avec Safari')
      const [share, more, add] = guide.steps
      // 1. le petit bouton est collé à gauche de l'adresse, dans son cadre, dans la barre du bas ; il ouvre un menu
      // où l'on touche Partager. Le rond « < » (retour), juste à gauche du cadre, n'est pas celui-là : l'étape le dit
      expect(share.text).toBe(
        'Dans la barre en bas de l’écran, touche le petit bouton collé à gauche de l’adresse du site, dans le même cadre qu’elle (pas la flèche de retour), puis « Partager » (Share).',
      )
      expect(share.text).toMatch(/^Dans la barre en bas de l’écran,/)
      expect(share.text).toMatch(/pas la flèche de retour/)
      expect(share.text).toMatch(/puis « Partager » \(Share\)\.$/)
      // pas de « … » dans l'étape (la barre relevée n'en a pas) : il reste dans l'indice, pour l'autre disposition
      expect(share.text).not.toContain('…')
      expect(share.hint).toMatch(/^Tu vois plutôt « … » à droite de la barre \? Touche-le, puis « Partager »\./)
      // les dispositions « en bas » ou « en haut » gardent le bouton Partager à l'écran
      expect(share.hint).toContain('carré avec une flèche vers le haut')
      // 2. « Add to Home Screen » n'apparaît qu'après « View More » : le rond à la flèche vers le bas, décrit par sa forme
      expect(more.text).toMatch(/^Dans la fenêtre qui s’ouvre, touche le rond avec une flèche vers le bas, au bout de la rangée de ronds \(View More\), puis « Sur l’écran d’accueil » \(Add to Home Screen\)\.$/)
      expect(more.text.indexOf('View More')).toBeLessThan(more.text.indexOf('Sur l’écran d’accueil'))
      expect(more.hint).toMatch(/défiler/)
      // 3. le nom, « Ajouter » ; l'écran suivant n'a pas été vu sur iOS 26 : l'indice ne promet rien de précis
      expect(add.text).toBe('Change le nom si tu veux, puis touche « Ajouter » (Add).')
      expect(add.hint).toBe('Si une option pour l’ouvrir comme une app web s’affiche, laisse-la activée.')
      // les libellés français, puis anglais, dans l'ordre des gestes
      expect(guide.steps.flatMap((st) => quoted(st.text))).toEqual(['Partager', 'Sur l’écran d’accueil', 'Ajouter'])
    }
  })

  it('iPhone, Safari jusqu’à iOS 18 : le bouton Partager en bas de l’écran, sans « … » ni « View More »', () => {
    const guide = g(UA.iphoneSafari18)
    expect(detectDevice(UA.iphoneSafari18, 5).version).toBe(18)
    expect(guide.key).toBe('ios-safari')
    expect(guide.steps[0].text).toMatch(/^Touche le bouton Partager \(Share\), un carré avec une flèche vers le haut, en bas de l’écran\.$/)
    expect(all(guide)).not.toContain('« … »')
    expect(all(guide)).not.toMatch(/View More|à gauche de l’adresse/)
    expect(guide.steps[1].text).toBe('Touche « Sur l’écran d’accueil » (Add to Home Screen).')
    expect(guide.steps[1].hint).toMatch(/défiler/)
    expect(guide.steps[2].text).toContain('« Ajouter » (Add)')
  })

  it('iPhone, version inconnue (choix manuel « iPhone ») : la marche à suivre d’iOS 26', () => {
    const manual = guideFor(CHOICES.iphone)
    expect(CHOICES.iphone.version).toBeNull()
    expect(manual.steps.map((st) => st.text)).toEqual(g(UA.iphoneSafari26).steps.map((st) => st.text))
    // la frontière : 25 garde le bouton du bas, 26 et plus le petit bouton à gauche de l'adresse
    const at = (version: number) => guideFor({ ...CHOICES.iphone, version }).steps[0].text
    expect(at(25)).toMatch(/^Touche le bouton Partager/)
    expect(at(26)).toMatch(/petit bouton collé à gauche de l’adresse/)
    expect(at(27)).toMatch(/petit bouton collé à gauche de l’adresse/)
  })

  it('iPad, Safari (iPadOS 18 ou 26) : Partager en haut, sinon le petit bouton à gauche de l’adresse ; « View More » ou défiler', () => {
    for (const ua of [UA.ipadDesktopMode, UA.ipadMobile, UA.ipadSafari26]) {
      const d = detectDevice(ua, 5)
      expect(d.ipad, ua).toBe(true)
      const guide = guideFor(d)
      expect(guide.key).toBe('ipad-safari')
      expect(guide.title).toBe('Sur iPad, avec Safari')
      // la barre d'adresse de l'iPad reste en haut : jamais « en bas de l'écran »
      expect(all(guide)).not.toContain('en bas de l’écran')
      expect(guide.steps[0].text).toMatch(/Partager \(Share\).*en haut de l’écran\.$/)
      expect(guide.steps[0].hint).toMatch(/petit bouton à gauche de l’adresse, en haut.*« Partager »/)
      // la même phrase vaut pour les deux fenêtres de partage (avec ou sans « View More »)
      expect(guide.steps[1].text).toBe('Touche « Sur l’écran d’accueil » (Add to Home Screen).')
      expect(guide.steps[1].hint).toMatch(/rond avec une flèche vers le bas \(View More\), ou fais défiler/)
      expect(guide.steps[2].text).toContain('« Ajouter » (Add)')
    }
    expect(detectDevice(UA.ipadSafari26, 5).version).toBe(26)
  })

  it('Safari sur iPhone ou iPad : la vue Safari d’une autre app (Discord…) n’a pas « Sur l’écran d’accueil »', () => {
    for (const guide of [g(UA.iphoneSafari26), g(UA.iphoneSafari18), g(UA.ipadDesktopMode)]) {
      expect(guide.after).toMatch(/Discord.*« Ouvrir dans Safari »/)
      expect(guide.copyLink).toBe(true)
    }
  })

  it('élision devant un navigateur qui commence par une voyelle : « d’Edge », « d’Opera »', () => {
    expect(menuOf('edge')).toBe('le menu d’Edge')
    expect(menuOf('opera')).toBe('le menu d’Opera')
    expect(menuOf('chrome')).toBe('le menu de Chrome')
    expect(menuOf('other')).toBe('le menu du navigateur')
    expect(g(UA.iphoneEdge).steps[0].text).toBe('Ouvre le menu d’Edge, puis « Partager » (Share).')
    expect(g(UA.androidEdge).steps[0].text).toBe('Ouvre le menu d’Edge.')
    expect(g(UA.androidOpera).steps[0].text).toBe('Ouvre le menu d’Opera.')
    expect(buttonHint(detectDevice(UA.desktopEdge), false)).toBe('Ça se fait en trois étapes dans le menu d’Edge : le bouton te les montre.')
    for (const ua of Object.values(UA)) {
      for (const touch of [0, 5]) {
        const d = detectDevice(ua, touch)
        expect([all(guideFor(d)), buttonHint(d, false)].join('\n')).not.toMatch(/\bde [AEIOUÉ]/)
      }
    }
  })

  it('le titre de la fiche tient sur une ligne, même sur un téléphone de 320 px', () => {
    const guides = [...Object.values(UA).flatMap((ua) => [g(ua, 0), g(ua, 5)]), ...Object.values(CHOICES).map(guideFor)]
    for (const guide of guides) expect(guide.title.length, guide.title).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('autre navigateur sur iPhone : le bouton Partager, et Safari en recours', () => {
    for (const ua of [UA.iphoneChrome, UA.iphoneFirefox, UA.iphoneEdge]) {
      const guide = g(ua)
      expect(all(guide)).toContain('« Sur l’écran d’accueil » (Add to Home Screen)')
      // la fenêtre de partage du système peut cacher l'option derrière « View More » (iOS 26) : l'indice le dit
      expect(guide.steps[1].hint).toMatch(/View More/)
      expect(guide.after).toContain('Safari')
      expect(guide.copyLink).toBe(true)
    }
    expect(g(UA.iphoneFirefox).title).toBe('Sur iPhone, avec Firefox')
  })

  it('navigateur intégré : on nomme l’app et on renvoie vers Safari (iPhone) ou Chrome (Android)', () => {
    const ios = g(UA.instagramIos)
    expect(ios.title).toBe('Ouvert dans Instagram')
    expect(all(ios)).toContain('« Ouvrir dans le navigateur »')
    expect(all(ios)).toContain('Safari')
    // l'app peut être en anglais, comme le téléphone : le libellé anglais suit le français
    expect(ios.steps[1].text).toBe('Choisis « Ouvrir dans le navigateur » ou « Ouvrir dans Safari » (Open in browser, Open in Safari).')
    expect(g(UA.facebookAndroid).steps[1].text).toBe('Choisis « Ouvrir dans le navigateur » ou « Ouvrir dans Chrome » (Open in browser, Open in Chrome).')
    expect(ios.copyLink).toBe(true)
    // avant même de toucher le bouton, on sait qu'il faut changer de navigateur (même si une invitation existe)
    expect(buttonHint(detectDevice(UA.instagramIos, 5), false)).toMatch(/Depuis Instagram, impossible d’installer.*Safari/)
    expect(buttonHint(detectDevice(UA.facebookAndroid, 5), true)).toMatch(/Depuis Facebook.*Chrome/)
    const android = g(UA.facebookAndroid)
    expect(android.title).toBe('Ouvert dans Facebook')
    expect(all(android)).toContain('Chrome')
    expect(g(UA.androidWebView).title).toBe(`Ouvert dans ${UNKNOWN_APP}`)
  })

  it('sous le bouton : ce qui va se passer', () => {
    expect(buttonHint(detectDevice(UA.androidChrome, 5), true)).toBe('Une fenêtre s’ouvre : confirme avec « Installer ».')
    expect(buttonHint(detectDevice(UA.iphoneSafari26, 5), false)).toMatch(/^Sur iPhone, Apple ne prévoit pas.*trois étapes dans Safari/)
    expect(buttonHint(detectDevice(UA.ipadDesktopMode, 5), false)).toMatch(/^Sur iPad/)
    expect(buttonHint(detectDevice(UA.androidFirefox, 5), false)).toContain('dans le menu de Firefox')
    expect(buttonHint(detectDevice(UA.desktopFirefox), false)).toBe('Le bouton te dit quoi faire avec ce navigateur.')
  })

  it('le choix manuel montre la fiche du navigateur le plus courant', () => {
    expect(guideFor(CHOICES.iphone).key).toBe('ios-safari')
    expect(guideFor(CHOICES.android).key).toBe('android-chrome')
    expect(guideFor(CHOICES.desktop).key).toBe('desktop-chrome')
  })

  it('libellés : le bouton et l’en-tête', () => {
    expect(installLabel(detectDevice(UA.iphoneSafari26, 5))).toBe('Ajouter à l’écran d’accueil')
    expect(installLabel(detectDevice(UA.androidChrome, 5))).toBe('Ajouter à l’écran d’accueil')
    expect(installLabel(detectDevice(UA.desktopChrome))).toBe('Installer l’app')
    expect(deviceLabel(detectDevice(UA.iphoneSafari26, 5))).toBe('iPhone · Safari')
    expect(deviceLabel(detectDevice(UA.ipadDesktopMode, 5))).toBe('iPad · Safari')
    expect(deviceLabel(detectDevice(UA.instagramAndroid, 5))).toBe('Android · Instagram')
    expect(deviceLabel(detectDevice(UA.desktopFirefox))).toBe('Ordinateur · Firefox')
  })

  it('typographie française une fois passée par fr() : espaces fines insécables, apostrophes courbes', () => {
    const guides = [...Object.values(UA).flatMap((ua) => [g(ua, 0), g(ua, 5)]), ...Object.values(CHOICES).map(guideFor)]
    for (const guide of guides) {
      for (const t of [guide.title, all(guide), buttonHint(detectDevice(UA.iphoneSafari26, 5), false), buttonHint(detectDevice(UA.instagramIos, 5), true)]) {
        const out = fr(t)
        expect(out).not.toMatch(/[  ][?!;:»]/)
        expect(out).not.toMatch(/«[  ]/)
        expect(out).not.toMatch(/\p{L}'\p{L}/u)
      }
    }
  })
})

describe('Invitation à installer du navigateur (beforeinstallprompt)', () => {
  /** Une fausse invitation, comme celle de Chrome : prompt() puis userChoice. */
  const fakePrompt = (outcome: 'accepted' | 'dismissed') => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
    let prompted = 0
    e.prompt = async () => {
      prompted++
    }
    e.userChoice = Promise.resolve({ outcome })
    return { e, prompted: () => prompted }
  }

  it('gardée dès son arrivée, ressortie une seule fois par le bouton, puis l’installation est notée', async () => {
    const { getInstallState, promptInstall } = await import('../install')
    expect(getInstallState().canPrompt).toBe(false)
    expect(await promptInstall()).toBe('unavailable')

    const refused = fakePrompt('dismissed')
    window.dispatchEvent(refused.e)
    // pas de bandeau du navigateur : c'est le bouton de la page qui l'ouvre
    expect(refused.e.defaultPrevented).toBe(true)
    expect(getInstallState().canPrompt).toBe(true)
    expect(await promptInstall()).toBe('dismissed')
    expect(refused.prompted()).toBe(1)
    // une invitation ne sert qu'une fois
    expect(getInstallState().canPrompt).toBe(false)
    expect(await promptInstall()).toBe('unavailable')

    const accepted = fakePrompt('accepted')
    window.dispatchEvent(accepted.e)
    expect(await promptInstall()).toBe('accepted')
    window.dispatchEvent(new Event('appinstalled'))
    expect(getInstallState()).toEqual({ canPrompt: false, installed: true })
  })
})
