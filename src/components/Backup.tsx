import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { fr } from '../engine/format'
import { downloadJson, isNotesFile } from '../engine/share'
import {
  backupFileName,
  backupSummary,
  contentText,
  decodeProgress,
  encodeProgress,
  replaceText,
  transferErrorText,
} from '../engine/transfer'
import { readBackup, type PersistedState } from '../store/schema'
import { useStore } from '../store/store'
import { PaperButton, TapeButton, TypedLink } from './journal/Journal'
import { useToast } from './Toast'
import { Modal } from './ui'

/**
 * Sauvegarder et reprendre tout le carnet : fichier de sauvegarde complète, ou copier-coller de la
 * progression (sur iPhone, l'app installée a sa propre mémoire, séparée du navigateur). Les mêmes gestes
 * servent à l'accueil, à la page « Installer l'app » et au profil : chaque crochet rend ses actions, et ce
 * qu'il faut afficher (champ, message, confirmation) là où la page le place.
 */

/* ==========================================================================
   Exporter la sauvegarde complète (fichier)
   ========================================================================== */

/** Télécharge la sauvegarde complète et dit quel fichier est parti, et où. `exported` : le nom du dernier fichier. */
export function useExportBackup(): { exportFile: () => void; exported: string | null } {
  const { state } = useStore()
  const toast = useToast()
  const [exported, setExported] = useState<string | null>(null)
  const exportFile = useCallback(() => {
    const name = backupFileName()
    downloadJson(name, state)
    setExported(name)
    toast(fr(`Sauvegarde complète exportée : ${name}, dans tes téléchargements`))
  }, [state, toast])
  return { exportFile, exported }
}

/** La trace qui reste à l'écran après un export (le message en bas de l'écran, lui, s'efface). */
export function ExportedLine({ name }: { name: string | null }) {
  if (!name) return null
  return <p className="pencil-note backup-done">{fr(`fichier exporté : ${name}, dans tes téléchargements`)}</p>
}

/* ==========================================================================
   Remplacer le carnet (fichier ou progression collée), après confirmation
   ========================================================================== */

interface Pending {
  state: PersistedState
  source: 'file' | 'code'
}

function ReplaceConfirm({ pending, onClose, onDone }: { pending: Pending | null; onClose: () => void; onDone?: () => void }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const text = useMemo(() => (pending ? replaceText(backupSummary(state), backupSummary(pending.state), pending.source) : ''), [pending, state])
  return (
    <Modal
      open={pending !== null}
      onClose={onClose}
      title={pending?.source === 'file' ? 'Remplacer par cette sauvegarde ?' : 'Remplacer par cette progression ?'}
      actions={
        <>
          <TypedLink onClick={onClose}>Annuler</TypedLink>
          <TapeButton
            arrow={false}
            onClick={() => {
              if (!pending) return
              dispatch({ type: 'replace', state: pending.state })
              toast(fr(`${pending.source === 'file' ? 'Sauvegarde restaurée' : 'Progression reprise'} : ${contentText(backupSummary(pending.state))}`))
              onClose()
              onDone?.()
            }}
          >
            Remplacer
          </TapeButton>
        </>
      }
    >
      <p className="modal-text">{text}</p>
    </Modal>
  )
}

/* ==========================================================================
   Importer un fichier de sauvegarde complète
   ========================================================================== */

type FileError = 'notes' | 'unknown'

/**
 * Choisir un fichier de sauvegarde complète. Un fichier de notes seules (« Mes notes ») ou un autre fichier
 * est refusé avec ce qu'il faut choisir et où le trouver. `panel` : le champ caché, le message, la confirmation.
 */
export function useBackupFile(onDone?: () => void): { choose: () => void; panel: ReactNode } {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<FileError | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const onFile = async (file: File) => {
    let raw: unknown = null
    try {
      raw = JSON.parse(await file.text())
    } catch {
      /* pas un fichier du carnet */
    }
    const state = readBackup(raw)
    if (state) {
      setError(null)
      setPending({ state, source: 'file' })
    } else setError(isNotesFile(raw) ? 'notes' : 'unknown')
  }

  const panel = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = '' // le même fichier pourra être choisi à nouveau
          if (f) void onFile(f)
        }}
      />
      {error && (
        <div className="pencil-note backup-error" role="alert">
          {error === 'notes' ? (
            <>
              <p>{fr('Ce fichier « phasmo-coach-notes-… » ne contient que des notes : il s’importe depuis « Mes notes ».')}</p>
              <TypedLink to="/carnet?sauvegarde=importer">Importer mes notes</TypedLink>
            </>
          ) : (
            <p>
              {fr(
                'Fichier non reconnu. Il faut un fichier « phasmo-coach-sauvegarde-… .json » : il se crée avec « Exporter », dans le profil du carnet où tu as commencé (le navigateur, par exemple).',
              )}
            </p>
          )}
        </div>
      )}
      <ReplaceConfirm pending={pending} onClose={() => setPending(null)} onDone={onDone} />
    </>
  )

  return {
    choose: () => {
      setError(null)
      fileRef.current?.click()
    },
    panel,
  }
}

/* ==========================================================================
   Copier sa progression (presse-papiers)
   ========================================================================== */

