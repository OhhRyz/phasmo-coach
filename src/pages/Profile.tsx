import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExportedLine, useBackupFile, useCopyProgress, useExportBackup, usePasteProgress } from '../components/Backup'
import { notebookStats, NotebookStats } from '../components/Registry'
import { CheckLine, FileHead, H, Notebook, Page, PaperButton, Stamp, Tape, TapeButton, TypedLink } from '../components/journal/Journal'
import { useToast } from '../components/Toast'
import { Modal, Seg } from '../components/ui'
import { GHOSTS } from '../data'
import { fr, NNBSP, safeDate } from '../engine/format'
import { isStandalone, platform } from '../engine/device'
import { coachNameOf } from '../engine/notes'
import { useStore } from '../store/store'
import { useTheme } from '../theme'
import { sessionMinutes } from './reviewPlan'

export type { ReportPayload } from '../engine/share'

type Style = CSSProperties & Record<`--${string}`, string | number>

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const NEW_MIN = 3
const NEW_MAX = 40

/** Prénom : enregistré quand on quitte le champ (ou Entrée), jamais vide ; il signe les notes. */
function NameInput({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const name = draft.trim().slice(0, 40)
    if (!name) setDraft(value)
    else if (name !== value) onCommit(name)
  }
  return (
    <input
      className="input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      required
      maxLength={40}
    />
  )
}

