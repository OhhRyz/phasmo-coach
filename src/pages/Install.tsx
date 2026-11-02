import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react'
import { CircledNumber, FileHead, H, IndexCard, Notebook, Page, PaperButton, Stamp, Tape, TapeButton, TypedLink } from '../components/journal/Journal'
import { ExportedLine, useCopyProgress, useExportBackup } from '../components/Backup'
import { useToast } from '../components/Toast'
import { Seg } from '../components/ui'
import { currentDevice, type Device } from '../engine/device'
import { fr, NBSP } from '../engine/format'
import { appUrl, copyText } from '../engine/share'
import { promptInstall, useInstallState, useStandalone } from '../install'
import { useStore } from '../store/store'
import { buttonHint, CHOICES, choiceOf, deviceLabel, discordMessage, guideFor, installLabel, menuOf, type DeviceChoice, type Guide } from './installGuide'

type Style = CSSProperties & Record<`--${string}`, string | number>

// le code QR ne sert que sur ordinateur : son générateur se charge avec lui, pas avec le reste de l'app
const QrCode = lazy(() => import('../components/QrCode'))

function reducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

const CHOICE_OPTIONS: { value: DeviceChoice; label: string }[] = [
  { value: 'iphone', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'desktop', label: 'Ordinateur' },
]

/** Le lien de cette page, à ouvrir dans le bon navigateur (ou sur le téléphone, ou à envoyer à son élève). */
function CopyLink({ label = 'Copier le lien' }: { label?: string }) {
  const toast = useToast()
  const [showUrl, setShowUrl] = useState(false)
  const url = appUrl('/installer')
  return (
    <div className="install-copy">
      <PaperButton
        rotate={-0.8}
        onClick={async () => {
          if (await copyText(url)) toast('Lien copié')
          else {
            setShowUrl(true)
            toast(fr('Copie impossible : le lien est sélectionné, copie-le à la main'))
          }
        }}
      >
        {label}
      </PaperButton>
      {showUrl && (
        <textarea
          className="textarea share-url install-url"
          readOnly
          autoFocus
          value={url}
          onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
          aria-label="Lien de cette page"
        />
      )}
    </div>
  )
}

/**
 * La fiche de la marche à suivre : trois étapes numérotées, une par ligne. `detected` : l'appareil qui affiche
 * la page (la mise en garde sur la mémoire de l'iPhone ne vaut que pour lui) ; `chosen` : un autre appareil
 * choisi à la main (on regarde les étapes pour quelqu'un d'autre : le lien est à copier).
 */
