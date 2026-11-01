/**
 * Encodage compact d'un objet JSON dans une URL (partage de notes ou de progression sans serveur).
 * Format : "z" + base64url(deflate-raw(json)) si CompressionStream est disponible, sinon "j" + base64url(json).
 */
import { sanitizeNotes, type Profile, type ReviewEntry } from '../store/schema'
import type { CoachNote } from './cards'
import { plural, validTime } from './format'
import { coachNotes, isOwnNote, makesCard } from './notes'
import type { CardState, Grade } from './srs'

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Response(bytes as BodyInit).body
  if (!body) throw new Error('flux indisponible')
  const res = new Response(body.pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

export async function encodePayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value))
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
    } catch {
      /* repli sans compression */
    }
  }
  return 'j' + toBase64Url(json)
}

export async function decodePayload<T>(data: string): Promise<T> {
  const kind = data[0]
  const bytes = fromBase64Url(data.slice(1))
  let json: Uint8Array
  if (kind === 'z') json = await pipe(bytes, new DecompressionStream('deflate-raw'))
  else if (kind === 'j') json = bytes
  else throw new Error('Format de lien inconnu')
  return JSON.parse(new TextDecoder().decode(json)) as T
}

export function appUrl(hashPath: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#${hashPath}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ==========================================================================
   Ce que transportent les liens : notes du carnet, bilan de progression
   ========================================================================== */

/** Un carnet (ou une partie) envoyé par lien ou fichier. */
export interface NotesPayload {
  kind: 'phasmo-coach/notes'
  from: string
  /** date d'envoi (null si le lien en porte une illisible) */
  at: number | null
  notes: CoachNote[]
}

/** Où en est l'élève sur une note du coach devenue carte. */
export interface ReportNote {
  title: string
  phase: 'new' | 'learning' | 'review'
  lapses: number
  /** dernière réponse donnée : 1 À revoir, 2 Difficile, 3 Bien, 4 Facile (null : jamais révisée) */
  grade: 1 | 2 | 3 | 4 | null
  due: number | null
}

export interface ReportActivity {
  t: number | null
  kind: string
  score: number
  total: number
  label: string
}

/** Bilan de progression envoyé par l'élève, en lecture seule. */
export interface ReportPayload {
  kind: 'phasmo-coach/report'
  name: string
  at: number | null
  streak: number
  learned: number
  total: number
  mastery: Record<string, number>
  activity: ReportActivity[]
  /** absent des liens créés avant cette version */
  notes?: ReportNote[]
}

/** Discord transforme un message de plus de 2 000 caractères en pièce jointe. */
export const DISCORD_LIMIT = 2000
/** Au-delà, on prévient que le lien risque de ne pas passer dans un message. */
export const LONG_LINK = 1900

export interface ShareInput {
  kind: 'notes' | 'report'
  d: string
}

const PAYLOAD = /^[zj][A-Za-z0-9_-]{8,}$/

/**
 * Lit ce que l'on colle dans le carnet : un lien complet (…#/importer?d=… ou …#/rapport?d=…), même
 * entouré d'autres mots ou de chevrons (Discord), ou seulement la valeur de d=. Une valeur seule est
 * supposée être des notes : le contenu décodé dira si c'est en fait un bilan.
 */
export function parseShareInput(text: string): ShareInput | null {
  let s = text.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* texte tel quel */
  }
  const m = s.match(/\/(importer|rapport)\?(?:[^\s#]*?&)?d=([A-Za-z0-9_-]+)/)
  if (m) return PAYLOAD.test(m[2]) ? { kind: m[1] === 'rapport' ? 'report' : 'notes', d: m[2] } : null
  const bare = s.replace(/^<|>$/g, '').replace(/^d=/, '')
  return PAYLOAD.test(bare) ? { kind: 'notes', d: bare } : null
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const count = (v: unknown, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0)

/** Valide un carnet reçu (lien ou fichier) : null s'il n'en est pas un ou ne contient aucune note lisible. */
/** Nombre maximal de notes lues dans un lien ou un fichier de notes. */
export const MAX_SHARED_NOTES = 500

export function readNotesPayload(raw: unknown): NotesPayload | null {
  if (!isObj(raw) || raw.kind !== 'phasmo-coach/notes') return null
  // un lien raisonnable tient en quelques dizaines de notes : au-delà, on coupe
  const notes = sanitizeNotes(Array.isArray(raw.notes) ? raw.notes.slice(0, MAX_SHARED_NOTES) : raw.notes)
  if (!notes.length) return null
  return { kind: 'phasmo-coach/notes', from: text(raw.from, 80).trim(), at: validTime(raw.at), notes }
}

/** Un fichier de notes (« Mes notes »), même vide ou abîmé : pour dire où l'importer quand il arrive au mauvais endroit. */
export function isNotesFile(raw: unknown): boolean {
  return isObj(raw) && raw.kind === 'phasmo-coach/notes'
}

/** Valide chaque champ d'un bilan reçu : un lien peut contenir n'importe quoi. */
export function readReportPayload(raw: unknown): ReportPayload | null {
  if (!isObj(raw) || raw.kind !== 'phasmo-coach/report') return null
  const mastery: Record<string, number> = {}
  if (isObj(raw.mastery)) {
    for (const [k, v] of Object.entries(raw.mastery).slice(0, 80)) {
      if (/^[a-z0-9-]{1,40}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) mastery[k] = Math.min(100, Math.max(0, v))
    }
  }
  const activity: ReportActivity[] = (Array.isArray(raw.activity) ? raw.activity : [])
    .filter(isObj)
    .slice(-30)
    .map((a) => ({ t: validTime(a.t), kind: text(a.kind, 20), score: count(a.score), total: count(a.total), label: text(a.label, 80) }))
  const out: ReportPayload = {
    kind: 'phasmo-coach/report',
    name: text(raw.name, 60).trim(),
    at: validTime(raw.at),
    streak: count(raw.streak, 10_000),
    learned: count(raw.learned),
    total: count(raw.total),
    mastery,
    activity,
  }
  if (Array.isArray(raw.notes)) {
    const phases = ['new', 'learning', 'review'] as const
    out.notes = raw.notes
      .filter(isObj)
      .slice(0, 60)
      .map((n): ReportNote => ({
        title: text(n.title, 120).trim(),
        phase: phases.find((p) => p === n.phase) ?? 'new',
        lapses: count(n.lapses, 999),
        grade: n.grade === 1 || n.grade === 2 || n.grade === 3 || n.grade === 4 ? n.grade : null,
        due: validTime(n.due),
      }))
      .filter((n) => n.title)
  }
  return out
}

/**
 * Les notes à envoyer : seulement celles écrites par la personne qui tient le carnet (on ne renvoie
 * jamais à quelqu'un ses propres notes signées d'un autre), et par défaut seulement les nouvelles ou
 * modifiées depuis le dernier envoi.
 */
export function notesToShare(notes: CoachNote[], profile: Profile, since: number | undefined, all = false): CoachNote[] {
  return notes.filter((n) => isOwnNote(n, profile) && (all || since == null || Math.max(n.createdAt, n.updatedAt) > since))
}

export function canShareNatively(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** Feuille de partage du système (iPhone, Android) : 'cancelled' si la personne l'a refermée. */
export async function shareNatively(url: string, title?: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share(title ? { title, url } : { url })
    return 'shared'
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}

/**
 * La partie « notes » du bilan : pour chaque note du coach devenue carte, où en est l'élève. Le coach
 * voit ainsi si ses explications tiennent sans avoir à les répéter.
 */
export function reportNotes(notes: CoachNote[], profile: Profile, cards: Record<string, CardState>, log: ReviewEntry[], max = 40): ReportNote[] {
  const last = new Map<string, Grade>()
  for (const e of log) if (e.id.startsWith('n:')) last.set(e.id, e.g)
  return coachNotes(notes, profile)
    .filter(makesCard)
    .slice(0, max)
    .map((n): ReportNote => {
      const id = `n:${n.id}`
      const s = cards[id]
      return {
        title: n.title.slice(0, 80),
        phase: !s ? 'new' : s.phase === 'review' ? 'review' : 'learning',
        lapses: s?.lapses ?? 0,
        grade: last.get(id) ?? null,
        due: s ? validTime(s.due) : null,
      }
    })
}

/** Ce qu'un carnet reçu apporterait : notes absentes d'ici, notes plus récentes que les nôtres. */
export function importCounts(current: CoachNote[], incoming: CoachNote[]): { fresh: number; updated: number } {
  const byId = new Map(current.map((n) => [n.id, n]))
  let fresh = 0
  let updated = 0
  for (const n of incoming) {
    const cur = byId.get(n.id)
    if (!cur) fresh++
    else if (cur.updatedAt < n.updatedAt) updated++
  }
  return { fresh, updated }
}

/** Ce qu'un carnet reçu a changé, en une phrase (toast). */
export function importSummary(fresh: number, updated: number): string {
  if (!fresh && !updated) return 'Tout est déjà dans ton carnet'
  const parts: string[] = []
  if (fresh) parts.push(fresh > 1 ? `${fresh} nouvelles notes` : '1 nouvelle note')
  if (updated) parts.push(fresh ? plural(updated, 'mise à jour', 'mises à jour') : updated > 1 ? `${updated} notes mises à jour` : '1 note mise à jour')
  return `${parts.join(' et ')} dans ton carnet`
}

/** Où en sont les notes écrites ici : combien, combien en révision, combien pas encore envoyées. */
export interface ShareSummary {
  written: number
  inReview: number
  toShare: number
  /** dernier envoi par lien (null : jamais) */
  lastShared: number | null
}

export function shareSummary(notes: CoachNote[], profile: Profile, lastSharedAt: unknown): ShareSummary {
  const lastShared = validTime(lastSharedAt)
  const own = notesToShare(notes, profile, undefined, true)
  return {
    written: own.length,
    inReview: own.filter(makesCard).length,
    toShare: notesToShare(notes, profile, lastShared ?? undefined).length,
    lastShared,
  }
}

/** « 3 notes écrites · 2 en révision · 1 à partager », tapé sur la fiche du coach. */
export function shareSummaryLine(s: ShareSummary): string {
  if (!s.written) return 'aucune note écrite pour l’instant'
  return [
    plural(s.written, 'note écrite', 'notes écrites'),
    s.inReview ? `${s.inReview} en révision` : 'aucune en révision',
    s.toShare ? `${s.toShare} à partager` : 'tout est partagé',
  ].join(' · ')
}
