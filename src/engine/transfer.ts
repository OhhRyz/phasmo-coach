/**
 * Passer sa progression d'un carnet à l'autre par copier-coller, sans fichier : sur iPhone, l'app installée
 * a sa propre mémoire, séparée de Safari, et ne voit rien de ce qui a été fait dans l'onglet.
 *
 * Le code : « PHASMO1: » (repère et version) suivi de l'état enregistré en entier, compressé quand le
 * navigateur le permet (voir encodePayload : "z" deflate-raw, sinon "j" sans compression), en base64url.
 * À la lecture, le contenu passe par le même nettoyage qu'une sauvegarde en fichier (readBackup).
 */
import { GHOSTS, MECHANICS } from '../data'
import { readBackup, type PersistedState } from '../store/schema'
import { buildDeck } from './cards'
import { dayKey, fr } from './format'
import { decodePayload, encodePayload, parseShareInput } from './share'

export const TRANSFER_MARKER = 'PHASMO'
export const TRANSFER_VERSION = 1

export async function encodeProgress(state: PersistedState): Promise<string> {
  return `${TRANSFER_MARKER}${TRANSFER_VERSION}:${await encodePayload(state)}`
}

/**
 * Pourquoi un texte collé n'a pas pu être repris : rien de collé, un lien du coach, autre chose qu'un code,
 * un code d'une version plus récente de l'app, un code incomplet ou abîmé.
 */
export type TransferError = 'empty' | 'link' | 'marker' | 'version' | 'damaged'

export type TransferResult = { ok: true; state: PersistedState } | { ok: false; error: TransferError }

const CODE = /PHASMO(\d+):([A-Za-z0-9_-]*)/

/** Lit un code collé (même entouré d'autres mots) ; rien n'est remplacé ici. */
export async function decodeProgress(text: string): Promise<TransferResult> {
  const s = text.trim()
  if (!s) return { ok: false, error: 'empty' }
  const m = s.match(CODE)
  // un lien de notes ou de bilan (…#/importer?d=…) collé au mauvais endroit
  if (!m) return { ok: false, error: /\/(importer|rapport)\?/.test(s) && parseShareInput(s) ? 'link' : 'marker' }
  const version = Number(m[1])
  if (version > TRANSFER_VERSION) return { ok: false, error: 'version' }
  if (version !== TRANSFER_VERSION || !/^[zj][A-Za-z0-9_-]+$/.test(m[2])) return { ok: false, error: 'damaged' }
  try {
    const state = readBackup(await decodePayload<unknown>(m[2]))
    return state ? { ok: true, state } : { ok: false, error: 'damaged' }
  } catch {
    return { ok: false, error: 'damaged' }
  }
}

/**
 * Ce qu'il faut faire quand une progression n'est pas reprise. `from` : lue dans le presse-papiers (bouton
 * « Coller ma progression ») ou collée à la main dans le champ.
 */
export function transferErrorText(error: TransferError, from: 'clipboard' | 'field' = 'field'): string {
  const again = 'Dans le navigateur où tu as commencé, touche « Copier ma progression », puis reviens ici.'
  switch (error) {
    case 'empty':
      return fr(from === 'clipboard' ? `Rien n’est copié pour l’instant. ${again}` : `Colle d’abord le texte copié. ${again}`)
    case 'link':
      return fr('C’est un lien de notes ou de bilan, pas une progression : colle-le dans la page « Coaching ».')
    case 'marker':
      return fr(`${from === 'clipboard' ? 'Ce qui est copié' : 'Ce texte'} n’est pas une progression. ${again}`)
    case 'version':
      return fr('Ce code vient d’une version plus récente de l’app : ferme l’app, rouvre-la pour la mettre à jour, puis colle-le à nouveau.')
    case 'damaged':
      return fr('Ce code est incomplet ou abîmé : copie-le à nouveau en entier, puis colle-le ici.')
  }
}

/** Ce que contient un carnet : prénom, questions vues (celles du paquet actuel), séances, notes, réponses en révision. */
export interface BackupSummary {
  name: string
  seen: number
  sessions: number
  notes: number
  reviews: number
}

export function backupSummary(s: PersistedState): BackupSummary {
  const deck = buildDeck(GHOSTS, MECHANICS, s.notes)
  return {
    name: s.profile.name.trim(),
    seen: deck.filter((c) => s.cards[c.id]).length,
    sessions: s.activity.length,
    notes: s.notes.length,
    reviews: s.log.length,
  }
}

const count = (n: number, one: string, many: string, none: string) => (n === 0 ? none : `${n} ${n > 1 ? many : one}`)

/** « 12 questions vues, 1 séance, 1 note » ; « aucune question vue, aucune séance, aucune note ». */
export function contentText(b: BackupSummary): string {
  return [
    count(b.seen, 'question vue', 'questions vues', 'aucune question vue'),
    count(b.sessions, 'séance', 'séances', 'aucune séance'),
    count(b.notes, 'note', 'notes', 'aucune note'),
  ].join(', ')
}

const isEmpty = (b: BackupSummary) => b.seen === 0 && b.sessions === 0 && b.notes === 0 && b.reviews === 0

/**
 * Le texte de la confirmation « Remplacer par cette progression ? » : ce qui arrive, et ce qui sera remplacé
 * sur cet appareil. `source` : un fichier de sauvegarde, ou une progression copiée.
 */
export function replaceText(current: BackupSummary, incoming: BackupSummary, source: 'file' | 'code'): string {
  const what = source === 'file' ? 'Sauvegarde du fichier' : 'Progression copiée'
  const whose = incoming.name ? ` (carnet de ${incoming.name})` : ''
  const lost = isEmpty(current)
    ? 'Ce carnet est encore vide : rien ne sera perdu.'
    : `Elle remplacera tout ce carnet : ${contentText(current)}. Exporte une sauvegarde avant si tu veux pouvoir revenir en arrière.`
  return fr(`${what}${whose} : ${contentText(incoming)}. ${lost}`)
}

/** Nom du fichier de la sauvegarde complète (profil) et de celui des notes seules (« Mes notes »), à la date du jour. */
export function backupFileName(now = Date.now()): string {
  return `phasmo-coach-sauvegarde-${dayKey(now)}.json`
}

export function notesFileName(now = Date.now()): string {
  return `phasmo-coach-notes-${dayKey(now)}.json`
}
