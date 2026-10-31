import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { platform } from '../engine/device'
import { fr } from '../engine/format'
import { decodePayload, importCounts, importSummary, parseShareInput, readNotesPayload, readReportPayload } from '../engine/share'
import { useStore } from '../store/store'
import { SHOW_NOTES } from '../pages/Notebook'
import { PaperButton, TypedLink } from './journal/Journal'
import { useToast } from './Toast'

/**
 * Coller un lien reçu en simple texte (ou ouvert dans Safari alors que le carnet est installé) : un lien
 * de notes les range dans le carnet, un lien de bilan ouvre le bulletin. Qui s'entraînait seul·e et
 * colle des notes signées d'un autre prénom devient coaché·e par cette personne (voir `adoptCoach`).
 *
 * `folded` : replié derrière un lien tapé tant qu'on ne l'ouvre pas. `request` : à chaque nouvelle
 * valeur (lien interne ?coller=1), le champ s'ouvre et prend le curseur.
 */
export function PasteLink({
  id,
  title,
  hint,
  folded = false,
  request = 0,
}: {
  id: string
  title: string
  hint: string
  folded?: boolean
  request?: number
}) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(!folded || request > 0)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const reopenRef = useRef<HTMLParagraphElement>(null)
  const focusInput = useRef(request > 0)
  const focusReopen = useRef(false)

  // demandé par un lien interne : on ouvre et on place le curseur dans le champ
  useEffect(() => {
    if (request <= 0) return
    focusInput.current = true
    setOpen(true)
    inputRef.current?.focus()
  }, [request])

  // plus repliable (la personne vient de passer en « coaché·e ») : le champ reste ouvert
  useEffect(() => {
    if (!folded) setOpen(true)
  }, [folded])

  // ouvert : le curseur dans le champ si on l'a demandé ; replié : le focus revient sur le lien tapé
  useEffect(() => {
    if (open && focusInput.current) {
      focusInput.current = false
      inputRef.current?.focus()
    }
    if (!open && focusReopen.current) {
      focusReopen.current = false
      reopenRef.current?.querySelector('button')?.focus()
    }
  }, [open])

  const fold = () => {
    setError(null)
    if (!folded) return
    focusReopen.current = true
    setOpen(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bad = fr('Ce lien n’est pas reconnu : copie-le en entier, depuis « https » jusqu’à la fin.')
    const input = parseShareInput(text)
    if (!input) return setError(bad)
    if (input.kind === 'report') return navigate(`/rapport?d=${input.d}`)
    setBusy(true)
    let raw: unknown = null
    try {
      raw = await decodePayload<unknown>(input.d)
    } catch {
      /* lien abîmé */
    }
    setBusy(false)
    if (readReportPayload(raw)) return navigate(`/rapport?d=${input.d}`)
    const p = readNotesPayload(raw)
    if (!p) return setError(bad)
    const { fresh, updated } = importCounts(state.notes, p.notes)
    dispatch({ type: 'notes:import', notes: p.notes, from: p.from })
    toast(importSummary(fresh, updated))
    setText('')
    // des notes sont arrivées : on va les voir dans le carnet
    if (fresh + updated > 0) navigate('/carnet', { state: SHOW_NOTES })
    else fold()
  }

  if (!open) {
    return (
      <p className="paste-open" ref={reopenRef}>
        <TypedLink
          onClick={() => {
            focusInput.current = true
            setOpen(true)
          }}
        >
          {title}
        </TypedLink>
      </p>
    )
  }

  const hId = `h-${id}`
  const errId = `${id}-error`
  return (
    <section className="paste" aria-labelledby={hId}>
      <form onSubmit={submit} noValidate>
        <h2 className="paste-h" id={hId}>
          {title}
        </h2>
        <p className="pencil-note paste-hint">
          {fr(
            platform() === 'ios'
              ? 'sur iPhone, un lien touché dans Discord ou Messages s’ouvre dans Safari, pas dans le carnet installé : copie-le et colle-le ici'
              : hint,
          )}
        </p>
        <label className="field">
          <span>Le lien reçu</span>
          <input
            ref={inputRef}
            className="input typed"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            placeholder="https://…/#/importer?d=…"
            aria-invalid={!!error}
            aria-describedby={error ? errId : undefined}
          />
        </label>
        {error && (
          <p className="pencil-note paste-error" id={errId} role="alert">
            {error}
          </p>
        )}
        <div className="paste-btns">
          <PaperButton type="submit" disabled={!text.trim() || busy} rotate={-0.8}>
            Ouvrir le lien
          </PaperButton>
          {folded && <TypedLink onClick={fold}>Replier</TypedLink>}
        </div>
      </form>
    </section>
  )
}
