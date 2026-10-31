import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckLine,
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
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { UvPrint } from '../components/journal/Charts'
import { Seg } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { buildReviewQueue, streak } from '../engine/progress'
import { dayKey } from '../engine/format'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'
import { WEAK_COUNT } from './Quiz'

type Style = CSSProperties & Record<`--${string}`, string | number>

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Welcome() {
  const { dispatch } = useStore()
  const [name, setName] = useState('')
  const [coachName, setCoachName] = useState('')
  const [role, setRole] = useState<'student' | 'coach'>('student')
  const [ok, setOk] = useState(true)
  return (
    <Notebook single>
      <Page section="1" label="Nouveau carnet">
        <FileHead>
          <span>Nouveau carnet</span>
          <span>
            Entrée n° <b>1</b>
          </span>
        </FileHead>
        <div className="entry">
          <h1 className="entry-date">
            <em>Un carnet pour</em>apprendre les entités
          </h1>
          <Stamp thunk rotate={-6}>
            Confidentiel
          </Stamp>
          <p className="entry-line">
            Le codex des {GHOSTS.length} entités, des quiz, des enquêtes simulées, et une révision qui retient ce que tu sais déjà
            pour ne te reposer que ce qui commence à s’effacer. Tout reste sur cet appareil.
          </p>
        </div>
        <form
          className="stack welcome-form"
          style={{ '--gap': '26px' } as Style}
          onSubmit={(e) => {
            e.preventDefault()
            dispatch({ type: 'onboard', profile: { name: name.trim(), coachName: coachName.trim(), role } })
          }}
        >
          <div className="field">
            <span className="field-label">Qui tient ce carnet ?</span>
            <Seg
              label="Rôle"
              value={role}
              onChange={setRole}
              options={[
                { value: 'student', label: 'Je m’entraîne' },
                { value: 'coach', label: 'Je suis le coach' },
              ]}
            />
          </div>
          <label className="field">
            <span>Ton prénom</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom ou pseudo" autoFocus />
          </label>
          {role === 'student' && (
            <label className="field">
              <span>Ton coach (facultatif)</span>
              <input className="input" value={coachName} onChange={(e) => setCoachName(e.target.value)} placeholder="Prénom ou pseudo du coach" />
            </label>
          )}
          <CheckLine checked={ok} onChange={setOk} seed="welcome-ok" hint="Aucun compte, aucun serveur : tu peux exporter ta progression depuis le profil.">
            J’ai compris que tout est enregistré sur cet appareil.
          </CheckLine>
          <div>
            <TapeButton type="submit" disabled={!ok}>
              Ouvrir le carnet
            </TapeButton>
          </div>
        </form>
      </Page>
    </Notebook>
  )
}