/**
 * Copie toute la progression dans le presse-papiers. Le code est préparé à l'avance : Safari n'accepte
 * d'écrire dans le presse-papiers que pendant le toucher, sans attente. Si l'écriture est refusée, le code
 * s'affiche sélectionné, à copier à la main. `next` : ce qu'il faut faire ensuite, affiché une fois copié.
 */
export function useCopyProgress(next: string): { copy: () => void; panel: ReactNode } {
  const { state } = useStore()
  const toast = useToast()
  // le code et l'état dont il vient : un réglage changé entre-temps le rend périmé
  const [ready, setReady] = useState<{ state: PersistedState; code: string } | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')

  // préparé un peu après le dernier changement (un curseur qu'on fait glisser ne recompresse pas tout à chaque pas)
  useEffect(() => {
    let live = true
    const t = window.setTimeout(() => {
      encodeProgress(state).then(
        (code) => live && setReady({ state, code }),
        () => live && setReady(null),
      )
    }, 250)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [state])

  const write = useCallback(
    (text: string) => {
      setShown(text)
      const p = typeof navigator !== 'undefined' && navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : null
      if (!p) return setStatus('manual')
      p.then(
        () => {
          setStatus('copied')
          toast('Progression copiée')
        },
        () => setStatus('manual'),
      )
    },
    [toast],
  )

  const copy = () => {
    if (ready && ready.state === state) return write(ready.code)
    // code pas encore prêt (tout premier instant, ou réglage changé à l'instant) : on le prépare, puis on essaie
    void encodeProgress(state).then(write, () => setStatus('manual'))
  }

  const panel = (
    <>
      <p className="pencil-note backup-next" role="status">
        {status === 'copied' ? fr(next) : ''}
      </p>
      {status === 'manual' && shown && (
        <div className="backup-manual">
          <label className="field">
            <span>Copie ce texte</span>
            <textarea
              className="textarea backup-code"
              readOnly
              autoFocus
              value={shown}
              onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
            />
          </label>
          <p className="pencil-note backup-hint">
            {fr('la copie automatique est bloquée ici : copie ce texte en entier à la main, puis colle-le dans l’app avec « Coller ma progression »')}
          </p>
        </div>
      )}
    </>
  )

  return { copy, panel }
}

/* ==========================================================================
   Coller sa progression (presse-papiers, ou champ à remplir)
   ========================================================================== */

/**
 * Reprend une progression copiée : lit le presse-papiers quand le navigateur le permet, sinon ouvre un
 * champ où la coller. Rien n'est remplacé avant la confirmation, qui dit ce qui arrive et ce qui part.
 */
export function usePasteProgress(onDone?: () => void): { paste: () => void; busy: boolean; panel: ReactNode } {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const focusArea = useRef(false)

  useEffect(() => {
    if (open && focusArea.current) {
      focusArea.current = false
      areaRef.current?.focus()
    }
  }, [open])

  const showField = (why: string | null) => {
    setError(why)
    if (!open) focusArea.current = true
    setOpen(true)
  }

  const read = async (value: string, from: 'clipboard' | 'field') => {
    const r = await decodeProgress(value)
    if (r.ok) {
      setError(null)
      setPending({ state: r.state, source: 'code' })
      return
    }
    showField(transferErrorText(r.error, from))
  }

  const paste = async () => {
    if (busy) return
    setBusy(true)
    let clip: string | null = null
    try {
      if (navigator.clipboard?.readText) clip = await navigator.clipboard.readText()
    } catch {
      clip = null // lecture refusée : on colle à la main
    }
    if (clip == null) showField(null)
    else await read(clip, 'clipboard')
    setBusy(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    await read(text, 'field')
    setBusy(false)
  }

  const errId = 'backup-paste-error'
  const panel = (
    <>
      {open && (
        <form className="backup-paste" onSubmit={submit} noValidate>
          <label className="field">
            <span>Colle ici ta progression copiée</span>
            <textarea
              ref={areaRef}
              className="textarea backup-code"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError(null)
              }}
              placeholder="PHASMO1:…"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!error}
              aria-describedby={error ? errId : undefined}
            />
          </label>
          {!error && (
            <p className="pencil-note backup-hint">
              <span className="on-touch">{fr('appui long dans le cadre, puis « Coller »')}</span>
              <span className="on-mouse">{fr('clique dans le cadre, puis colle (Ctrl + V, ou Cmd + V sur Mac)')}</span>
            </p>
          )}
          {error && (
            <p className="pencil-note backup-error" id={errId} role="alert">
              {error}
            </p>
          )}
          <div className="paste-btns">
            <PaperButton type="submit" disabled={!text.trim() || busy} rotate={-0.8}>
              Reprendre cette progression
            </PaperButton>
            <TypedLink
              onClick={() => {
                setOpen(false)
                setError(null)
                setText('')
              }}
            >
              Annuler
            </TypedLink>
          </div>
        </form>
      )}
      <ReplaceConfirm
        pending={pending}
        onClose={() => setPending(null)}
        onDone={() => {
          setOpen(false)
          setText('')
          onDone?.()
        }}
      />
    </>
  )

  return { paste: () => void paste(), busy, panel }
}
