import { afterEach, describe, expect, it, vi } from 'vitest'
import { GHOSTS, MECHANICS } from '../data'
import { toastDuration } from '../components/Toast'
import { hydrate, initialState, MAX_ACTIVITY, MAX_LOG, readBackup, type PersistedState } from '../store/schema'
import { buildDeck, type CoachNote } from './cards'
import { NNBSP } from './format'
import { encodePayload } from './share'
import { schedule, type Grade } from './srs'
import {
  backupFileName,
  backupSummary,
  contentText,
  decodeProgress,
  encodeProgress,
  notesFileName,
  replaceText,
  transferErrorText,
  TRANSFER_MARKER,
} from './transfer'

const T0 = Date.UTC(2026, 9, 1, 12)

const note = (i: number, body = 'Encens : 90 s de répit, 60 s pour le Démon. « Ne pas traîner »'): CoachNote => ({
  id: `n${i}`,
  createdAt: T0 + i,
  updatedAt: T0 + i,
  ghostId: GHOSTS[i % GHOSTS.length].id,
  title: `Note ${i}`,
  body,
  asCard: i % 2 === 0,
  author: 'Ryz',
  pinned: i % 7 === 0,
})

/** Un carnet bien rempli : chaque question vue, le journal et le registre pleins, beaucoup de notes. */
function bigState(nNotes = 300): PersistedState {
  const s = initialState(T0)
  s.onboarded = true
  s.profile = { name: 'Léa', coachName: 'Ryz', role: 'student', createdAt: T0 }
  s.settings = { ...s.settings, newPerDay: 15, focus: [GHOSTS[0].id, GHOSTS[3].id], lastSharedAt: T0 }
  s.notes = Array.from({ length: nNotes }, (_, i) => note(i, `Ligne ${i}\n`.repeat(20)))
  const deck = buildDeck(GHOSTS, MECHANICS, s.notes)
  deck.forEach((c, i) => {
    s.cards[c.id] = schedule(undefined, ((i % 4) + 1) as Grade, T0 + i * 1000)
  })
  s.log = Array.from({ length: MAX_LOG }, (_, i) => ({ id: deck[i % deck.length].id, t: T0 + i * 60_000, g: ((i % 4) + 1) as Grade, isNew: i < deck.length }))
  s.answers = Object.fromEntries(deck.slice(0, 200).map((c, i) => [c.id, { c: i % 9, t: 9, recent: [1, 0, 1, 1, 0, 1, 1, 1, 0, 1] }]))
  s.activity = Array.from({ length: MAX_ACTIVITY }, (_, i) => ({ t: T0 + i * 3_600_000, kind: 'quiz' as const, score: i % 10, total: 10, label: `Quiz ${i}` }))
  return s
}

function smallState(): PersistedState {
  const s = initialState(T0)
  s.onboarded = true
  s.profile = { name: 'Léa', coachName: '', role: 'solo', createdAt: T0 }
  s.notes = [note(1), note(2)]
  const deck = buildDeck(GHOSTS, MECHANICS, s.notes)
  for (const c of deck.slice(0, 12)) s.cards[c.id] = schedule(undefined, 3, T0)
  s.log = deck.slice(0, 12).map((c, i) => ({ id: c.id, t: T0 + i, g: 3 as Grade, isNew: true }))
  s.activity = [{ t: T0, kind: 'review', score: 10, total: 12, label: 'Révision du jour' }]
  return s
}

