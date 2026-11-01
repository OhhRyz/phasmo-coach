import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  CircledNumber,
  Envelope,
  FileHead,
  H,
  IndexCard,
  MarginNote,
  Notebook,
  Page,
  Polaroid,
  RoughCircle,
  Stamp,
  Sticky,
  Tally,
  Tape,
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { UvPrint } from '../components/journal/Charts'
import { GHOSTS, getGhost } from '../data'
import { buildReviewQueue, streak, WEAK_COUNT, weakestGhosts } from '../engine/progress'
import { dayKey, fr, NBSP, NNBSP, num, safeDate } from '../engine/format'
import { coachNameOf, coachNotes, isOwnNote, sortNotes } from '../engine/notes'
import { shareSummary, shareSummaryLine } from '../engine/share'
import { installHint, platform } from '../engine/device'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'
import { EXHIBITS } from './exhibits'

type Style = CSSProperties & Record<`--${string}`, string | number>

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pct = (m: number) => `${Math.round(m * 100)}${NBSP}%`
/** Noms longs (« Les Jumeaux », « Poltergeist »…) : écrits un peu plus petit sous le polaroïd. */
const longName = (name: string) => name.length > 8

/** La fiche « Mode d'emploi » a été rangée (une fois lue) : elle ne revient que par le lien du pied de page. */
const GUIDE_KEY = 'phasmo-coach/guide'
function readGuideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) != null
  } catch {
    return false
  }
}
function storeGuideSeen() {
  try {
    localStorage.setItem(GUIDE_KEY, String(Date.now()))
  } catch {
    /* stockage bloqué : la fiche reviendra au prochain lancement, sans gêner */
  }
}

/** Le carnet est-il sur une seule colonne (téléphone, tablette) ? Les exercices passent alors sous « Les suspects ». */
const STACKED = '(max-width: 1180px)'
function useStacked(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof matchMedia === 'undefined') return () => {}
      const mq = matchMedia(STACKED)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => typeof matchMedia !== 'undefined' && matchMedia(STACKED).matches,
  )
}

/** Flèche au crayon vers le bas (« les exercices sont en bas de page »). */
function PencilArrowDown() {
  return (
    <svg className="draw" width="40" height="46" viewBox="0 0 46 52" aria-hidden>
      <path d="M10 2 C 2 18, 8 34, 30 46" strokeWidth="2" pathLength={1} style={{ '--d': '.9s' } as Style} />
      <path d="M19 47 L31 47 L27 36" strokeWidth="2" pathLength={1} style={{ '--d': '1.5s', '--dur': '.3s' } as Style} />
    </svg>
  )
}

/** « 10 questions · ≈ 3 min » : chaque morceau reste d'un bloc, la ligne ne se coupe qu'après un « · ». */
const metaLine = (meta: string) =>
  meta
    .split(' · ')
    .map((seg) => seg.replace(/ /g, NBSP))
    .join(`${NBSP}· `)

/** Sur iPhone, l'app installée ne reprend pas ce qui a été noté dans l'onglet de Safari. */
const IOS_FRESH_START = 'Fais-le avant de commencer : le carnet installé repart d’une page blanche.'
const IOS_KEEP_DATA = 'Le carnet installé repart de zéro : exporte d’abord ta sauvegarde, puis importe-la dedans (page profil).'

