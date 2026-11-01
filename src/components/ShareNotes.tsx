import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fr, num, safeDate, validTime } from '../engine/format'
import { appUrl, canShareNatively, copyText, encodePayload, LONG_LINK, notesToShare, shareNatively, type NotesPayload } from '../engine/share'
import { useStore } from '../store/store'
import { PaperButton, TapeButton, TypedLink } from './journal/Journal'
import { useToast } from './Toast'
import { Modal, Seg } from './ui'

const LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

/**
 * Le lien à envoyer : sélectionnable, copiable, envoyable par la feuille de partage du téléphone.
 * Si la copie échoue, le lien est sélectionné pour être copié à la main. `onUsed` : le lien est parti.
 */
export function useShareLink(url: string | null, onUsed?: () => void) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()
  const used = useRef(onUsed)
  used.current = onUsed
  const select = () => {
    const t = ref.current
    if (!t) return
    t.focus()
    t.setSelectionRange(0, t.value.length)
  }
  const copy = async () => {
    if (!url) return
    if (await copyText(url)) {
      toast('Lien copié')
      used.current?.()
    } else {
      select()
      toast(fr('Copie impossible : le lien est sélectionné, copie-le à la main'))
    }
  }
  const send = async () => {
    if (!url) return
    const r = await shareNatively(url)
    if (r === 'shared') used.current?.()
    else if (r === 'failed') await copy()
  }
  return { ref, copy, send, select, canSend: canShareNatively(), onCopy: () => used.current?.() }
}

/** Le lien lui-même, et l'avertissement au crayon s'il est trop long pour un message Discord. */
export function ShareUrl({ link, url, label }: { link: ReturnType<typeof useShareLink>; url: string | null; label: string }) {
  return (
    <>
      <textarea
        ref={link.ref}
        className="textarea share-url"
        readOnly
        value={url ?? ''}
        onFocus={(e) => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
        onCopy={link.onCopy}
        aria-label={label}
      />
      {url && url.length > LONG_LINK && (
        <p className="pencil-note share-long" role="note">
          {fr(`lien de ${num(url.length)} caractères : un message Discord n’en garde que ${num(2000)}. Envoie seulement les nouvelles notes, ou passe par le fichier.`)}
        </p>
      )}
    </>
  )
}

/** Les boutons d'une fenêtre de lien : fermer, feuille de partage du téléphone, copier. */
function LinkActions({ link, ready, onClose }: { link: ReturnType<typeof useShareLink>; ready: boolean; onClose: () => void }) {
  return (
    <>
      <TypedLink onClick={onClose}>Fermer</TypedLink>
      {link.canSend && (
        <PaperButton onClick={link.send} disabled={!ready} rotate={-0.8}>
          Envoyer…
        </PaperButton>
      )}
      <TapeButton arrow={false} onClick={link.copy} disabled={!ready}>
        Copier le lien
      </TapeButton>
    </>
  )
}

/**
 * Envoyer ses notes par lien. Par défaut, seulement celles écrites ou modifiées depuis le dernier envoi
 * (pour que le lien tienne dans un message) ; « Toutes mes notes » renvoie l'ensemble. La date du dernier
 * envoi n'est notée que quand le lien part vraiment (copié ou envoyé).
 */
export function ShareNotesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // la fenêtre repart de zéro à chaque ouverture : le « depuis » est celui du moment où on l'ouvre
  return open ? <ShareNotesDialog onClose={onClose} /> : null
}

function ShareNotesDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const profile = state.profile
  const holder = profile.name.trim()
  const [since] = useState(() => validTime(state.settings.lastSharedAt) ?? undefined)
  const own = useMemo(() => notesToShare(state.notes, profile, undefined, true), [state.notes, profile])
  const freshCount = useMemo(() => notesToShare(state.notes, profile, since).length, [state.notes, profile, since])
  const [shareAll, setShareAll] = useState(() => since == null || freshCount === 0)
  const toSend = useMemo(() => notesToShare(state.notes, profile, since, shareAll), [state.notes, profile, since, shareAll])
  const [share, setShare] = useState<{ url: string; at: number } | null>(null)

  useEffect(() => {
    setShare(null)
    if (!toSend.length) return
    let current = true
    const at = Date.now()
    const payload: NotesPayload = { kind: 'phasmo-coach/notes', from: holder, at, notes: toSend }
    void encodePayload(payload).then((d) => current && setShare({ url: appUrl(`/importer?d=${d}`), at }))
    return () => {
      current = false
    }
  }, [toSend, holder])

  // le lien est parti : la prochaine fois, seules les notes écrites ou modifiées depuis seront proposées
  const link = useShareLink(share?.url ?? null, () => share && dispatch({ type: 'settings', settings: { lastSharedAt: share.at } }))
  const sinceLabel = since != null ? safeDate(LONG, since, '') : ''

  return (
    <Modal open onClose={onClose} title="Envoyer mes notes" actions={<LinkActions link={link} ready={!!share} onClose={onClose} />}>
      {own.length === 0 ? (
        <p className="modal-text">{fr('Tu n’as encore écrit aucune note : le lien emporte seulement les notes que tu as écrites.')}</p>
      ) : (
        <>
          {since != null && (
            <div className="share-choice">
              <Seg
                label="Notes à envoyer"
                value={shareAll ? 'all' : 'new'}
                onChange={(v) => setShareAll(v === 'all')}
                options={[
                  { value: 'new', label: freshCount ? `Les nouvelles (${freshCount})` : 'Les nouvelles (aucune)' },
                  { value: 'all', label: `Toutes mes notes (${own.length})` },
                ]}
              />
              {sinceLabel && <p className="pencil-note share-since">nouvelles ou modifiées depuis ton dernier envoi, le {sinceLabel}</p>}
            </div>
          )}
          {toSend.length === 0 ? (
            <p className="modal-text">{fr('Rien de nouveau depuis le dernier envoi. Choisis « Toutes mes notes » pour tout renvoyer.')}</p>
          ) : (
            <>
              <p className="modal-text">
                {fr(
                  `Envoie ce lien : en l’ouvrant, l’autre appareil pourra importer ${toSend.length > 1 ? `les ${toSend.length} notes` : 'la note'}. Celles qui existent déjà sont mises à jour, rien n’est effacé. Les notes voyagent dans le lien lui-même : aucun serveur ne les garde.`,
                )}
              </p>
              <ShareUrl link={link} url={share?.url ?? null} label="Lien de partage" />
              <p className="pencil-note share-ios">
                {fr('sur iPhone, le lien s’ouvre dans Safari : si le carnet est installé, il faut le coller dans l’app, page « Coaching »')}
              </p>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

/** Une fenêtre qui montre un lien prêt (bilan de progression). */
export function LinkModal({
  url,
  title,
  label,
  onClose,
  children,
}: {
  url: string | null
  title: string
  label: string
  onClose: () => void
  children?: ReactNode
}) {
  const link = useShareLink(url)
  return (
    <Modal open={!!url} onClose={onClose} title={title} actions={<LinkActions link={link} ready={!!url} onClose={onClose} />}>
      {children}
      <ShareUrl link={link} url={url} label={label} />
    </Modal>
  )
}