/** Le code sans son repère, et le repère d'une autre version. */
const body = (code: string) => code.slice(code.indexOf(':') + 1)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Copier-coller la progression : du navigateur à l’app installée', () => {
  it('le code porte un repère et une version, puis l’état compressé ; il redonne exactement le carnet', async () => {
    const s = smallState()
    const code = await encodeProgress(s)
    expect(code.startsWith(`${TRANSFER_MARKER}1:z`)).toBe(true)
    expect(code).toMatch(/^PHASMO1:[zj][A-Za-z0-9_-]+$/)
    const r = await decodeProgress(code)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state).toEqual(hydrate(s))
  })

  it('sans compression dans le navigateur, le code passe en clair (base64url) et se relit pareil', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    const s = smallState()
    const code = await encodeProgress(s)
    expect(code.startsWith('PHASMO1:j')).toBe(true)
    const r = await decodeProgress(code)
    expect(r.ok && r.state).toEqual(hydrate(s))
  })

  it('un code collé avec des espaces, un retour à la ligne ou entouré de mots se lit quand même', async () => {
    const s = smallState()
    const code = await encodeProgress(s)
    for (const pasted of [`  ${code}\n`, `Ma progression : ${code} (à coller)`, `\n\n${code}`]) {
      const r = await decodeProgress(pasted)
      expect(r.ok && r.state.profile.name).toBe('Léa')
    }
  })

  it('un gros carnet (journal et registre pleins, 300 notes) fait l’aller-retour, et le code reste bien plus court que les données', async () => {
    const s = bigState()
    const code = await encodeProgress(s)
    const r = await decodeProgress(code)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state).toEqual(hydrate(s))
    expect(r.state.log).toHaveLength(MAX_LOG)
    expect(r.state.activity).toHaveLength(MAX_ACTIVITY)
    expect(r.state.notes).toHaveLength(300)
    expect(code.length).toBeLessThan(JSON.stringify(s).length / 3)
  })

  it('un code abîmé (coupé, caractère changé, morceau perdu) est refusé sans rien remplacer', async () => {
    const code = await encodeProgress(smallState())
    const mid = Math.floor(code.length / 2)
    const swapped = code.slice(0, mid) + (code[mid] === 'A' ? 'B' : 'A') + code.slice(mid + 1)
    for (const bad of [code.slice(0, mid), swapped, code.slice(0, 20) + code.slice(40), 'PHASMO1:', 'PHASMO1:z', 'PHASMO1:q1234567890', 'PHASMO0:' + body(code)]) {
      const r = await decodeProgress(bad)
      expect(r, bad.slice(0, 30)).toEqual({ ok: false, error: 'damaged' })
    }
    // le même code, en clair et tronqué : du JSON coupé
    vi.stubGlobal('CompressionStream', undefined)
    const plain = await encodeProgress(smallState())
    expect(await decodeProgress(plain.slice(0, plain.length - 10))).toEqual({ ok: false, error: 'damaged' })
  })

  it('autre chose qu’un code : texte quelconque, mauvais repère, lien du coach, champ vide', async () => {
    const code = await encodeProgress(smallState())
    expect(await decodeProgress('bonjour')).toEqual({ ok: false, error: 'marker' })
    expect(await decodeProgress(body(code))).toEqual({ ok: false, error: 'marker' })
    expect(await decodeProgress(`PHASMA1:${body(code)}`)).toEqual({ ok: false, error: 'marker' })
    expect(await decodeProgress(`phasmo1:${body(code)}`)).toEqual({ ok: false, error: 'marker' })
    expect(await decodeProgress('https://ryz.github.io/phasmo-coach/#/importer?d=zq1ZKkktLlGyUlAqzs8tSM0rVajIzEkFAA')).toEqual({ ok: false, error: 'link' })
    expect(await decodeProgress('   \n')).toEqual({ ok: false, error: 'empty' })
  })

  it('un code d’une version plus récente de l’app est reconnu comme tel', async () => {
    const code = await encodeProgress(smallState())
    expect(await decodeProgress(`PHASMO2:${body(code)}`)).toEqual({ ok: false, error: 'version' })
    expect(transferErrorText('version')).toContain('version plus récente')
  })

  it('le contenu passe par le même nettoyage qu’un fichier de sauvegarde ; des notes seules ne remplacent pas le carnet', async () => {
    // Une date illisible est remplacée par « maintenant » : l'horloge est figée pour comparer les deux nettoyages.
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const raw = {
      version: 1,
      onboarded: true,
      profile: { name: 4, role: 'admin', coachName: null, createdAt: 'hier' },
      settings: { newPerDay: 10 },
      cards: {},
      log: 'rien',
      answers: [],
      activity: null,
      notes: [{ id: 'a', title: 'Titre', body: 'x'.repeat(9000), createdAt: -5 }, { title: 'sans id' }, 'texte'],
    }
    const r = await decodeProgress(`PHASMO1:${await encodePayload(raw)}`)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state).toEqual(readBackup(raw))
    expect(r.state.profile).toMatchObject({ name: '', role: 'solo', coachName: '' })
    expect(r.state.log).toEqual([])
    expect(r.state.notes).toHaveLength(1)
    expect(r.state.notes[0].body).toHaveLength(8000)

    const notesOnly = { kind: 'phasmo-coach/notes', from: 'Ryz', at: T0, notes: [note(1)] }
    expect(await decodeProgress(`PHASMO1:${await encodePayload(notesOnly)}`)).toEqual({ ok: false, error: 'damaged' })
    expect(readBackup(notesOnly)).toBeNull()
    expect(await decodeProgress(`PHASMO1:${await encodePayload({ ...raw, version: 2 })}`)).toEqual({ ok: false, error: 'damaged' })
  })
})