export function Home() {
  const { state, deck } = useStore()
  const mastery = useMastery()
  const now = useMemo(() => Date.now(), [])
  const queue = useMemo(() => buildReviewQueue(state, deck, now), [state, deck, now])

  const days = streak(state, now)
  const activeDays = useMemo(() => {
    const set = new Set<string>()
    state.log.forEach((l) => set.add(dayKey(l.t)))
    state.activity.forEach((a) => set.add(dayKey(a.t)))
    return set.size
  }, [state.log, state.activity])
  const weak = useMemo(() => [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0)).slice(0, 3), [mastery])
  const dueCount = queue.filter((c) => state.cards[c.id]).length
  const newCount = queue.length - dueCount
  const minutes = Math.max(1, Math.round(queue.length * 0.4))
  const onMenu = [...new Set(queue.map((c) => c.ghostId).filter((id): id is string => !!id))].map((id) => getGhost(id)!.name)
  const acquired = GHOSTS.filter((g) => (mastery[g.id] ?? 0) >= 0.85).length
  const untouched = GHOSTS.filter((g) => (mastery[g.id] ?? 0) === 0).length
  const notes = state.notes.slice(0, 2)
  const lastOf = (kind: string) => [...state.activity].reverse().find((a) => a.kind === kind)
  const lastQuiz = lastOf('quiz')
  const lastScenario = lastOf('scenario')
  const lastEar = lastOf('ear')
  const coach = state.profile.role === 'coach' ? state.profile.name : state.profile.coachName

  if (!state.onboarded) return <Welcome />

  return (
    <>
      <Notebook>
        {/* ===================== page de gauche : aujourd'hui ===================== */}
        <Page side="left" section="1" label="Aujourd’hui">
          <FileHead>
            <span>
              Carnet de <b>{state.profile.name || '—'}</b>
            </span>
            {coach && (
              <span>
                Coach : <b>{coach}</b>
              </span>
            )}
            <span>
              Entrée n° <b>{activeDays + 1}</b>
            </span>
          </FileHead>

          <div className="entry">
            <h1 className="entry-date">
              <em>{cap(WEEKDAY.format(now))}</em>
              {DAY_MONTH.format(now)}
            </h1>
            <Stamp thunk rotate={-7} delay={0.35}>
              Entrée n° {activeDays + 1}
            </Stamp>
            <p className="entry-line">
              {days > 1
                ? `${days} jours d’affilée sans sauter une séance.`
                : days === 1
                  ? 'Une séance aujourd’hui : la série commence.'
                  : 'Pas encore de séance aujourd’hui. Quelques minutes suffisent pour lancer la série.'}
            </p>
            {days > 0 && (
              <MarginNote className="tally-note" style={{ left: -104, top: 6, width: 80, '--r': '-4deg' }}>
                <Tally n={days} />
                <span>
                  {days} jour{days > 1 ? 's' : ''}
                </span>
              </MarginNote>
            )}
          </div>

          <IndexCard className="plan settle" head="Révision du jour" right={SHORT.format(now)} clip rotate={-0.6}>
            {queue.length > 0 ? (
              <>
                <div className="plan-n">
                  <b>{queue.length}</b>
                  <span>carte{queue.length > 1 ? 's' : ''}</span>
                  <small>environ {minutes} min</small>
                </div>
                <p>
                  <strong>
                    {dueCount > 0 && `${dueCount} à revoir`}
                    {dueCount > 0 && newCount > 0 && ', '}
                    {newCount > 0 && `${newCount} nouvelle${newCount > 1 ? 's' : ''}`}.
                  </strong>{' '}
                  {onMenu.length > 0 &&
                    `Au menu : ${onMenu.slice(0, 4).join(', ')}${onMenu.length > 4 ? `… et ${onMenu.length - 4} autre${onMenu.length - 4 > 1 ? 's' : ''}` : ''}.`}
                </p>
                <div className="plan-actions">
                  <TapeButton to="/revision">Ouvrir la séance</TapeButton>
                  <TypedLink to="/quiz">ou un quiz éclair</TypedLink>
                </div>
              </>
            ) : (
              <>
                <div className="plan-n">
                  <b>0</b>
                  <span>carte à revoir</span>
                </div>
                <p>Tout est révisé pour aujourd’hui. Les cartes reviendront d’elles-mêmes au bon moment.</p>
                <div className="plan-actions">
                  <TapeButton to="/enquete">Lancer une enquête</TapeButton>
                  <TypedLink to="/revision">apprendre de nouvelles cartes</TypedLink>
                </div>
              </>
            )}
          </IndexCard>

          <section className="suspects" aria-labelledby="h-suspects">
            <H id="h-suspects" count={`tes ${weak.length} points faibles`}>
              Les suspects
            </H>
            <div className="polaroids">
              {weak.map((g, i) => (
                <div className="suspect" key={g.id}>
                  <Polaroid
                    ghostId={g.id}
                    to={`/codex/${g.id}`}
                    caption={g.name}
                    small={`${Math.round((mastery[g.id] ?? 0) * 100)} %`}
                    rotate={[-4, 3, -2][i]}
                    delay={0.45 + i * 0.13}
                  />
                  {g.keyTells[0] && <p className="hint pencil-note">{g.keyTells[0]}</p>}
                </div>
              ))}
            </div>
            <div className="after">
              <TypedLink to="/quiz?pool=weak">Quiz sur mes {WEAK_COUNT} points faibles</TypedLink>
              <TypedLink to="/codex">Ouvrir le codex</TypedLink>
            </div>
          </section>
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
            <H id="h-reg" count={`${acquired} acquise${acquired > 1 ? 's' : ''} sur ${GHOSTS.length}`}>
              Les {GHOSTS.length} entités
            </H>
            <p className="registry-legend">Ta maîtrise est surlignée ; les entités acquises sont entourées.</p>
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
                <b>{acquired}</b> acquise{acquired > 1 ? 's' : ''}
              </span>
              <span>
                <b>{GHOSTS.length - acquired - untouched}</b> en cours
              </span>
              <span>
                <b>{untouched}</b> pas encore ouverte{untouched > 1 ? 's' : ''}
              </span>
            </div>
          </section>

          <section className="notes" aria-labelledby="h-notes">
            <H id="h-notes">{coach ? `Mots de ${coach}` : 'Mots du coach'}</H>
            {notes.length > 0 ? (
              notes.map((n, i) => (
                <Sticky
                  key={n.id}
                  rotate={i === 0 ? 1.4 : -1.6}
                  delay={0.9 + i * 0.15}
                  meta={`${SHORT.format(n.createdAt)}${n.ghostId ? ` · ${getGhost(n.ghostId)?.name ?? ''}` : ''}`}
                  sign={n.author ? `— ${n.author}` : undefined}
                >
                  {n.title}
                </Sticky>
              ))
            ) : (
              <p className="notes-empty">
                Le carnet du coach est encore vide. Chaque explication notée dans le <Link to="/carnet">carnet</Link> devient une carte de
                révision : plus besoin de la répéter.
              </p>
            )}
            <div className="notes-foot">
              <TypedLink to="/carnet">
                Tout le carnet ({state.notes.length} note{state.notes.length > 1 ? 's' : ''})
              </TypedLink>
            </div>
          </section>
        </Page>
      </Notebook>

      {/* ===================== sur le bureau : les exercices ===================== */}
      <section className="desk-shelf" aria-labelledby="h-shelf">
        <h2 className="shelf-label" id="h-shelf">
          Pièces à conviction
        </h2>
        <div className="envelopes">
          <Envelope
            to="/quiz"
            piece="Pièce n° 1"
            title="Quiz"
            text="Preuves, seuils, vitesses, comportements et tests sans preuve."
            hand={lastQuiz ? `dernier : ${lastQuiz.score}/${lastQuiz.total}` : 'jamais ouvert'}
            rotate={-1.5}
            delay={0.2}
          />
          <Envelope
            to="/enquete"
            piece="Pièce n° 2"
            title="Mise en situation"
            text="Un contrat raconté minute par minute. À toi de trancher."
            hand={lastScenario ? `dernière : ${lastScenario.score} pts` : 'jamais ouverte'}
            rotate={1.2}
            labelRotate={-0.8}
            delay={0.3}
          />
          <Envelope
            to="/oreille"
            piece="Pièce n° 3"
            title="À l’oreille"
            text="Reconnaître la vitesse d’une entité au rythme de ses pas."
            hand={lastEar ? `dernière : ${lastEar.score}/${lastEar.total}` : 'au casque, c’est mieux'}
            rotate={-0.8}
            delay={0.4}
          >
            <svg viewBox="0 0 170 22" className="steps-doodle" aria-hidden>
              <g fill="currentColor">
                {[8, 30, 52, 74, 91, 106, 119, 131, 142, 152, 162].map((x, i) => (
                  <ellipse key={x} cx={x} cy={i % 2 ? 7 : 15} rx="4.5" ry="2.6" />
                ))}
              </g>
            </svg>
          </Envelope>
          <Envelope
            to="/codex"
            piece="Pièce n° 4"
            title="Codex"
            text={`Les ${GHOSTS.length} fiches : preuves, vitesses, seuils et tests sans preuve.`}
            hand="tout est dedans"
            rotate={1.8}
            labelRotate={0.4}
            delay={0.5}
          />
        </div>
      </section>
    </>
  )
}