function GuideCard({
  guide,
  detected,
  chosen,
  copyLabel,
  keepData,
  cardRef,
  shown,
}: {
  guide: Guide
  detected: Device
  chosen: boolean
  copyLabel?: string
  keepData: boolean
  cardRef: Ref<HTMLElement>
  /** Combien de fois le bouton l'a montrée : à chaque fois, son titre est surligné à nouveau. */
  shown: number
}) {
  const n = guide.steps.length
  // iPhone avec une progression : la copier vient avant tout, sinon on ouvre l'app installée sans rien à y coller
  const keep = keepData && !chosen && detected.os === 'ios' && !detected.inApp
  return (
    <section
      className={`install-guide settle${shown > 1 ? ' is-asked' : ''}`}
      id="marche-a-suivre"
      aria-labelledby="h-install-guide"
      ref={cardRef}
      tabIndex={-1}
      style={{ '--r': '-.4deg', '--d': '.05s' } as Style}
    >
      <IndexCard
        head={
          <span id="h-install-guide" key={shown} className="pocket-hl">
            {guide.title}
          </span>
        }
        right={n ? `${n}${NBSP}étapes` : undefined}
        rotate={0}
      >
        <Tape />
        {keep && <KeepData />}
        {guide.intro && <p className="install-intro">{fr(guide.intro)}</p>}
        {n > 0 && (
          <ol className="guide-steps install-steps">
            {guide.steps.map((s, i) => (
              <li key={i}>
                <CircledNumber n={i + 1} delay={0.2 + i * 0.2} />
                <div>
                  <p>{fr(s.text)}</p>
                  {s.hint && <p className="install-hint">{fr(s.hint)}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {guide.after && <p className="install-after">{fr(guide.after)}</p>}
        {(guide.copyLink || chosen) && <CopyLink label={chosen ? copyLabel : undefined} />}
      </IndexCard>
    </section>
  )
}

/**
 * Sur ordinateur, le carnet est d'abord fait pour le téléphone : le code QR de cette page, à scanner avec lui,
 * et un message prêt à coller dans Discord (pour soi, ou pour quelqu'un d'autre).
 */
function PhoneSection() {
  const toast = useToast()
  const [showMessage, setShowMessage] = useState(false)
  const url = appUrl('/installer')
  const message = discordMessage(url)
  return (
    <section className="install-phone" aria-labelledby="h-install-phone">
      <H id="h-install-phone">Sur un téléphone</H>
      <div className="install-phone-body">
        <div className="install-qr settle" style={{ '--r': '-1deg', '--d': '.15s' } as Style}>
          <Tape />
          <Suspense fallback={<span className="qr qr--wait" />}>
            <QrCode text={url} label="Code QR du lien de cette page" />
          </Suspense>
        </div>
        <div className="install-phone-text">
          <p>{fr('Scanne ce code avec l’appareil photo du téléphone : cette page s’y ouvre, avec les étapes pour l’installer.')}</p>
          <p>{fr('Ou envoie le lien sur Discord, pour toi ou pour quelqu’un d’autre :')}</p>
          <div className="install-copy">
            <PaperButton
              rotate={-0.8}
              onClick={async () => {
                if (await copyText(message)) toast(fr('Message copié : colle-le dans Discord'))
                else {
                  setShowMessage(true)
                  toast(fr('Copie impossible : le message est sélectionné, copie-le à la main'))
                }
              }}
            >
              Copier un message pour Discord
            </PaperButton>
            {showMessage && (
              <textarea
                className="textarea share-url install-url install-message"
                readOnly
                autoFocus
                value={message}
                onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
                aria-label="Message pour Discord"
              />
            )}
          </div>
          <p className="pencil-note install-message-what">le lien, puis une ligne pour iPhone (Safari) et une pour Android (Chrome)</p>
        </div>
      </div>
    </section>
  )
}

/**
 * iPhone : l'app installée a sa propre mémoire, séparée du navigateur, et repart d'une page blanche. Deux
 * gestes pour y retrouver sa progression : la copier ici, avant les étapes d'installation, la coller dans
 * l'app ; le fichier reste possible.
 */
function KeepData() {
  const copyProgress = useCopyProgress(
    'C’est copié. Ajoute maintenant l’app à l’écran d’accueil (étapes ci-dessous), ouvre-la, puis touche « Coller ma progression » sur sa première page.',
  )
  const { exportFile, exported } = useExportBackup()
  return (
    <div className="install-keep">
      <p>{fr('Avant tout : l’app installée a sa propre mémoire, séparée du navigateur, et repart d’une page blanche. Pour y retrouver ta progression :')}</p>
      <ol className="install-keep-steps">
        <li>{fr('ici, avant d’installer l’app, touche « Copier ma progression » ;')}</li>
        <li>{fr('dans l’app installée, sur sa première page, touche « Coller ma progression ».')}</li>
      </ol>
      <div className="install-copy">
        <PaperButton rotate={-0.8} onClick={copyProgress.copy}>
          Copier ma progression
        </PaperButton>
      </div>
      {copyProgress.panel}
      <p className="install-keep-alt">
        {fr('Autre solution, avec un fichier :')} <TypedLink onClick={exportFile}>exporter ma sauvegarde</TypedLink>
        {fr(', puis importe-la dans l’app (sur sa première page, ou dans son profil).')}
      </p>
      <ExportedLine name={exported} />
    </div>
  )
}

export function InstallPage() {
  const { state } = useStore()
  const detected = useMemo(currentDevice, [])
  const standalone = useStandalone()
  const { canPrompt, installed } = useInstallState()
  const [choice, setChoice] = useState<DeviceChoice | null>(null)
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null)
  const busy = useRef(false)
  const [chooser, setChooser] = useState(false)
  const [focusGuide, setFocusGuide] = useState(0)
  const cardRef = useRef<HTMLElement>(null)
  const backRef = useRef<HTMLParagraphElement>(null)

  const device = choice ? CHOICES[choice] : detected
  // la fenêtre du navigateur installe sur l'appareil qui affiche la page : pas quand on regarde les étapes d'un autre
  const promptHere = canPrompt && choice === null
  const guide = guideFor(device)
  const label = installLabel(device)
  const hasData = state.log.length > 0 || state.activity.length > 0 || state.notes.length > 0

  // la fiche vient de s'ouvrir : on la montre et le lecteur d'écran la lit
  useEffect(() => {
    if (!focusGuide) return
    const raf = requestAnimationFrame(() => {
      const card = cardRef.current
      if (!card) return
      card.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
      card.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [focusGuide])

  // à chaque fois, la fiche est montrée (défilement, focus) et, déjà ouverte, son titre surligné à nouveau
  const showGuide = () => {
    setOpen(true)
    setFocusGuide((n) => n + 1)
  }

  const onInstall = async () => {
    // Chrome, Edge, Samsung Internet : la vraie fenêtre d'installation du navigateur
    if (promptHere && !device.inApp) {
      if (busy.current) return
      busy.current = true
      const r = await promptInstall()
      busy.current = false
      if (r === 'accepted') {
        setOutcome('accepted')
        return
      }
      setOutcome(r === 'dismissed' ? 'dismissed' : null)
    }
    // iPhone, Firefox, invitation déjà utilisée… : la marche à suivre pour ce navigateur
    showGuide()
  }

  const where = detected.os === 'desktop' ? 'cet ordinateur' : 'ton écran d’accueil'
  // sur ordinateur, les étapes des téléphones se lisent sans rien déplier, à côté du code QR
  const onComputer = detected.os === 'desktop'
  const chooseDevice = (v: DeviceChoice) => {
    // revenir à l'appareil reconnu rend sa vraie marche à suivre (navigateur, app…)
    setChoice(v === choiceOf(detected) ? null : v)
    setOutcome(null)
    showGuide()
  }
  const done = installed || outcome === 'accepted'

  const before =
    outcome === 'dismissed' ? `Installation annulée. Tu peux aussi passer par ${menuOf(device.browser)} : les étapes sont ci-dessous.` : buttonHint(device, promptHere)

  // installation acceptée : le bouton disparaît, le focus passe au lien qui le remplace (au lieu de tomber sur la page)
  useEffect(() => {
    if (outcome === 'accepted') backRef.current?.querySelector<HTMLElement>('a')?.focus()
  }, [outcome])

  return (
    <Notebook single className="installer">
      <Page section="1" label="Installer l’app">
        <FileHead>
          <span>Installer l’app</span>
          <span>{standalone ? 'App installée' : deviceLabel(device)}</span>
        </FileHead>

        <div className="entry">
          <h1 className="entry-date">
            <em>{device.os === 'desktop' ? 'Le carnet dans sa propre fenêtre' : 'Le carnet sur ton écran d’accueil'}</em>
            Installer l’app
          </h1>
          {(standalone || installed) && (
            <Stamp thunk rotate={-6} tone="violet">
              Installée
            </Stamp>
          )}
          {/* une seule ligne, zone annoncée dès le départ : quand l'installation se fait, seul son texte change */}
          <p className="entry-line" role="status">
            {standalone
              ? 'L’app est déjà installée sur cet appareil.'
              : done
                ? fr(installed ? `C’est fait : l’app est sur ${where}. Ouvre-la depuis là.` : `C’est parti : l’app s’installe sur ${where}.`)
                : fr(
                    device.os === 'desktop'
                      ? 'Installée, l’app s’ouvre dans sa propre fenêtre et marche même hors ligne.'
                      : 'Installée, l’app s’ouvre d’un geste depuis l’écran d’accueil, en plein écran, et marche même hors ligne.',
                  )}
          </p>
        </div>

        {standalone || done ? (
          <>
            <p className="install-back" ref={backRef}>
              <TypedLink to="/">Retour à l’accueil</TypedLink>
            </p>
            {onComputer && <PhoneSection />}
          </>
        ) : (
          <>
            <div className="install-go">
              <TapeButton onClick={onInstall}>
                {label}
              </TapeButton>
              <p className="pencil-note install-before">{fr(before)}</p>
              {device.os === 'android' && !device.inApp && (
                <p className="pencil-note install-name">{fr('Le nom sous l’icône sera « Phasmo Coach » : sur Android, il ne se change pas à l’installation.')}</p>
              )}
            </div>

            {/* sur ordinateur, les étapes des téléphones se lisent sans rien déplier : le choix se fait juste
                au-dessus de la fiche qu'il change */}
            {onComputer && (
              <div className="install-choose install-choose--open">
                <span className="typed-label">Les étapes pour</span>
                <Seg label="Les étapes pour" value={choice ?? choiceOf(detected)} options={CHOICE_OPTIONS} onChange={chooseDevice} />
              </div>
            )}

            {open && (
              <GuideCard
                guide={guide}
                detected={detected}
                chosen={choice !== null}
                copyLabel={state.profile.role === 'coach' ? 'Copier le lien pour ton élève' : undefined}
                keepData={hasData}
                cardRef={cardRef}
                shown={focusGuide}
              />
            )}

            {onComputer ? (
              <PhoneSection />
            ) : (
              <div className="install-other">
                <button type="button" className="link link-btn" aria-expanded={chooser} aria-controls="install-choose" onClick={() => setChooser((v) => !v)}>
                  {fr('Ce n’est pas ton appareil ?')}
                </button>
                {chooser && (
                  <div id="install-choose" className="install-choose">
                    <span className="typed-label">Ton appareil</span>
                    <Seg label="Ton appareil" value={choice ?? choiceOf(detected)} options={CHOICE_OPTIONS} onChange={chooseDevice} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Page>
    </Notebook>
  )
}