function Welcome() {
  const { dispatch } = useStore()
  const [name, setName] = useState('')
  const hint = useMemo(() => installHint(), [])
  const ios = useMemo(() => platform() === 'ios', [])
  return (
    <Notebook single className="home">
      <Page section="1" label="Nouveau carnet">
        <FileHead>
          <span>Nouveau carnet</span>
          <span>
            Entrée n°{NBSP}
            <b>1</b>
          </span>
        </FileHead>
        <div className="entry welcome-entry">
          <h1 className="entry-date">
            <em>Un carnet pour</em>apprendre les entités de Phasmophobia
          </h1>
          <Stamp thunk rotate={-6} tone="violet">
            Confidentiel
          </Stamp>
          <p className="entry-line">
            {fr(
              `Réviser les ${GHOSTS.length} entités en 5 minutes par jour, t'entraîner sur des quiz et des contrats simulés, et garder le codex sous la main pendant tes parties.`,
            )}
          </p>
        </div>
        {hint && (
          <div className="pencil-note install-note">
            <p>
              {fr(hint)}
              {ios && ` ${fr(IOS_FRESH_START)}`}
            </p>
          </div>
        )}
        <form
          className="stack welcome-form"
          style={{ '--gap': '22px' } as Style}
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            // le rôle reste celui du carnet (seul·e par défaut, coaché·e si le lien d'un coach a déjà été ouvert ;
            // onboardProfile repasse en seul·e quand ce « coach » porte le prénom saisi)
            dispatch({ type: 'onboard', profile: { name: name.trim() } })
            // même adresse, autre écran : on repart du haut de la page
            window.scrollTo({ top: 0 })
          }}
        >
          <label className="field">
            <span>Ton prénom</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom ou pseudo" autoFocus required maxLength={40} />
          </label>
          <p className="pencil-note welcome-local">{fr('aucun compte : tout reste sur cet appareil (sauvegarde possible depuis le profil)')}</p>
          <div className="welcome-go">
            <TapeButton type="submit" disabled={!name.trim()} disabledHint={fr('écris ton prénom (ou un pseudo) pour ouvrir le carnet')}>
              Ouvrir le carnet
            </TapeButton>
          </div>
          <p className="pencil-note welcome-next">{fr('à l’ouverture, un mode d’emploi en trois étapes te montre par où commencer')}</p>
          <p className="pencil-note welcome-coaching">
            {fr('être coaché·e, ou coacher quelqu’un : ça se règle plus tard, depuis le lien « Coaching » en bas de chaque page')}
          </p>
        </form>
      </Page>
    </Notebook>
  )
}

/**
 * Mode d'emploi, une seule fois après l'ouverture du carnet (puis par le lien du pied de page) : les trois
 * usages de l'app, dans l'ordre où on s'en sert, avec les noms des onglets.
 */
function Guide({ stacked, onDone }: { stacked: boolean; onDone: (to?: string) => void }) {
  return (
    <section className="guide settle" id="mode-d-emploi" aria-labelledby="h-guide" style={{ '--r': '-.4deg', '--d': '.15s' } as Style}>
      <IndexCard head={<span id="h-guide">Mode d’emploi</span>} right="à lire une fois" rotate={0}>
        <Tape />
        <ol className="guide-steps">
          <li>
            <CircledNumber n={1} delay={0.5} />
            <div>
              <b className="guide-k">Réviser</b> <span className="guide-when">chaque jour, ≈{NBSP}5{NBSP}min</span>
              <p>{fr('Des questions à choix multiple sur les entités ; le carnet te repose ce que tu commences à oublier.')}</p>
            </div>
          </li>
          <li>
            <CircledNumber n={2} delay={0.7} />
            <div>
              <b className="guide-k">Exercices</b> <span className="guide-when">les enveloppes kraft</span>
              <p>
                {fr(
                  `Quiz, contrat simulé, bruits de pas : ${stacked ? 'les enveloppes sont plus bas, après « Les suspects »' : 'les enveloppes sont en bas de la page'}. Touche une enveloppe pour l'ouvrir.`,
                )}
              </p>
            </div>
          </li>
          <li>
            <CircledNumber n={3} delay={0.9} />
            <div>
              <b className="guide-k">Codex</b> <span className="guide-when">pendant une partie</span>
              <p>{fr(`Les ${GHOSTS.length} fiches. En jeu, coche tes preuves dans le carnet de preuves : il barre les entités qui ne collent plus.`)}</p>
            </div>
          </li>
        </ol>
        <div className="plan-actions guide-actions">
          <TapeButton onClick={() => onDone('/revision')}>Commencer par la révision</TapeButton>
          <TypedLink onClick={() => onDone()}>J’ai compris, ranger la fiche</TypedLink>
        </div>
        <p className="pencil-note guide-again">{fr('tu la retrouveras en bas de chaque page : « Mode d’emploi »')}</p>
      </IndexCard>
    </section>
  )
}

