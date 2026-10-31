import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { CheckLine, FileHead, H, Notebook, Page, PaperButton, Stamp, Tape, TapeButton, TypedLink } from '../components/journal/Journal'
import { useToast } from '../components/Toast'
import { Modal, Seg } from '../components/ui'
import { GHOSTS } from '../data'
import { learnedCount, streak } from '../engine/progress'
import { appUrl, copyText, downloadJson, encodePayload } from '../engine/share'
import { useMastery } from '../store/hooks'
import { hydrate } from '../store/schema'
import { useStore } from '../store/store'
import { useTheme } from '../theme'

type Style = CSSProperties & Record<`--${string}`, string | number>

export interface ReportPayload {
  kind: 'phasmo-coach/report'
  name: string
  at: number
  streak: number
  learned: number
  total: number
  mastery: Record<string, number>
  activity: { t: number; kind: string; score: number; total: number; label: string }[]
}

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const NEW_MIN = 3
const NEW_MAX = 40

export function Profile() {
  const { state, deck, dispatch } = useStore()
  const toast = useToast()
  const mastery = useMastery()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<'progress' | 'all' | 'import' | null>(null)
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof hydrate> | null>(null)
  const [reportUrl, setReportUrl] = useState<string | null>(null)
  const now = useMemo(() => Date.now(), [])
  const [theme, setTheme] = useTheme()

  const exportAll = () => downloadJson(`phasmo-coach-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, state)

  const onFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text())
      if (raw?.version !== 1 || typeof raw.cards !== 'object') throw new Error('format')
      setPendingImport(hydrate(raw))
      setConfirm('import')
    } catch {
      toast('Fichier de sauvegarde non reconnu')
    }
  }

  const shareReport = async () => {
    const payload: ReportPayload = {
      kind: 'phasmo-coach/report',
      name: state.profile.name,
      at: Date.now(),
      streak: streak(state, Date.now()),
      learned: learnedCount(deck, state.cards),
      total: deck.length,
      mastery: Object.fromEntries(Object.entries(mastery).map(([k, v]) => [k, Math.round(v * 100)])),
      activity: state.activity.slice(-12),
    }
    setReportUrl(appUrl(`/rapport?d=${await encodePayload(payload)}`))
  }

  const focus = state.settings.focus ?? []
  const perDay = state.settings.newPerDay
  const setPerDay = (v: number) => dispatch({ type: 'settings', settings: { newPerDay: Math.min(NEW_MAX, Math.max(NEW_MIN, v)) } })
  const initial = (state.profile.name.trim()[0] ?? '?').toUpperCase()
  const seen = deck.filter((c) => state.cards[c.id]).length
  const days = Math.round((now - state.profile.createdAt) / 86_400_000)

  return (
    <>
      <Notebook className="profil">
        {/* ===================== couverture intérieure ===================== */}
        <Page side="left" section="1" label="Couverture intérieure" className="cover">
          <FileHead>
            <span>Ce carnet appartient à</span>
            <span>
              Ouvert le <b>{DATE.format(state.profile.createdAt)}</b>
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
                  <input className="input" value={state.profile.name} onChange={(e) => dispatch({ type: 'profile', profile: { name: e.target.value } })} />
                </label>
                <label className="field">
                  <span>Coach</span>
                  <input
                    className="input"
                    value={state.profile.coachName}
                    onChange={(e) => dispatch({ type: 'profile', profile: { coachName: e.target.value } })}
                    placeholder="Prénom du coach"
                  />
                </label>
              </div>
            </div>
            <div className="idcard-role">
              <div className="field">
                <span className="field-label">Sur cet appareil</span>
                <Seg
                  label="Rôle"
                  value={state.profile.role}
                  onChange={(role) => dispatch({ type: 'profile', profile: { role } })}
                  options={[
                    { value: 'student', label: 'Je m’entraîne' },
                    { value: 'coach', label: 'Je suis le coach' },
                  ]}
                />
              </div>
              <Stamp tone="violet" rotate={-8} thunk delay={0.5}>
                {state.profile.role === 'coach' ? 'Coach' : 'En formation'}
              </Stamp>
            </div>
            <p className="idcard-stats">
              <span>
                <b>{seen}</b> carte{seen > 1 ? 's' : ''} vue{seen > 1 ? 's' : ''}
              </span>
              <span>
                <b>{state.log.length}</b> révision{state.log.length > 1 ? 's' : ''}
              </span>
              <span>
                <b>{days}</b> jour{days > 1 ? 's' : ''}
              </span>
            </p>
          </article>

          <section className="pocket settle" style={{ '--r': '.6deg', '--d': '.2s' } as Style} aria-labelledby="h-pocket">
            <h2 className="pocket-h" id="h-pocket">
              Partager et sauvegarder
            </h2>
            <div className="pocket-item">
              <h3>Envoyer ma progression au coach</h3>
              <p>Un lien vers un bilan en lecture seule : maîtrise de chaque entité, série, dernières séances.</p>
              <div className="pocket-btns">
                <PaperButton onClick={shareReport} rotate={-1.2}>
                  Créer le lien
                </PaperButton>
              </div>
            </div>
            <div className="pocket-item">
              <h3>Sauvegarde complète</h3>
              <p>Un fichier avec toute la progression et le carnet, pour changer d’appareil ou garder une copie.</p>
              <div className="pocket-btns">
                <PaperButton onClick={exportAll} rotate={0.8}>
                  Exporter
                </PaperButton>
                <PaperButton onClick={() => fileRef.current?.click()} rotate={-0.6}>
                  Importer
                </PaperButton>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </div>
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
            <p className="pencil-note settings-hint">le disjoncteur, en haut, bascule aussi jour et nuit</p>
          </section>

          <section aria-labelledby="h-rev">
            <H id="h-rev">Révision</H>
            <div className="field pace">
              <label className="field-label" htmlFor="pf-pace">
                Nouvelles cartes par jour
              </label>
              <div className="pace-row">
                <PaperButton onClick={() => setPerDay(perDay - 1)} disabled={perDay <= NEW_MIN} rotate={-1.5}>
                  <span aria-hidden>−</span>
                  <span className="sr-only">Une carte de moins</span>
                </PaperButton>
                <output className="pace-n" htmlFor="pf-pace" aria-live="polite">
                  {perDay}
                </output>
                <PaperButton onClick={() => setPerDay(perDay + 1)} disabled={perDay >= NEW_MAX} rotate={1.2}>
                  <span aria-hidden>+</span>
                  <span className="sr-only">Une carte de plus</span>
                </PaperButton>
                <span className="pace-unit">nouvelles cartes chaque jour</span>
              </div>
              <input
                id="pf-pace"
                className="range"
                type="range"
                min={NEW_MIN}
                max={NEW_MAX}
                value={perDay}
                onChange={(e) => dispatch({ type: 'settings', settings: { newPerDay: Number(e.target.value) } })}
              />
              <p className="pencil-note settings-hint">entre 8 et 15, c’est un bon rythme : environ 10 minutes par jour</p>
            </div>

            <CheckLine
              checked={state.settings.includeMechanics}
              onChange={(v) => dispatch({ type: 'settings', settings: { includeMechanics: v } })}
              seed="pf-mechanics"
              hint="Chasses, encens, équipement…"
            >
              Inclure les cartes « Mécaniques »
            </CheckLine>

            <div className="field focus-field">
              <span className="field-label" id="lbl-focus">
                Entités à apprendre en priorité {focus.length ? `(${focus.length})` : '(toutes)'}
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
                les nouvelles cartes ne viendront que des entités entourées (les notes du coach et les mécaniques restent incluses) ;
                aucune entourée = toutes
              </p>
            </div>
          </section>

          <section className="danger" aria-labelledby="h-danger">
            <h2 className="danger-h" id="h-danger">
              Effacer
            </h2>
            <div className="danger-row">
              <p>Effacer la progression (cartes, quiz, séances) en gardant le profil et le carnet.</p>
              <button type="button" className="stamp-btn" style={{ '--r': '-3deg' } as Style} onClick={() => setConfirm('progress')}>
                Réinitialiser
              </button>
            </div>
            <div className="danger-row">
              <p>Tout effacer sur cet appareil, carnet compris.</p>
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
        title={confirm === 'import' ? 'Remplacer par cette sauvegarde ?' : confirm === 'all' ? 'Tout effacer ?' : 'Réinitialiser la progression ?'}
        actions={
          <>
            <TypedLink onClick={() => setConfirm(null)}>Annuler</TypedLink>
            <TapeButton
              arrow={false}
              onClick={() => {
                if (confirm === 'progress') dispatch({ type: 'reset-progress' })
                if (confirm === 'all') dispatch({ type: 'reset-all' })
                if (confirm === 'import' && pendingImport) dispatch({ type: 'replace', state: pendingImport })
                toast(confirm === 'import' ? 'Sauvegarde restaurée' : 'C’est fait')
                setConfirm(null)
              }}
            >
              Confirmer
            </TapeButton>
          </>
        }
      >
        <p className="modal-text">
          {confirm === 'import'
            ? `La progression actuelle sera remplacée par celle du fichier (${Object.keys(pendingImport?.cards ?? {}).length} cartes, ${pendingImport?.notes.length ?? 0} notes). Pense à exporter avant si besoin.`
            : 'Cette action est définitive. Exporte une sauvegarde avant si tu veux pouvoir revenir en arrière.'}
        </p>
      </Modal>

      <Modal
        open={!!reportUrl}
        onClose={() => setReportUrl(null)}
        title="Lien de progression"
        actions={
          <>
            <TypedLink onClick={() => setReportUrl(null)}>Fermer</TypedLink>
            <TapeButton arrow={false} onClick={async () => reportUrl && (await copyText(reportUrl)) && toast('Lien copié')}>
              Copier le lien
            </TapeButton>
          </>
        }
      >
        <p className="modal-text">Le bilan est contenu dans le lien lui-même : aucun serveur ne le stocke.</p>
        <textarea className="textarea share-url" readOnly value={reportUrl ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="Lien de progression" />
      </Modal>
    </>
  )
}