describe('Remplacer le carnet : ce qui arrive et ce qui part, au singulier comme au pluriel', () => {
  it('compte les questions vues, les séances et les notes', () => {
    const b = backupSummary(smallState())
    expect(b).toMatchObject({ name: 'Léa', seen: 12, sessions: 1, notes: 2, reviews: 12 })
    expect(contentText(b)).toBe('12 questions vues, 1 séance, 2 notes')
    expect(contentText({ name: '', seen: 1, sessions: 0, notes: 1, reviews: 1 })).toBe('1 question vue, aucune séance, 1 note')
    expect(contentText(backupSummary(initialState()))).toBe('aucune question vue, aucune séance, aucune note')
  })

  it('carnet vide : rien ne sera perdu ; sinon, il dit ce qui sera remplacé', () => {
    const incoming = backupSummary(smallState())
    const empty = replaceText(backupSummary(initialState()), incoming, 'code')
    expect(empty).toBe(`Progression copiée (carnet de Léa)${NNBSP}: 12 questions vues, 1 séance, 2 notes. Ce carnet est encore vide${NNBSP}: rien ne sera perdu.`)
    const here = { name: 'Léa', seen: 3, sessions: 2, notes: 0, reviews: 3 }
    const file = replaceText(here, { ...incoming, name: '' }, 'file')
    expect(file).toContain(`Sauvegarde du fichier${NNBSP}: 12 questions vues`)
    expect(file).toContain(`Elle remplacera tout ce carnet${NNBSP}: 3 questions vues, 2 séances, aucune note.`)
    expect(file).not.toMatch(/ [:;?!]/)
  })

  it('les messages d’erreur ont la typographie française et disent quoi faire', () => {
    for (const e of ['empty', 'link', 'marker', 'version', 'damaged'] as const) {
      for (const from of ['clipboard', 'field'] as const) {
        const t = transferErrorText(e, from)
        expect(t).not.toMatch(/ [:;?!»]|« /)
        expect(t.length).toBeGreaterThan(30)
      }
    }
    expect(transferErrorText('marker', 'clipboard')).toContain(`«${NNBSP}Copier ma progression${NNBSP}»`)
  })

  it('les fichiers portent la date du jour de l’appareil, et le message d’export reste le temps d’être lu', () => {
    const late = new Date(2026, 10, 1, 23, 30).getTime()
    expect(backupFileName(late)).toBe('phasmo-coach-sauvegarde-2026-11-01.json')
    expect(notesFileName(late)).toBe('phasmo-coach-notes-2026-11-01.json')
    expect(toastDuration('Lien copié')).toBe(2800)
    expect(toastDuration(`Sauvegarde complète exportée : ${backupFileName(late)}, dans tes téléchargements`)).toBeGreaterThan(4500)
    expect(toastDuration('x'.repeat(500))).toBe(6000)
  })
})
