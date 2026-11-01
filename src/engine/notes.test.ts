import { describe, expect, it } from 'vitest'
import { SOURCE_REPO_URL } from '../config'
import { GHOSTS, MECHANICS } from '../data'
import { initialState, sanitizeNotes, type Profile } from '../store/schema'
import { buildDeck, firstLineTitle, noteCards, noteQuestion, writtenTitle, type CoachNote } from './cards'
import { NNBSP } from './format'
import { reviewNotes, skipsOwnReview } from './notes'
import { buildReviewQueue } from './progress'
import { reportIssueUrl, reportText, reportTitle, WHOLE_FICHE } from './report'

const T0 = new Date('2026-10-31T10:00:00').getTime()
const LONG = 'L’encens bloque le Hantu pendant 90 secondes seulement si tu le poses dans sa pièce la plus froide, sinon il file vers toi.'

/** Une note telle que l'éditeur l'enregistre : sans titre écrit, le titre est la première ligne du texte. */
const note = (id: string, extra: Partial<CoachNote> & { written?: string } = {}): CoachNote => {
  const { written, ...rest } = extra
  const body = rest.body ?? LONG
  return {
    id,
    createdAt: T0,
    updatedAt: T0,
    ghostId: 'hantu',
    title: written?.trim() || firstLineTitle(body),
    body,
    asCard: true,
    author: 'Ryz',
    ...rest,
  }
}

describe('notes en révision : une note sans titre se demande en entier, jamais coupée', () => {
  it('le cas des juges : une longue note du coach sans titre ne donne plus « Que retenir de « L’encens bloque… si t… » »', () => {
    const n = note('a')
    expect(n.title.endsWith('…')).toBe(true)
    expect(writtenTitle(n)).toBe('')
    const [card] = noteCards([n], GHOSTS)
    expect(card.front).toBe(`Que retenir de la note sur le Hantu${NNBSP}?`)
    expect(card.front).not.toContain('…')
    // la réponse : la note entière
    expect(card.back).toBe(LONG)
  })

  it('une première ligne qui est une question devient la question, le reste la réponse', () => {
    const q = noteQuestion(note('b', { body: 'Combien de temps l’encens bloque-t-il un Démon ?\n60 secondes au lieu de 90.', ghostId: 'demon' }), GHOSTS)
    expect(q).toEqual({ front: 'Combien de temps l’encens bloque-t-il un Démon ?', back: '60 secondes au lieu de 90.' })
  })

  it('une première ligne qui se lit comme un titre, suivie du reste, sert de titre ; au dos, la note entière', () => {
    const q = noteQuestion(note('c', { body: 'Encens et Démon.\nIl rechasse 60 s après, pas 90.' }), GHOSTS)
    expect(q).toEqual({ front: `Que retenir de «${NNBSP}Encens et Démon${NNBSP}»${NNBSP}?`, back: 'Encens et Démon.\nIl rechasse 60 s après, pas 90.' })
  })

  it('une première ligne qui est déjà le contenu (une phrase chiffrée, une liste) ne devient pas la question, et reste au dos', () => {
    // telles que sanitizeNotes les garde
    const [fast, list, numbered] = sanitizeNotes([
      { id: 'r1', createdAt: T0, updatedAt: T0, ghostId: 'hantu', title: '', body: 'Plus rapide dans le froid, jusqu’à 2,7 m/s.\nCoupe le disjoncteur avant la chasse.', asCard: true, author: 'Coach' },
      { id: 'r2', createdAt: T0, updatedAt: T0, ghostId: 'hantu', title: '', body: '- souffle froid visible\n- vitesse selon la température', asCard: true, author: 'Coach' },
      { id: 'r3', createdAt: T0, updatedAt: T0, ghostId: null, title: '', body: '1. Poser l’encens\n2. Compter jusqu’à 90', asCard: true, author: 'Coach' },
    ])
    for (const n of [fast, list]) {
      const q = noteQuestion(n, GHOSTS)
      expect(q.front, n.body).toBe(`Que retenir de la note sur le Hantu${NNBSP}?`)
      expect(q.back).toBe(n.body)
      expect(q.vague).toBe(true)
    }
    expect(noteQuestion(fast, GHOSTS).front).not.toContain('2,7')
    expect(noteQuestion(numbered, GHOSTS)).toEqual({ front: `Que retenir de la note du 31 octobre${NNBSP}?`, back: numbered.body, vague: true })
  })

  it('une note générale sans titre se demande par son jour ; un titre écrit reste la question', () => {
    expect(noteQuestion(note('d', { ghostId: null }), GHOSTS).front).toBe(`Que retenir de la note du 31 octobre${NNBSP}?`)
    expect(noteQuestion(note('e', { ghostId: null, createdAt: new Date('2026-11-01T09:00:00').getTime() }), GHOSTS).front).toBe(
      `Que retenir de la note du 1er novembre${NNBSP}?`,
    )
    expect(noteQuestion(note('f', { written: 'Encens' }), GHOSTS).front).toBe(`Que retenir de «${NNBSP}Encens${NNBSP}»${NNBSP}?`)
    expect(noteQuestion(note('g', { written: 'Pourquoi l’encens ?' }), GHOSTS).front).toBe(`Que retenir de «${NNBSP}Pourquoi l’encens ?${NNBSP}»`)
    // la question écrite passe avant tout
    expect(noteQuestion(note('h', { question: 'Combien de temps ?', answer: '90 s' }), GHOSTS)).toEqual({ front: 'Combien de temps ?', back: '90 s' })
    // le jour ou l'entité seuls ne disent pas ce qu'on demande : l'éditeur demande un titre ; un titre écrit, non
    expect(noteQuestion(note('d', { ghostId: null }), GHOSTS).vague).toBe(true)
    expect(noteQuestion(note('a'), GHOSTS).vague).toBe(true)
    expect(noteQuestion(note('f', { written: 'Encens' }), GHOSTS).vague).toBeUndefined()
  })

  it('aucune note du carnet, même venue d’un vieux lien, ne donne une question coupée', () => {
    const raw = [{ id: 'x', title: '', body: LONG, ghostId: 'oni', asCard: true, author: 'Ryz', createdAt: T0 }]
    const [card] = buildDeck(GHOSTS, MECHANICS, sanitizeNotes(raw)).filter((c) => c.deck === 'coach')
    expect(card.front).toBe(`Que retenir de la note sur l’Oni${NNBSP}?`)
  })
})

