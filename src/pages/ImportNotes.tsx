import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileHead, H, Notebook, Page, PaperButton, Stamp, Sticky, TapeButton, TypedLink } from '../components/journal/Journal'
import { useToast } from '../components/Toast'
import { getGhost } from '../data'
import { isStandalone, platform } from '../engine/device'
import { formatDate, fr, safeDate } from '../engine/format'
import { isCoachNote } from '../engine/notes'
import { copyText, decodePayload, importCounts, readNotesPayload, type NotesPayload } from '../engine/share'
import { useStore } from '../store/store'
import { importSummary, isLongNote, NoteText, TornPage } from './Notebook'

type Style = CSSProperties & Record<`--${string}`, string | number>

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const TILT = [1.6, -1.3, 0.8, -1.8, 1.1, -0.6]

/**
 * Sur iPhone, un lien touché dans Discord ou Messages s'ouvre dans Safari : l'app installée sur l'écran
 * d'accueil a sa propre mémoire et ne verrait jamais ces notes. On propose de copier le lien pour le
 * coller dans le carnet de l'app.
 */
function IosTabHint() {
  const toast = useToast()
  const [showUrl, setShowUrl] = useState(false)
  const href = window.location.href
  return (
    <div className="pli-ios">
      <p className="pencil-note">
        {fr('Si tu as installé le carnet sur l’écran d’accueil, copie ce lien et colle-le dans le carnet de l’app : l’app installée a sa propre mémoire.')}
      </p>
      <PaperButton
        rotate={-0.8}
        onClick={async () => {
          if (await copyText(href)) toast(fr('Lien copié : colle-le dans Carnet, « Coller un lien reçu »'))
          else {
            setShowUrl(true)
            toast(fr('Copie impossible : le lien est sélectionné, copie-le à la main'))
          }
        }}
      >
        Copier le lien
      </PaperButton>
      {showUrl && (
        <textarea
          className="textarea share-url pli-url"
          readOnly
          autoFocus
          value={href}
          onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
          aria-label="Lien reçu"
        />
      )}
    </div>
  )
}

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
    decodePayload<unknown>(d)
      .then((raw) => {
        if (!current) return
        const p = readNotesPayload(raw)
        if (p) setData(p)
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
          <div className="empty-note">
            <H as="h1">Lien de partage invalide</H>
            <p>{fr('Le lien est peut-être incomplet : copie-le en entier, ou demande à le renvoyer.')}</p>
            <p>
              <TypedLink to="/carnet">Aller au carnet</TypedLink>
            </p>
          </div>
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
          <h1 className="sr-only">Ouverture du courrier</h1>
        </Page>
      </Notebook>
    )
  }

  const { fresh, updated } = importCounts(state.notes, data.notes)
  const nothingNew = fresh + updated === 0
  const n = data.notes.length
  const from = data.from
  const count = `${n} note${n > 1 ? 's' : ''}`
  const freshText = fresh ? `${fresh} nouvelle${fresh > 1 ? 's' : ''}` : 'aucune nouvelle'
  const date = data.at != null ? formatDate(data.at) : null
  const lead = nothingNew
    ? 'Tout est déjà dans ton carnet.'
    : `${date ? `Partagée${n > 1 ? 's' : ''} le ${date}. ` : ''}${fresh ? freshText : 'Aucune nouvelle'}, ${
        updated ? `${updated} mise${updated > 1 ? 's' : ''} à jour` : 'aucune mise à jour'
      }. Les notes déjà dans ton carnet ne sont jamais effacées.`
  const inBrowserTab = platform() === 'ios' && !isStandalone()

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
            {data.at != null && (
              <Stamp tone="violet" rotate={-14} thunk delay={0.6} className="pli-cachet">
                Posté le {safeDate(SHORT, data.at)}
              </Stamp>
            )}
            <span className="pli-label">
              <span className="pli-line">
                <small>De</small> <b>{from || '—'}</b>
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
            {count}
            {from && <> de {from}</>}
          </h1>
          <p className="entry-line">{lead}</p>
        </div>

        <div className="pli-actions">
          {nothingNew ? (
            <TapeButton to="/carnet">Ouvrir mon carnet</TapeButton>
          ) : (
            <>
              <TapeButton
                onClick={() => {
                  dispatch({ type: 'notes:import', notes: data.notes })
                  toast(importSummary(fresh, updated))
                  navigate('/carnet')
                }}
              >
                Coller dans mon carnet
              </TapeButton>
              <TypedLink to="/carnet">Annuler</TypedLink>
            </>
          )}
        </div>

        {inBrowserTab && <IosTabHint />}
      </Page>

      {/* ===================== page de droite : le contenu du pli ===================== */}
      <Page side="right" section="6" label="Contenu du pli">
        <FileHead>
          <span>Contenu du pli</span>
          <span>{count}</span>
        </FileHead>
        <section aria-labelledby="h-pli">
          <H id="h-pli" count={freshText}>
            Dans l’enveloppe
          </H>
          <ol className="pli-notes">
            {data.notes.map((note, i) => {
              const g = note.ghostId ? getGhost(note.ghostId) : undefined
              const cur = state.notes.find((x) => x.id === note.id)
              const status = !cur ? 'nouvelle' : cur.updatedAt < note.updatedAt ? 'plus récente que la tienne' : 'déjà dans le carnet'
              const meta = `${safeDate(SHORT, note.createdAt)} · ${g ? g.name : 'Général'}`
              const sign = note.author ? `— ${note.author}` : undefined
              const delay = Math.min(0.25 + i * 0.1, 0.9)
              const hand = isCoachNote(note, state.profile) ? 'coach' : 'mine'
              return (
                <li key={note.id} className={isLongNote(note) ? 'is-torn' : 'is-sticky'}>
                  {isLongNote(note) ? (
                    <TornPage meta={meta} sign={sign} rotate={TILT[i % TILT.length] * 0.4} delay={delay} hand={hand}>
                      <NoteText note={note} />
                    </TornPage>
                  ) : (
                    <Sticky meta={meta} sign={sign} rotate={TILT[i % TILT.length]} delay={delay} hand={hand}>
                      <NoteText note={note} />
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
