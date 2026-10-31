import { useMemo, useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { Modal, PageHead, Seg } from '../components/ui'
import { GHOSTS } from '../data'
import { learnedCount, streak } from '../engine/progress'
import { appUrl, copyText, downloadJson, encodePayload } from '../engine/share'
import { useMastery } from '../store/hooks'
import { hydrate } from '../store/schema'
import { useStore } from '../store/store'
import { useTheme } from '../theme'

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

  return (
    <div className="page narrow">
      <PageHead title={state.profile.name || 'Profil'}>
        Réglages et sauvegarde de ta progression. Tout est enregistré sur cet appareil uniquement.
      </PageHead>

      <section className="stack settings-block">
        <h2>Toi</h2>
        <div className="grid-2">
          <label className="field">
            <span>Prénom ou pseudo</span>
            <input className="input" value={state.profile.name} onChange={(e) => dispatch({ type: 'profile', profile: { name: e.target.value } })} />
          </label>
          <label className="field">
            <span>Coach</span>
            <input className="input" value={state.profile.coachName} onChange={(e) => dispatch({ type: 'profile', profile: { coachName: e.target.value } })} placeholder="Prénom du coach" />
          </label>
        </div>
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
      </section>

      <section className="stack settings-block">
        <h2>Affichage</h2>
        <div className="field">
          <span className="field-label">Thème</span>
          <Seg
            label="Thème"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Comme l’appareil' },
              { value: 'light', label: 'Clair' },
              { value: 'dark', label: 'Sombre' },
            ]}
          />
        </div>
      </section>

      <section className="stack settings-block">
        <h2>Révision</h2>
        <label className="field">
          <span>
            Nouvelles cartes par jour : <b className="mono">{state.settings.newPerDay}</b>
          </span>
          <input
            className="range"
            type="range"
            min={3}
            max={40}
            value={state.settings.newPerDay}
            onChange={(e) => dispatch({ type: 'settings', settings: { newPerDay: Number(e.target.value) } })}
          />
          <small>Entre 8 et 15, c’est un bon rythme : environ 10 minutes par jour.</small>
        </label>
        <label className="check">
          <input type="checkbox" checked={state.settings.includeMechanics} onChange={(e) => dispatch({ type: 'settings', settings: { includeMechanics: e.target.checked } })} />
          <span>Inclure les cartes « Mécaniques » (chasses, encens, équipement…)</span>
        </label>
        <div className="field">
          <span className="field-label">Entités à apprendre en priorité {focus.length ? `(${focus.length})` : '(toutes)'}</span>
          <div className="focus-grid">
            {GHOSTS.map((g) => {
              const on = focus.includes(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`focus-chip${on ? ' on' : ''}`}
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
          <small>Les nouvelles cartes ne viendront que de ces entités (les notes du coach et les mécaniques restent incluses). Rien de sélectionné = toutes.</small>
        </div>
      </section>

      <section className="stack settings-block">
        <h2>Partager et sauvegarder</h2>
        <div className="share-row">
          <div>
            <strong>Envoyer ma progression au coach</strong>
            <p className="muted">Un lien vers un bilan en lecture seule : maîtrise de chaque entité, série, dernières séances.</p>
          </div>
          <button type="button" className="btn" onClick={shareReport}>
            Créer le lien
          </button>
        </div>
        <hr className="rule" />
        <div className="share-row">
          <div>
            <strong>Sauvegarde complète</strong>
            <p className="muted">Un fichier avec toute la progression et le carnet, pour changer d’appareil ou garder une copie.</p>
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={exportAll}>
              Exporter
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Importer
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
        </div>
      </section>

      <section className="stack settings-block">
        <h2>Effacer</h2>
        <div className="share-row">
          <p className="muted">Effacer la progression (cartes, quiz, séances) en gardant le profil et le carnet.</p>
          <button type="button" className="btn btn-danger" onClick={() => setConfirm('progress')}>
            Réinitialiser
          </button>
        </div>
        <div className="share-row">
          <p className="muted">Tout effacer sur cet appareil, carnet compris.</p>
          <button type="button" className="btn btn-danger" onClick={() => setConfirm('all')}>
            Tout effacer
          </button>
        </div>
        <p className="faint small">
          Profil créé le {new Date(state.profile.createdAt).toLocaleDateString('fr-FR')} · {Object.keys(state.cards).length} cartes vues · {state.log.length} révisions · {Math.round((now - state.profile.createdAt) / 86_400_000)} jours
        </p>
      </section>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'import' ? 'Remplacer par cette sauvegarde ?' : confirm === 'all' ? 'Tout effacer ?' : 'Réinitialiser la progression ?'}
        actions={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirm(null)}>
              Annuler
            </button>
            <button
              type="button"
              className={confirm === 'import' ? 'btn btn-primary' : 'btn btn-danger'}
              onClick={() => {
                if (confirm === 'progress') dispatch({ type: 'reset-progress' })
                if (confirm === 'all') dispatch({ type: 'reset-all' })
                if (confirm === 'import' && pendingImport) dispatch({ type: 'replace', state: pendingImport })
                toast(confirm === 'import' ? 'Sauvegarde restaurée' : 'C’est fait')
                setConfirm(null)
              }}
            >
              Confirmer
            </button>
          </>
        }
      >
        <p className="muted">
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
            <button type="button" className="btn btn-quiet" onClick={() => setReportUrl(null)}>
              Fermer
            </button>
            <button type="button" className="btn btn-primary" onClick={async () => reportUrl && (await copyText(reportUrl)) && toast('Lien copié')}>
              Copier le lien
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginBottom: 12 }}>
          Le bilan est contenu dans le lien lui-même : aucun serveur ne le stocke.
        </p>
        <textarea className="textarea mono" readOnly value={reportUrl ?? ''} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: '0.75rem', minHeight: 90 }} />
      </Modal>
    </div>
  )
}