describe('coach : ses propres notes n’encombrent pas sa révision, sauf s’il le demande', () => {
  const coach: Profile = { name: 'Ryz', coachName: '', role: 'coach', createdAt: T0 }
  const student: Profile = { name: 'Léa', coachName: 'Ryz', role: 'student', createdAt: T0 }
  const notes = [note('mine'), note('unsigned', { author: '' }), note('from-lea', { author: 'Léa' })]

  it('par défaut, côté coach, ses notes (et celles sans signature) restent hors de sa révision', () => {
    expect(notes.map((n) => skipsOwnReview(n, coach, {}))).toEqual([true, true, false])
    expect(reviewNotes(notes, coach, {}).map((n) => n.id)).toEqual(['from-lea'])
    const state = { ...initialState(T0), onboarded: true, profile: coach, notes }
    const deck = buildDeck(GHOSTS, MECHANICS, reviewNotes(notes, coach, state.settings))
    const queue = buildReviewQueue(state, deck, T0)
    expect(queue.map((c) => c.id)).not.toContain('n:mine')
    expect(queue.map((c) => c.id)).toContain('n:from-lea')
  })

  it('l’option cochée les remet dans sa révision ; l’élève et qui s’entraîne seul·e ne sont pas concernés', () => {
    expect(reviewNotes(notes, coach, { reviewOwnNotes: true })).toBe(notes)
    expect(reviewNotes(notes, student, {})).toBe(notes)
    expect(reviewNotes(notes, { ...coach, role: 'solo' }, {})).toBe(notes)
    // un vieux réglage sans la case : décochée
    expect(initialState(T0).settings.reviewOwnNotes).toBeUndefined()
  })
})

describe('signaler une erreur sur une fiche', () => {
  const r = { fiche: 'Hantu', part: 'Sans preuve', what: 'La vitesse au froid me semble fausse.\nVu hier en partie.', source: '', url: 'https://exemple.test/#/codex/hantu' }

  it('un texte brut, prêt à coller sur Discord : fiche, partie, ce qui est faux, source, lien', () => {
    expect(reportText(r)).toBe(
      [
        'Signalement Phasmo Coach',
        `Fiche${NNBSP}: Hantu`,
        `Partie${NNBSP}: Sans preuve`,
        `Ce qui est faux ou pas clair${NNBSP}:`,
        'La vitesse au froid me semble fausse.\nVu hier en partie.',
        `Source${NNBSP}: non précisée`,
        `Lien${NNBSP}: https://exemple.test/#/codex/hantu`,
      ].join('\n'),
    )
    expect(reportText({ ...r, source: ' patch 0.16 ' })).toContain(`Source${NNBSP}: patch 0.16`)
  })

  it('GitHub reste possible : la demande sur le dépôt du projet, titrée et remplie', () => {
    expect(reportTitle(r)).toBe(`Fiche Hantu${NNBSP}: Sans preuve`)
    expect(reportTitle({ fiche: 'Hantu', part: WHOLE_FICHE })).toBe('Fiche Hantu')
    const url = new URL(reportIssueUrl(r))
    expect(url.href.startsWith(`${SOURCE_REPO_URL}/issues/new?`)).toBe(true)
    expect(url.searchParams.get('title')).toBe(reportTitle(r))
    expect(url.searchParams.get('body')).toBe(reportText(r))
  })
})
