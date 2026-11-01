import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Consigne, FileHead, H, IndexCard, Notebook, Page, TapeButton, TypedLink } from '../components/journal/Journal'
import { PasteLink } from '../components/PasteLink'
import { LinkModal, ShareNotesModal } from '../components/ShareNotes'
import { Seg } from '../components/ui'
import { fr, safeDate } from '../engine/format'
import { coachNameOf } from '../engine/notes'
import { learnedCount, streak } from '../engine/progress'
import { appUrl, encodePayload, reportNotes, shareSummary, shareSummaryLine, type ReportPayload } from '../engine/share'
import { useMastery } from '../store/hooks'
import type { Role } from '../store/schema'
import { useStore } from '../store/store'

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

interface Step {
  h: string
  p: string
}

/** Le mode d'emploi, vu du côté de la personne qui tient ce carnet. */
function steps(role: Role, coach: string): Step[] {
  if (role === 'coach') {
    return [
      {
        h: 'Tu écris',
        p: 'Une explication donnée en partie, notée une fois dans « Mes notes » : une astuce, une erreur à ne plus refaire, un test à retenir. Cochée pour la révision, elle devient une question.',
      },
      {
        h: 'Tu envoies un lien',
        p: '« Partager mes notes » : par défaut, seulement celles écrites depuis le dernier envoi, pour que le lien tienne dans un message Discord. Les notes voyagent dans le lien lui-même : aucun compte, aucun serveur.',
      },
      {
        h: 'Ton élève l’ouvre',
        p: 'Tes notes s’ajoutent aux siennes, au stylo rouge, et reviennent d’elles-mêmes dans sa révision au moment où elles commencent à s’effacer.',
      },
      {
        h: 'Son bilan te revient',
        p: 'Un lien en lecture seule : maîtrise de chaque entité, série de jours, et pour chacune de tes notes, retenue ou à reprendre.',
      },
    ]
  }
  const who = coach || 'Le coach'
  return [
    {
      h: `${who} écrit`,
      p: 'Une explication donnée en partie, notée une fois pour toutes : une astuce, une erreur à ne plus refaire, un test à retenir.',
    },
    {
      h: `${who} t’envoie un lien`,
      p: 'Par Discord ou par message. Les notes voyagent dans le lien lui-même : aucun compte, aucun serveur ne les garde.',
    },
    {
      h: 'Tu l’ouvres',
      p: 'Ses notes arrivent dans « Mes notes », au stylo rouge, et reviennent d’elles-mêmes dans ta révision au moment où elles commencent à s’effacer. Sur iPhone, avec le carnet installé, colle le lien sur cette page.',
    },
    {
      h: 'Tu renvoies ta progression',
      p: `Un bilan en lecture seule : maîtrise de chaque entité, série de jours, et où tu en es sur chacune de ses notes. ${coach || 'Ton coach'} voit ce qui est retenu et ce qui est à reprendre.`,
    },
  ]
}

/** Côté coach : où en sont les notes écrites ici, et l'envoi. */
function CoachShare({ onShare }: { onShare: () => void }) {
  const { state } = useStore()
  const s = shareSummary(state.notes, state.profile, state.settings.lastSharedAt)
  return (
    <IndexCard
      className="cg-card settle"
      head="Mes notes"
      right={s.lastShared != null ? `envoyées le ${safeDate(SHORT, s.lastShared)}` : 'jamais envoyées'}
      rotate={0.5}
    >
      <p className="cg-sum">{shareSummaryLine(s)}</p>
      <p>
        {fr(
          s.written
            ? 'Le lien emporte les notes que tu as écrites : par défaut, seulement les nouvelles depuis le dernier envoi.'
            : 'Le lien emportera les notes que tu écris dans « Mes notes » : écris d’abord la première.',
        )}
      </p>
      <div className="plan-actions">
        <TapeButton onClick={onShare} disabled={!s.written} disabledHint={fr('écris d’abord une note dans « Mes notes » : le lien emporte tes notes')}>
          Partager mes notes
        </TapeButton>
        <TypedLink to="/carnet">{s.written ? 'Écrire une note' : 'Écrire la première note'}</TypedLink>
      </div>
    </IndexCard>
  )
}

/** Côté coaché·e : le bilan de progression à envoyer. */
function SendProgress({ coach }: { coach: string }) {
  const { state, deck } = useStore()
  const mastery = useMastery()
  const [url, setUrl] = useState<string | null>(null)

  const build = async () => {
    const now = Date.now()
    const payload: ReportPayload = {
      kind: 'phasmo-coach/report',
      name: state.profile.name,
      at: now,
      streak: streak(state, now),
      learned: learnedCount(deck, state.cards),
      total: deck.length,
      mastery: Object.fromEntries(Object.entries(mastery).map(([k, v]) => [k, Math.round(v * 100)])),
      activity: state.activity.slice(-12).map(({ t, kind, score, total, label }) => ({ t, kind, score, total, label })),
      notes: reportNotes(state.notes, state.profile, state.cards, state.log),
    }
    setUrl(appUrl(`/rapport?d=${await encodePayload(payload)}`))
  }

  return (
    <>
      <IndexCard className="cg-card settle" head={coach ? `Bilan pour ${coach}` : 'Bilan pour le coach'} right="lecture seule" clip rotate={-0.5}>
        <p>
          {fr(
            `Un lien vers ta progression : maîtrise de chaque entité, série de jours, dernières séances, et où tu en es sur chaque note ${coach ? `de ${coach}` : 'du coach'}.`,
          )}
        </p>
        <div className="plan-actions">
          <TapeButton onClick={build}>{coach ? `Envoyer ma progression à ${coach}` : 'Envoyer ma progression au coach'}</TapeButton>
        </div>
      </IndexCard>
      <LinkModal url={url} title="Lien de progression" label="Lien de progression" onClose={() => setUrl(null)}>
        <p className="modal-text">
          {fr(`Envoie ce lien ${coach ? `à ${coach}` : 'à ton coach'} : le bilan est contenu dans le lien lui-même, aucun serveur ne le stocke.`)}
        </p>
      </LinkModal>
    </>
  )
}

