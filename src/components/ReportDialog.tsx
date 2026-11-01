import { useMemo, useState } from 'react'
import { fr } from '../engine/format'
import { reportIssueUrl, reportText, WHOLE_FICHE } from '../engine/report'
import { copyText } from '../engine/share'
import { TapeButton, TypedLink } from './journal/Journal'
import { useToast } from './Toast'
import { Modal } from './ui'

/**
 * « Signaler une erreur sur cette fiche » : une fenêtre de l'app, en français, sans compte. Le signalement se
 * copie en texte, prêt à coller sur Discord à la personne qui s'occupe de l'app ; GitHub (en anglais, avec un
 * compte) reste possible, en lien secondaire, avec la demande déjà remplie.
 * Ce qui est écrit reste là si on ferme la fenêtre puis la rouvre sur la même fiche.
 */
export function ReportDialog({ open, onClose, fiche, parts }: { open: boolean; onClose: () => void; fiche: string; parts: readonly string[] }) {
  const toast = useToast()
  const [part, setPart] = useState(WHOLE_FICHE)
  const [what, setWhat] = useState('')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const url = typeof window === 'undefined' ? '' : window.location.href
  const report = useMemo(() => ({ fiche, part, what, source, url }), [fiche, part, what, source, url])
  const text = reportText(report)
  const empty = !what.trim()

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v)
    setStatus('idle')
  }

  const copy = async () => {
    if (empty) return
    const ok = await copyText(text)
    setStatus(ok ? 'copied' : 'manual')
    if (ok) toast('Signalement copié')
  }

  return (
    <Modal open={open} onClose={onClose} title="Signaler une erreur">
      <div className="report">
        <p className="modal-text report-intro">
          {fr('Dis ce qui te semble faux ou pas clair. Le signalement se copie en texte, prêt à coller sur Discord en message à la personne qui s’occupe de l’app.')}
        </p>
        <p className="report-fiche">
          <span className="typed-label">Fiche</span> <b>{fiche}</b>
        </p>
        <label className="field">
          <span>Partie de la fiche</span>
          <select className="select" value={part} onChange={(e) => edit(setPart)(e.target.value)}>
            {[WHOLE_FICHE, ...parts].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{fr('Qu’est-ce qui est faux ou pas clair ?')}</span>
          <textarea
            className="textarea"
            value={what}
            onChange={(e) => edit(setWhat)(e.target.value)}
            placeholder="ex. La vitesse indiquée ne correspond pas à ce que j’ai vu en partie…"
            maxLength={2000}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Ta source (vidéo, patch, test en partie)</span>
          <input className="input" value={source} onChange={(e) => edit(setSource)(e.target.value)} placeholder="un lien ou quelques mots" maxLength={300} />
          <small>Facultatif.</small>
        </label>

        <div className="modal-actions report-actions">
          <TypedLink onClick={onClose}>Fermer</TypedLink>
          <TapeButton arrow={false} disabled={empty} disabledHint="écris d’abord ce qui est faux ou pas clair" onClick={() => void copy()}>
            Copier le signalement
          </TapeButton>
        </div>
        <p className="pencil-note report-done" role="status">
          {status === 'copied' ? fr('copié : colle-le sur Discord, en message à la personne qui s’occupe de l’app') : ''}
        </p>
        {status === 'manual' && (
          <label className="field report-manual">
            <span>Copie ce texte</span>
            <textarea
              className="textarea report-code"
              readOnly
              autoFocus
              value={text}
              onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
            />
            <small>{fr('La copie automatique est bloquée ici : sélectionne ce texte et copie-le à la main.')}</small>
          </label>
        )}
        <p className="report-alt">
          <a className="link" href={reportIssueUrl(report)} target="_blank" rel="noreferrer">
            {fr('Ou l’envoyer sur GitHub (site en anglais, compte nécessaire)')}
            <span className="sr-only">, dans un nouvel onglet</span>
          </a>
        </p>
      </div>
    </Modal>
  )
}