export function Profile() {
  const { state, deck, dispatch } = useStore()
  const toast = useToast()
  const [confirm, setConfirm] = useState<'progress' | 'all' | null>(null)
  const now = useMemo(() => Date.now(), [])
  const [theme, setTheme] = useTheme()
  const role = state.profile.role
  const coach = coachNameOf(state.profile)
  const coaching = role === 'coach' ? 'Je coache quelqu’un' : role === 'student' ? (coach ? `Coaché·e par ${coach}` : 'Coaché·e') : 'Seul·e'

  const { exportFile, exported } = useExportBackup()
  const backupFile = useBackupFile()
  const standalone = useMemo(isStandalone, [])
  // sur iPhone et iPad seulement, l'app installée a sa propre mémoire, à part du navigateur ; ailleurs, elle
  // partage celle du navigateur : il n'y a rien à faire passer de l'un à l'autre
  const ios = useMemo(() => platform() === 'ios', [])
  const copyProgress = useCopyProgress(
    !ios
      ? 'C’est copié : dans l’autre carnet, touche « Coller ma progression », dans son profil.'
      : standalone
        ? 'C’est copié : dans l’autre carnet (le navigateur, par exemple), touche « Coller ma progression », dans son profil.'
        : 'C’est copié. Ouvre maintenant l’app installée et touche « Coller ma progression » : sur sa première page, ou dans son profil.',
  )
  const pasteProgress = usePasteProgress()

  // lien d'une autre page (?sauvegarde=1 : exporter, ?sauvegarde=importer) : on arrive sur le bouton, surligné
  const [params, setParams] = useSearchParams()
  const [asked, setAsked] = useState<'export' | 'import' | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const v = params.get('sauvegarde')
    if (v !== '1' && v !== 'importer') return
    setAsked(v === 'importer' ? 'import' : 'export')
    setParams({}, { replace: true })
  }, [params]) // seul le paramètre du lien déclenche l'arrivée
  useEffect(() => {
    if (!asked) return
    const raf = requestAnimationFrame(() => {
      const item = exportRef.current
      if (!item) return
      item.scrollIntoView({ block: 'center' })
      item.querySelector<HTMLElement>('.backup-export')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [asked])

  const focus = state.settings.focus ?? []
  const perDay = state.settings.newPerDay
  const setPerDay = (v: number) => dispatch({ type: 'settings', settings: { newPerDay: Math.min(NEW_MAX, Math.max(NEW_MIN, v)) } })
  const initial = (state.profile.name.trim()[0] ?? '?').toUpperCase()
  const stats = notebookStats(state, deck, now)

  return (
    <>
      <Notebook className="profil">
        {/* ===================== couverture intérieure ===================== */}
        <Page side="left" section="1" label="Couverture intérieure" className="cover">
          <FileHead>
            <span>Ce carnet appartient à</span>
            <span>
              Ouvert le <b>{safeDate(DATE, state.profile.createdAt)}</b>
            </span>
          </FileHead>

          <h1 className="sr-only">Profil et réglages</h1>
          <article className="idcard settle" style={{ '--r': '-1.2deg', '--d': '.05s' } as Style} aria-label="Carte d’enquête">
            <Tape />
            <header className="idcard-head">
              <span>Carte d’enquête</span>
              <span>Phasmo Coach</span>
            </header>
            <div className="idcard-body">
              <span className="idcard-photo" aria-hidden>
                {initial}
              </span>
              <div className="idcard-fields">
                <label className="field">
                  <span>Prénom ou pseudo</span>
                  <NameInput value={state.profile.name} onCommit={(name) => dispatch({ type: 'profile', profile: { name } })} />
                </label>
                <div className="field idcard-coaching">
                  <span className="field-label">Coaching</span>
                  <span className="idcard-coaching-v">{fr(coaching)}</span>
                  <TypedLink to="/coaching">{role === 'solo' ? 'Être coaché·e ou coacher quelqu’un' : 'Ouvrir la page Coaching'}</TypedLink>
                </div>
              </div>
            </div>
            <div className="idcard-role">
              <Stamp tone="violet" rotate={-8} thunk delay={0.5}>
                {role === 'coach' ? 'Coach' : 'En formation'}
              </Stamp>
            </div>
            <NotebookStats {...stats} />
            <p className="idcard-progress">
              <TypedLink to="/progression">Voir ma progression</TypedLink>
            </p>
          </article>

          <section className="pocket settle" style={{ '--r': '.6deg', '--d': '.2s' } as Style} aria-labelledby="h-pocket">
            <h2 className="pocket-h" id="h-pocket">
              Changer d’appareil
            </h2>
            <div className="pocket-item">
              <h3>Copier-coller</h3>
              <p>
                {fr(
                  ios
                    ? 'Sur iPhone et iPad, l’app installée a sa propre mémoire : copie ta progression dans le navigateur, colle-la dans l’app (ou l’inverse).'
                    : 'Pour passer ta progression d’un carnet à l’autre sans fichier : copie-la d’un côté, colle-la de l’autre.',
                )}
              </p>
              <div className="pocket-btns">
                <PaperButton onClick={copyProgress.copy} rotate={-0.6}>
                  Copier ma progression
                </PaperButton>
                <PaperButton onClick={pasteProgress.paste} disabled={pasteProgress.busy} rotate={0.7}>
                  Coller ma progression
                </PaperButton>
              </div>
              {copyProgress.panel}
              {pasteProgress.panel}
            </div>
            <div className={`pocket-item${asked ? ' is-asked' : ''}`} id="sauvegarde" ref={exportRef}>
              <h3>
                <span className="pocket-hl">Sauvegarde complète</span>
              </h3>
              <p>
                {fr('Un fichier avec tout le carnet (progression, séances et notes), pour changer d’appareil ou garder une copie. Pour tes notes seules, il y a l’export de')}{' '}
                <TypedLink to="/carnet?sauvegarde=1">{fr('« Mes notes »')}</TypedLink>.
              </p>
              <div className="pocket-btns">
                <PaperButton onClick={exportFile} rotate={0.8} className={asked === 'import' ? undefined : 'backup-export'}>
                  Exporter
                </PaperButton>
                <PaperButton onClick={backupFile.choose} rotate={-0.6} className={asked === 'import' ? 'backup-export' : undefined}>
                  Importer
                </PaperButton>
              </div>
              <ExportedLine name={exported} />
              {backupFile.panel}
            </div>
          </section>

          <p className="exlibris">
            <span>En cas de perte, merci de rapporter ce carnet à</span>
            <b>{state.profile.name || ' '}</b>
          </p>
        </Page>

        {/* ===================== première page : les réglages ===================== */}
        <Page side="right" section="1" label="Réglages">
          <FileHead>
            <span>Réglages</span>
            <span>Enregistrés sur cet appareil</span>
          </FileHead>

          <section aria-labelledby="h-aff">
            <H id="h-aff">Affichage</H>
            <div className="field">
              <span className="field-label">Lumière du bureau</span>
              <Seg
                label="Thème"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'system', label: 'Comme l’appareil' },
                  { value: 'light', label: 'Jour' },
                  { value: 'dark', label: 'Nuit' },
                ]}
              />
            </div>
            <p className="pencil-note settings-hint">{fr('l’interrupteur « Lumière », en haut de la page, bascule aussi entre jour et nuit')}</p>
          </section>

          <section aria-labelledby="h-rev">
            <H id="h-rev">Révision</H>
            <div className="field pace">
              <label className="field-label" htmlFor="pf-pace">
                Nouvelles questions par jour
              </label>
              <div className="pace-row">
                <PaperButton onClick={() => setPerDay(perDay - 1)} disabled={perDay <= NEW_MIN} rotate={-1.5}>
                  <span aria-hidden>−</span>
                  <span className="sr-only">Une question de moins</span>
                </PaperButton>
                <output className="pace-n" htmlFor="pf-pace" aria-live="polite">
                  {perDay}
                </output>
                <PaperButton onClick={() => setPerDay(perDay + 1)} disabled={perDay >= NEW_MAX} rotate={1.2}>
                  <span aria-hidden>+</span>
                  <span className="sr-only">Une question de plus</span>
                </PaperButton>
                <span className="pace-unit">par jour</span>
              </div>
              {(perDay <= NEW_MIN || perDay >= NEW_MAX) && (
                <p className="pencil-note settings-hint pace-limit" role="note">
                  {perDay <= NEW_MIN
                    ? `${NEW_MIN} au minimum${NNBSP}: le bouton − ne descend pas plus bas`
                    : `${NEW_MAX} au maximum${NNBSP}: le bouton + ne monte pas plus haut`}
                </p>
              )}
              <input
                id="pf-pace"
                className="range"
                type="range"
                min={NEW_MIN}
                max={NEW_MAX}
                value={perDay}
                onChange={(e) => dispatch({ type: 'settings', settings: { newPerDay: Number(e.target.value) } })}
              />
              <p className="pencil-note settings-hint">{fr(`entre 8 et 15, c’est un bon rythme : à ${perDay}, environ ${sessionMinutes(perDay, 0)} min par jour au début, puis 15 à 25 min, révisions comprises`)}</p>
            </div>

            <CheckLine
              checked={state.settings.includeMechanics}
              onChange={(v) => dispatch({ type: 'settings', settings: { includeMechanics: v } })}
              seed="pf-mechanics"
              hint="Chasses, encens, équipement…"
            >
              {fr('Inclure les questions « Mécaniques »')}
            </CheckLine>

            {/* côté coach : ses notes sont écrites pour l'élève, elles n'encombrent pas sa propre révision (sauf choix) */}
            {role === 'coach' && (
              <CheckLine
                checked={!!state.settings.reviewOwnNotes}
                onChange={(v) => dispatch({ type: 'settings', settings: { reviewOwnNotes: v } })}
                seed="pf-own-notes"
                hint={fr('Décoché : elles partent chez ton élève en cartes avec le partage, sans revenir dans ta révision.')}
              >
                Me reposer aussi mes propres notes
              </CheckLine>
            )}

            <div className="field focus-field">
              <span className="field-label" id="lbl-focus">
                {fr(`Limiter les nouvelles questions à ces entités ${focus.length ? `(${focus.length})` : '(aucune : toutes)'}`)}
              </span>
              <div className="focus-names" role="group" aria-labelledby="lbl-focus">
                {GHOSTS.map((g) => {
                  const on = focus.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className="opt"
                      aria-pressed={on}
                      onClick={() => {
                        const next = on ? focus.filter((f) => f !== g.id) : [...focus, g.id]
                        dispatch({ type: 'settings', settings: { focus: next.length ? next : null } })
                      }}
                    >
                      {g.name}
                    </button>
                  )
                })}
              </div>
              <p className="pencil-note settings-hint">
                {fr('touche un nom pour l’entourer : les nouvelles questions ne viendront que des entités entourées (tes notes et les mécaniques restent incluses) ; aucune entourée = toutes')}
              </p>
            </div>
          </section>

          <section className="danger" aria-labelledby="h-danger">
            <h2 className="danger-h" id="h-danger">
              Effacer
            </h2>
            <div className="danger-row">
              <p>Effacer la progression (questions, quiz, séances) en gardant le profil et tes notes.</p>
              <button type="button" className="stamp-btn" style={{ '--r': '-3deg' } as Style} onClick={() => setConfirm('progress')}>
                Réinitialiser
              </button>
            </div>
            <div className="danger-row">
              <p>Tout effacer sur cet appareil, notes comprises.</p>
              <button type="button" className="stamp-btn" style={{ '--r': '2deg' } as Style} onClick={() => setConfirm('all')}>
                Tout effacer
              </button>
            </div>
          </section>
        </Page>
      </Notebook>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={fr(confirm === 'all' ? 'Tout effacer ?' : 'Réinitialiser la progression ?')}
        actions={
          <>
            <TypedLink onClick={() => setConfirm(null)}>Annuler</TypedLink>
            <TapeButton
              arrow={false}
              onClick={() => {
                if (confirm === 'progress') dispatch({ type: 'reset-progress' })
                if (confirm === 'all') dispatch({ type: 'reset-all' })
                toast('C’est fait')
                setConfirm(null)
              }}
            >
              Confirmer
            </TapeButton>
          </>
        }
      >
        <p className="modal-text">
          Cette action est définitive. Exporte une sauvegarde avant si tu veux pouvoir revenir en arrière.
        </p>
      </Modal>

    </>
  )
}