/** Côté coach : écrire, partager, lire le bilan reçu (la page « Coaching » fait le reste). */
function CoachCard() {
  const { state } = useStore()
  const s = shareSummary(state.notes, state.profile, state.settings.lastSharedAt)
  return (
    <IndexCard
      className="coach-card settle"
      head="Pour ton élève"
      right={s.lastShared != null ? `partagé le ${safeDate(SHORT, s.lastShared)}` : undefined}
      rotate={0.5}
    >
      <p className="coach-sum">{shareSummaryLine(s)}</p>
      <p>
        {fr('Ce que tu lui expliques, note-le dans « Mes notes », puis partage-le : une note ajoutée à la révision revient d’elle-même dans ses séances.')}
      </p>
      <div className="plan-actions">
        <TapeButton to="/carnet">Écrire une note</TapeButton>
        <TypedLink to="/coaching?partager=1">Partager mes notes</TypedLink>
        <TypedLink to="/coaching?coller=1">Coller un bilan reçu</TypedLink>
      </div>
      <p className="pencil-note">{fr('Un lien de bilan s’ouvre tout seul ; s’il est arrivé en simple texte, colle-le dans la page « Coaching ».')}</p>
    </IndexCard>
  )
}

export function Home() {
  const { state, deck } = useStore()
  const mastery = useMastery()
  const now = useMemo(() => Date.now(), [])
  const queue = useMemo(() => buildReviewQueue(state, deck, now), [state, deck, now])
  const hint = useMemo(() => installHint(), [])
  const ios = useMemo(() => platform() === 'ios', [])
  const stacked = useStacked()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const asked = params.get('guide') === '1'
  const [guideSeen, setGuideSeen] = useState(readGuideSeen)
  const showGuide = state.onboarded && (asked || !guideSeen)

  // rouverte depuis le pied de page : on descend jusqu'à la fiche (le focus suit, pour le clavier)
  useEffect(() => {
    if (!asked || !state.onboarded) return
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById('mode-d-emploi')
      if (!el) return
      el.scrollIntoView({ block: 'start' })
      el.querySelector<HTMLElement>('.btn-tape')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [asked, state.onboarded])

  const closeGuide = (to?: string) => {
    storeGuideSeen()
    setGuideSeen(true)
    if (to) {
      navigate(to)
      return
    }
    if (asked) setParams({}, { replace: true })
    // la fiche disparaît : le focus passe à l'action suivante, la révision du jour
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.home .plan .btn-tape')?.focus())
  }

  const days = streak(state, now)
  const { activeDays, today } = useMemo(() => {
    const set = new Set<string>()
    state.log.forEach((l) => set.add(dayKey(l.t)))
    state.activity.forEach((a) => set.add(dayKey(a.t)))
    return { activeDays: set.size, today: set.has(dayKey(now)) }
  }, [state.log, state.activity, now])
  // le numéro d'entrée ne compte la journée qu'une fois, qu'il y ait déjà eu une séance aujourd'hui ou non
  const entryN = activeDays + (today ? 0 : 1)
  const streakLine =
    days === 0
      ? 'Pas encore de séance aujourd’hui. Quelques minutes suffisent pour lancer une série.'
      : today
        ? days === 1
          ? 'Une séance aujourd’hui : la série commence.'
          : `${days} jours d’affilée, aujourd’hui compris.`
        : days === 1
          ? 'Une séance hier : une autre aujourd’hui, et la série commence.'
          : `${days} jours d’affilée jusqu’à hier : une séance aujourd’hui prolonge la série.`

  const weak = useMemo(() => weakestGhosts(GHOSTS.map((g) => g.id), mastery, deck, state, WEAK_COUNT), [mastery, deck, state])
  const suspects = weak.ids.map((id) => getGhost(id)).filter((g) => g != null)
  const shown = suspects.slice(0, 3)
  const more = suspects.slice(3)
  const weakCount = weak.started
    ? suspects.length === 1
      ? 'la moins maîtrisée'
      : `les ${suspects.length} moins maîtrisées`
    : 'à découvrir'

  const dueCount = queue.filter((c) => state.cards[c.id]).length
  const newCount = queue.length - dueCount
  const minutes = Math.max(1, Math.round(queue.length * 0.4))
  const onMenu = [...new Set(queue.map((c) => c.ghostId).filter((id): id is string => !!id))].map((id) => getGhost(id)?.name).filter(Boolean)
  const acquired = GHOSTS.filter((g) => (mastery[g.id] ?? 0) >= 0.85).length
  const untouched = GHOSTS.filter((g) => (mastery[g.id] ?? 0) === 0).length
  const inProgress = GHOSTS.length - acquired - untouched
  const role = state.profile.role
  const isCoach = role === 'coach'
  const coach = coachNameOf(state.profile)
  // coach et coaché·e : les vraies notes du coach (stylo rouge) ; seul·e : ses propres notes (encre)
  const notes = (
    role === 'solo' ? sortNotes(state.notes.filter((n) => isOwnNote(n, state.profile) || !n.author)) : coachNotes(state.notes, state.profile)
  ).slice(0, 2)
  const lastOf = (kind: string) => [...state.activity].reverse().find((a) => a.kind === kind)
  const lastQuiz = lastOf('quiz')
  const lastScenario = lastOf('scenario')
  const lastEar = lastOf('ear')
  const hasData = state.log.length > 0 || state.activity.length > 0 || state.notes.length > 0

  if (!state.onboarded) return <Welcome />

  const notYet = 'pas encore fait'
  const steps = (
    <svg viewBox="0 0 170 22" className="steps-doodle" aria-hidden>
      <g fill="currentColor">
        {[8, 30, 52, 74, 91, 106, 119, 131, 142, 152, 162].map((x, i) => (
          <ellipse key={x} cx={x} cy={i % 2 ? 7 : 15} rx="4.5" ry="2.6" />
        ))}
      </g>
    </svg>
  )
  // ===================== les exercices (enveloppes) : sur le bureau, ou dans la page sur une colonne =====================
  const shelf = (
    <section className={`desk-shelf home-shelf${stacked ? ' home-shelf--in-page' : ''}`} aria-labelledby="h-shelf">
      <div className="home-shelf-head">
        <h2 className="shelf-label" id="h-shelf">
          Exercices · pièces à conviction
        </h2>
        <p className="pencil-note home-shelf-hint">touche une enveloppe pour l’ouvrir</p>
      </div>
      <div className="envelopes">
        <Envelope
          to={EXHIBITS.situation.to}
          piece="Exercice"
          title={EXHIBITS.situation.title}
          text={fr(EXHIBITS.situation.what)}
          meta={metaLine(EXHIBITS.situation.meta)}
          action={EXHIBITS.situation.action}
          hand={
            lastScenario ? (
              <>
                dernier contrat{NNBSP}:{' '}
                <span className="env-score">
                  {num(lastScenario.score)}
                  {NBSP}pts
                </span>
              </>
            ) : (
              notYet
            )
          }
          rotate={-1.5}
          delay={0.2}
        />
        <Envelope
          to={EXHIBITS.quiz.to}
          piece="Exercice"
          title={EXHIBITS.quiz.title}
          text={fr(EXHIBITS.quiz.what)}
          meta={metaLine(EXHIBITS.quiz.meta)}
          action={EXHIBITS.quiz.action}
          hand={
            lastQuiz ? (
              <>
                dernier{NNBSP}: <span className="env-score">{`${lastQuiz.score}/${lastQuiz.total}`}</span>
              </>
            ) : (
              notYet
            )
          }
          rotate={1.2}
          labelRotate={-0.8}
          delay={0.3}
        />
        <Envelope
          to={EXHIBITS.oreille.to}
          piece="Exercice"
          title={EXHIBITS.oreille.title}
          text={fr(EXHIBITS.oreille.what)}
          meta={metaLine(EXHIBITS.oreille.meta)}
          action={EXHIBITS.oreille.action}
          hand={
            lastEar ? (
              <>
                dernière{NNBSP}: <span className="env-score">{`${lastEar.score}/${lastEar.total}`}</span>
              </>
            ) : (
              notYet
            )
          }
          rotate={-0.8}
          delay={0.4}
        >
          {steps}
        </Envelope>
        <Envelope
          to={EXHIBITS.codex.to}
          piece="À lire"
          title={EXHIBITS.codex.title}
          text={fr(EXHIBITS.codex.what)}
          meta={metaLine(EXHIBITS.codex.meta)}
          action={EXHIBITS.codex.action}
          hand={acquired ? `${acquired} acquise${acquired > 1 ? 's' : ''} sur ${GHOSTS.length}` : undefined}
          rotate={1.8}
          labelRotate={0.4}
          delay={0.5}
        />
      </div>
    </section>
  )

  return (
    <>
      <Notebook className="home">
        {/* ===================== page de gauche : aujourd'hui ===================== */}
        <Page side="left" section="1" label="Aujourd’hui">
          <FileHead>
            <span>
              Carnet de <b>{state.profile.name || '—'}</b>
            </span>
            {isCoach ? (
              <span>
                Rôle{NNBSP}: <b>coach</b>
              </span>
            ) : (
              role === 'student' &&
              coach && (
                <span>
                  Coach{NNBSP}: <b>{coach}</b>
                </span>
              )
            )}
          </FileHead>

          <div className="entry">
            <h1 className="entry-date">
              <em>{cap(WEEKDAY.format(now))}</em>
              {DAY_MONTH.format(now)}
            </h1>
            <Stamp thunk rotate={-7} delay={0.35} tone="violet">
              Entrée n°{NBSP}
              {entryN}
            </Stamp>
            <p className="entry-line">{fr(streakLine)}</p>
            {days > 0 && (
              <MarginNote className="tally-note" style={{ left: -104, top: 6, width: 80, '--r': '-4deg' }}>
                <Tally n={days} />
                <span>
                  {days} jour{days > 1 ? 's' : ''}
                </span>
              </MarginNote>
            )}
          </div>

          {hint && (
            <div className="pencil-note install-note">
              <p>
                {fr(hint)}
                {ios && hasData && ` ${fr(IOS_KEEP_DATA)}`}
              </p>
              {ios && hasData && <TypedLink to="/profil">Exporter ma sauvegarde</TypedLink>}
            </div>
          )}

          {showGuide && <Guide stacked={stacked} onDone={closeGuide} />}

          {isCoach && <CoachCard />}

          <IndexCard className="plan settle" head="Révision du jour" right={SHORT.format(now)} clip rotate={-0.6}>
            {queue.length > 0 ? (
              <>
                <div className="plan-n">
                  <b>{queue.length}</b>
                  <span>question{queue.length > 1 ? 's' : ''}</span>
                  <small>
                    environ {minutes}
                    {NBSP}min
                  </small>
                </div>
                <p>
                  <strong>
                    {dueCount > 0 && `${dueCount} à revoir`}
                    {dueCount > 0 && newCount > 0 && ', '}
                    {newCount > 0 && `${newCount} nouvelle${newCount > 1 ? 's' : ''}`}.
                  </strong>{' '}
                  {onMenu.length > 0 &&
                    fr(`Au menu : ${onMenu.slice(0, 4).join(', ')}${onMenu.length > 4 ? `… et ${onMenu.length - 4} autre${onMenu.length - 4 > 1 ? 's' : ''}` : ''}.`)}
                </p>
                <div className="plan-actions">
                  <TapeButton to="/revision">Commencer la révision</TapeButton>
                  <TypedLink to="/quiz?n=5">ou un quiz rapide (5 questions)</TypedLink>
                </div>
              </>
            ) : (
              <>
                <div className="plan-n plan-n--none">
                  <span>Aucune question à revoir</span>
                </div>
                <p>
                  {fr(
                    'Tout est révisé pour aujourd’hui : les questions reviendront d’elles-mêmes au bon moment. En attendant, entraîne-toi sur une mise en situation.',
                  )}
                </p>
                <div className="plan-actions">
                  <TapeButton to={EXHIBITS.situation.to}>Prendre un contrat</TapeButton>
                  <TypedLink to="/revision">apprendre de nouvelles questions</TypedLink>
                </div>
              </>
            )}
          </IndexCard>

          {!stacked && (
            <p className="pencil-note home-down" aria-hidden>
              les exercices sont en bas de page
              <PencilArrowDown />
            </p>
          )}

          <section className="suspects" aria-labelledby="h-suspects">
            <H id="h-suspects" count={suspects.length ? weakCount : 'toutes acquises'}>
              Les suspects
            </H>
            {suspects.length > 0 ? (
              <>
                <p className="pencil-note suspects-legend">{fr('les entités à travailler en priorité · touche une photo pour lire sa fiche')}</p>
                <div className="polaroids">
                  {shown.map((g, i) => (
                    <div className="suspect" key={g.id}>
                      <Polaroid
                        ghostId={g.id}
                        to={`/codex/${g.id}`}
                        caption={<span className={longName(g.name) ? 'cap-name cap-name--long' : 'cap-name'}>{g.name}</span>}
                        small={weak.started ? pct(mastery[g.id] ?? 0) : undefined}
                        rotate={[-4, 3, -2][i]}
                        delay={0.45 + i * 0.13}
                      />
                      {g.keyTells[0] && <p className="hint pencil-note">{g.keyTells[0]}</p>}
                    </div>
                  ))}
                </div>
                {more.length > 0 && (
                  <p className="suspects-more">
                    <span className="typed-label">Puis</span>
                    {more.map((g) => (
                      <Link key={g.id} to={`/codex/${g.id}`}>
                        {g.name}
                        {weak.started && <small>{pct(mastery[g.id] ?? 0)}</small>}
                      </Link>
                    ))}
                  </p>
                )}
                {!weak.started && (
                  <p className="pencil-note suspects-start">{fr('Aucune entité travaillée pour l’instant : commence par la révision du jour.')}</p>
                )}
              </>
            ) : (
              <p className="suspects-start">Toutes les entités sont acquises.</p>
            )}
            <div className="after">
              {suspects.length > 0 && (
                <TypedLink to="/quiz?pool=weak">
                  {weak.started
                    ? `Quiz sur ${suspects.length === 1 ? 'la moins maîtrisée' : `les ${suspects.length} moins maîtrisées`}`
                    : `Quiz sur ces ${suspects.length} entités`}
                </TypedLink>
              )}
              <TypedLink to="/codex">Ouvrir le codex</TypedLink>
            </div>
          </section>

          {/* une seule colonne : les exercices juste après les suspects, avant le registre */}
          {stacked && shelf}
        </Page>

        {/* ===================== page de droite : le registre ===================== */}
        <Page side="right" section="1" label="Ta progression">
          <UvPrint style={{ right: 4, top: 170, width: 112, transform: 'rotate(-16deg)', ['--ur' as string]: '220px' }} />
          <div className="coffee" style={{ right: 24, bottom: 30 }} />
          <FileHead>
            <span>Registre</span>
            <span>Mis à jour le {SHORT.format(now)}</span>
          </FileHead>

          <section aria-labelledby="h-reg">
            <H id="h-reg" count={`${acquired ? `${acquired} acquise${acquired > 1 ? 's' : ''}` : 'aucune acquise'} sur ${GHOSTS.length}`}>
              Les {GHOSTS.length} entités
            </H>
            <p className="registry-legend">Ta maîtrise est surlignée{NNBSP}; les entités acquises sont entourées.</p>
            <p className="pencil-note registry-tap">touche un nom pour ouvrir sa fiche</p>
            <ol className="registry">
              {GHOSTS.map((g, i) => {
                const m = mastery[g.id] ?? 0
                const ok = m >= 0.85
                const cls = ok ? 'ok' : m === 0 ? 'zero' : m < 0.4 ? 'weak' : undefined
                return (
                  <li key={g.id} className={cls} style={{ '--m': m } as Style}>
                    <span className="num">{String(i + 1).padStart(2, '0')}</span>
                    <Link className="nm" to={`/codex/${g.id}`} style={{ '--i': i } as Style}>
                      {ok ? (
                        <RoughCircle seed={g.id} delay={1.1 + i * 0.03}>
                          {g.name}
                        </RoughCircle>
                      ) : (
                        g.name
                      )}
                    </Link>
                    <span className="pct">{m === 0 ? '–' : Math.round(m * 100)}</span>
                  </li>
                )
              })}
            </ol>
            <div className="registry-sum">
              <span>
                <b>{acquired || 'aucune'}</b> acquise{acquired > 1 ? 's' : ''}
              </span>
              <span>
                <b>{inProgress || 'aucune'}</b> en cours
              </span>
              <span>
                {untouched ? (
                  <>
                    <b>{untouched}</b> pas encore travaillée{untouched > 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <b>toutes</b> travaillées
                  </>
                )}
              </span>
            </div>
          </section>

          <section className="notes" aria-labelledby="h-notes">
            <H id="h-notes">{role === 'student' ? (coach ? `Mots de ${coach}` : 'Mots du coach') : 'Mes notes'}</H>
            {notes.length > 0 ? (
              notes.map((n, i) => {
                const ghost = n.ghostId ? getGhost(n.ghostId) : undefined
                return (
                  <Sticky
                    key={n.id}
                    hand={role === 'solo' ? 'mine' : 'coach'}
                    rotate={i === 0 ? 1.4 : -1.6}
                    delay={0.9 + i * 0.15}
                    meta={`${safeDate(SHORT, n.createdAt)}${ghost ? ` · ${ghost.name}` : ''}`}
                    sign={n.author ? `— ${n.author}` : undefined}
                  >
                    {n.title}
                  </Sticky>
                )
              })
            ) : role !== 'student' ? (
              <div className="notes-empty">
                <p className="pencil-note">
                  {fr(
                    isCoach
                      ? 'Aucune note pour l’instant : ton élève reçoit tes notes quand tu les partages.'
                      : 'Aucune note pour l’instant : une astuce, une erreur à ne plus refaire… Ajoutée à la révision, une note revient d’elle-même au bon moment.',
                  )}
                </p>
                <TypedLink to="/carnet">Écrire la première note</TypedLink>
              </div>
            ) : (
              <div className="notes-empty">
                <p className="pencil-note">
                  {fr(`Les notes de ${coach || 'ton coach'} arrivent par lien : ouvre-le, ou copie-le et colle-le dans la page « Coaching ».`)}
                </p>
                <TypedLink to="/coaching?coller=1">Coller un lien reçu</TypedLink>
              </div>
            )}
            {state.notes.length > 0 && (
              <div className="notes-foot">
                <TypedLink to="/carnet">Toutes mes notes ({state.notes.length})</TypedLink>
              </div>
            )}
          </section>
        </Page>
      </Notebook>

      {!stacked && shelf}
    </>
  )
}
