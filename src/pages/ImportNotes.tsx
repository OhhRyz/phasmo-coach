import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileHead, H, Notebook, Page, Stamp, Sticky, TapeButton, TypedLink } from '../components/journal/Journal'
import { useToast } from '../components/Toast'
import { Empty } from '../components/ui'
import { getGhost } from '../data'
import { formatDate } from '../engine/format'
import { decodePayload } from '../engine/share'
import { sanitizeNotes } from '../store/schema'
import { useStore } from '../store/store'
import { isLongNote, NoteText, TornPage, type NotesPayload } from './Notebook'

type Style = CSSProperties & Record<`--${string}`, string | number>

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const TILT = [1.6, -1.3, 0.8, -1.8, 1.1, -0.6]

export function ImportNotes() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { state, dispatch } = useStore()
  const [data, setData] = useState<NotesPayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    setError(false)
    setData(null)
    const d = params.get('d')
    if (!d) {
      setError(true)
      return
    }
    decodePayload<NotesPayload>(d)
      .then((p) => {
        if (!current) return
        const notes = p.kind === 'phasmo-coach/notes' ? sanitizeNotes(p.notes) : []
        if (notes.length) setData({ ...p, notes, from: typeof p.from === 'string' ? p.from : '' })
        else setError(true)
      })
      .catch(() => current && setError(true))
    return () => {
      current = false
    }
  }, [params])

  if (error) {
    return (
      <Notebook single className="courrier">
        <Page section="6" label="Lien de partage invalide">
          <FileHead>
            <span>Courrier reçu</span>
            <span>Enveloppe vide</span>
          </FileHead>
          <Empty title="Lien de partage invalide">
            <p>Le lien est peut-être incomplet : copie-le en entier.</p>
            <p>
              <TypedLink to="/carnet">Aller au carnet</TypedLink>
            </p>
          </Empty>
        </Page>
      </Notebook>
    )
  }
  if (!data) {
    return (
      <Notebook single className="courrier">
        <Page section="6" label="Ouverture du courrier">
          <FileHead>
            <span>Courrier reçu</span>
            <span>Ouverture de l’enveloppe…</span>
          </FileHead>
        </Page>
      </Notebook>
    )
  }

  const existing = new Set(state.notes.map((n) => n.id))
  const fresh = data.notes.filter((n) => !existing.has(n.id)).length
  const updated = data.notes.filter((n) => {
    const cur = state.notes.find((x) => x.id === n.id)
    return cur && cur.updatedAt < n.updatedAt
  }).length
  const from = data.from || 'ton coach'
  const count = `${data.notes.length} note${data.notes.length > 1 ? 's' : ''}`

  return (
    <Notebook className="courrier">
      {/* ===================== page de gauche : l'enveloppe ===================== */}
      <Page side="left" section="6" label="Courrier reçu">
        <FileHead>
          <span>Courrier reçu</span>
          {state.profile.name && (
            <span>
              Pour <b>{state.profile.name}</b>
            </span>
          )}
        </FileHead>

        <div className="pli settle" style={{ '--r': '-1.2deg', '--d': '.1s' } as Style}>
          <div className="pli-body">
            <span className="pli-piece">Pli ouvert · par lien</span>
            <span className="pli-timbre" aria-hidden>
              <span>Phasmo</span>
              <i>Coach</i>
            </span>
            <Stamp tone="violet" rotate={-14} thunk delay={0.6} className="pli-cachet">
              Posté le {SHORT.format(data.at)}
            </Stamp>
            <span className="pli-label">
              <span className="pli-line">
                <small>De</small> <b>{from}</b>
              </span>
              <span className="pli-line">
                <small>Pour</small> <b>{state.profile.name || 'toi'}</b>
              </span>
              <span className="pli-line">
                <small>Contenu</small> {count}
              </span>
            </span>
          </div>
        </div>

        <div className="entry">
          <h1 className="entry-date">
            <em>Tu as reçu</em>
            {count} de {from}
          </h1>
          <p className="entry-line">
            Partagées le {formatDate(data.at)}. {fresh} nouvelle{fresh > 1 ? 's' : ''}, {updated} mise{updated > 1 ? 's' : ''} à jour. Les
            notes déjà dans ton carnet ne sont jamais effacées.
          </p>
        </div>

        <div className="pli-actions">
          <TapeButton
            onClick={() => {
              dispatch({ type: 'notes:import', notes: data.notes })
              toast('Carnet importé')
              navigate('/carnet')
            }}
          >
            Coller dans mon carnet
          </TapeButton>
          <TypedLink to="/carnet">Annuler</TypedLink>
        </div>
      </Page>

      {/* ===================== page de droite : le contenu du pli ===================== */}
      <Page side="right" section="6" label="Contenu du pli">
        <FileHead>
          <span>Contenu du pli</span>
          <span>{count}</span>
        </FileHead>
        <section aria-labelledby="h-pli">
          <H id="h-pli" count={`${fresh} nouvelle${fresh > 1 ? 's' : ''}`}>
            Dans l’enveloppe
          </H>
          <ol className="pli-notes">
            {data.notes.map((n, i) => {
              const g = n.ghostId ? getGhost(n.ghostId) : undefined
              const cur = state.notes.find((x) => x.id === n.id)
              const status = !cur ? 'nouvelle' : cur.updatedAt < n.updatedAt ? 'plus récente que la tienne' : 'déjà dans le carnet'
              const meta = `${SHORT.format(n.createdAt)} · ${g ? g.name : 'Général'}`
              const sign = n.author ? `— ${n.author}` : undefined
              const delay = Math.min(0.25 + i * 0.1, 0.9)
              return (
                <li key={n.id} className={isLongNote(n) ? 'is-torn' : 'is-sticky'}>
                  {isLongNote(n) ? (
                    <TornPage meta={meta} sign={sign} rotate={TILT[i % TILT.length] * 0.4} delay={delay}>
                      <NoteText note={n} />
                    </TornPage>
                  ) : (
                    <Sticky meta={meta} sign={sign} rotate={TILT[i % TILT.length]} delay={delay}>
                      <NoteText note={n} />
                    </Sticky>
                  )}
                  <span className={`pencil-note pli-status${cur ? '' : ' is-new'}`}>{status}</span>
                </li>
              )
            })}
          </ol>
        </section>
      </Page>
    </Notebook>
  )
}