/**
 * Le carnet à deux, facultatif : l'app sert à tout le monde, seul·e. Ici on dit si l'on est coaché·e
 * (coller les liens reçus, envoyer sa progression) ou si l'on coache quelqu'un (partager ses notes,
 * lire un bilan reçu). Liens internes : ?coller=1 ouvre le champ « Coller », ?partager=1 l'envoi.
 */
export function Coaching() {
  const { state, dispatch } = useStore()
  const [params, setParams] = useSearchParams()
  const profile = state.profile
  const role = profile.role
  const coach = coachNameOf(profile)
  const holder = profile.name.trim()
  const [pasteRequest, setPasteRequest] = useState(0)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    const p = params.get('partager') === '1'
    const c = params.get('coller') === '1'
    if (!p && !c) return
    if (p) setSharing(true)
    if (c) setPasteRequest((n) => n + 1)
    setParams({}, { replace: true })
  }, [params]) // seuls les paramètres du lien déclenchent ces ouvertures

  const lead = useMemo(() => {
    if (role === 'coach') return 'Tes notes partent par lien et reviennent d’elles-mêmes dans la révision de ton élève. En retour, son bilan te montre ce qui est retenu et ce qui est à reprendre.'
    if (role === 'student')
      return `Les notes ${coach ? `de ${coach}` : 'de ton coach'} arrivent par lien et reviennent d’elles-mêmes dans ta révision, au stylo rouge. En retour, tu lui envoies ta progression.`
    return 'Un coach écrit ses notes et te les envoie par lien : elles reviennent d’elles-mêmes dans ta révision, au stylo rouge. En retour, tu lui envoies un bilan de ta progression. Seul·e, l’app marche telle quelle : rien à régler ici.'
  }, [role, coach])

  const paste =
    role === 'coach'
      ? { title: 'Coller un bilan reçu', hint: 'un lien de bilan s’ouvre tout seul ; s’il est arrivé en simple texte, colle-le ici' }
      : role === 'student'
        ? { title: 'Coller un lien reçu', hint: 'un lien de notes ou de bilan reçu en simple texte : colle-le ici' }
        : { title: 'Coller un lien reçu', hint: 'un lien de notes reçu d’un coach : colle-le ici, ses notes arriveront dans « Mes notes » et tu passeras en « coaché·e »' }

  return (
    <>
      <Notebook className="coaching">
        {/* ===================== page de gauche : qui tient ce carnet ===================== */}
        <Page side="left" section="6" label="Le carnet à deux">
          <FileHead>
            <span>Coaching</span>
            <span>{holder ? <>Carnet de <b>{holder}</b></> : 'Sur cet appareil'}</span>
          </FileHead>

          <div className="entry cg-entry">
            <h1 className="entry-date">
              <em>Le carnet</em>à deux
            </h1>
            <p className="entry-line">{fr(lead)}</p>
          </div>

          <section className="cg-role" aria-labelledby="h-role">
            <H id="h-role">Sur cet appareil</H>
            <Consigne>{fr('choisis ton rôle sur cet appareil ; seul·e, il n’y a rien d’autre à régler')}</Consigne>
            <Seg
              label="Rôle sur cet appareil"
              value={role}
              onChange={(r) => dispatch({ type: 'profile', profile: { role: r } })}
              options={[
                { value: 'solo', label: 'Seul·e' },
                { value: 'student', label: 'Je suis coaché·e' },
                { value: 'coach', label: 'Je coache quelqu’un' },
              ]}
            />
            {role === 'student' && (
              <label className="field cg-coach">
                <span>Ton coach</span>
                <input
                  className="input"
                  value={profile.coachName}
                  onChange={(e) => dispatch({ type: 'profile', profile: { coachName: e.target.value } })}
                  placeholder="Prénom ou pseudo du coach"
                  maxLength={40}
                  autoComplete="off"
                />
                <small>{fr('Ses notes, signées de ce prénom, s’écrivent au stylo rouge.')}</small>
              </label>
            )}
          </section>

          {role === 'student' && <SendProgress coach={coach} />}
          {role === 'coach' && <CoachShare onShare={() => setSharing(true)} />}

          <PasteLink id="paste" title={paste.title} hint={paste.hint} folded={role !== 'student'} request={pasteRequest} />
        </Page>

        {/* ===================== page de droite : le mode d'emploi ===================== */}
        <Page side="right" section="6" label="Comment ça marche">
          <FileHead>
            <span>Pas à pas</span>
            <span>Aucun compte, aucun serveur</span>
          </FileHead>

          <section aria-labelledby="h-how">
            <H id="h-how">Comment ça marche</H>
            <ol className="cg-steps">
              {steps(role, coach).map((s, i) => (
                <li key={i}>
                  <span className="cg-n" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3>{fr(s.h)}</h3>
                  <p>{fr(s.p)}</p>
                </li>
              ))}
            </ol>
            {role === 'solo' && (
              <p className="pencil-note cg-solo">
                {fr('seul·e, rien ne change : tes notes vont dans « Mes notes » et reviennent en révision de la même façon')}
              </p>
            )}
          </section>
        </Page>
      </Notebook>

      <ShareNotesModal open={sharing} onClose={() => setSharing(false)} />
    </>
  )
}
