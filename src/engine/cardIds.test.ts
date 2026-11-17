import { describe, expect, it } from 'vitest'
import { GHOSTS, MECHANICS } from '../data'
import type { ConfirmationTest, Ghost, TextItem } from '../data/types'
import { resumeSession } from '../pages/reviewSession'
import { hydrate, readBackup, type PersistedState } from '../store/schema'
import { buildDeck, cardNumbers, ghostCards, reverseTells, zeroTests } from './cards'
import { dayKey } from './format'
import {
  allGhostMastery,
  buildReviewQueue,
  dueCards,
  ghostMastery,
  learnedCount,
  newCardsIntroducedToday,
  streak,
  studiedGhosts,
  unseenCards,
  weakestGhosts,
} from './progress'
import type { CardState } from './srs'
import { backupSummary } from './transfer'

/**
 * Les identifiants de carte tiennent à un numéro écrit dans la fiche (`card`), plus à un rang : supprimer,
 * rétrograder ou ajouter un test ou un signe ne fait jamais passer un identifiant d'un texte à un autre. Et un
 * identifiant resté dans un carnet après la suppression de sa carte ne gêne rien.
 */
describe('numéros de carte', () => {
  const fake = (patch: Partial<Ghost>): Ghost => ({ ...GHOSTS[0], id: 'x', name: 'Xxx', nameEn: 'Xxx', ...patch })
  const test = (text: string, card?: number, more: Partial<ConfirmationTest> = {}): ConfirmationTest => ({
    text,
    definitive: true,
    ...(card === undefined ? {} : { card }),
    ...more,
  })
  const A = 'Lance un chronomètre après l’encens : si une chasse commence avant 60 s, c’est cette entité.'
  const B = 'Pose un crucifix dans sa pièce : s’il brûle à plus de 4 m, c’est cette entité.'
  const C = 'Compte ses pas pendant une chasse : s’ils ne changent jamais de rythme, c’est cette entité.'
  const D = 'Allume une bougie près de toi : si la chasse commence quand même, c’est cette entité.'
  const idsOf = (g: Ghost, kind: 'test' | 'reverse', all: readonly Ghost[] = [g]) =>
    Object.fromEntries(ghostCards(g, 0, all).filter((c) => c.kind === kind).map((c) => [c.id, c.kind === 'test' ? c.back : c.quote]))

  it('sans numéro écrit, le rang dans la liste (comme avant les numéros)', () => {
    const items = [{ card: undefined, ok: true }, { ok: false }, { ok: true }, { ok: true }]
    expect([...cardNumbers(items, (t) => t.ok).values()]).toEqual([0, 1, 2])
  })

  it('le numéro écrit l’emporte sur le rang, et un élément sans numéro prend le premier numéro libre après le plus grand', () => {
    const items = [{ t: 'a', card: 4 }, { t: 'b' }, { t: 'c', card: 1 }, { t: 'd' }]
    const numbers = cardNumbers(items, () => true)
    expect(items.map((t) => numbers.get(t))).toEqual([4, 5, 1, 6])
    // un numéro écrit deux fois ne vaut que pour le premier ; un numéro invalide ne compte pas
    const twice = [{ card: 2 }, { card: 2 }, { card: -1 }, { card: 1.5 }]
    expect(twice.map((t) => cardNumbers(twice, () => true).get(t))).toEqual([2, 3, 4, 5])
  })

  it('un numéro écrit sur un élément qui ne donne plus de carte reste pris', () => {
    const items = [{ card: 0, ok: true }, { card: 7, ok: false }, { ok: true }]
    const numbers = cardNumbers(items, (t) => t.ok)
    expect(items.map((t) => numbers.get(t))).toEqual([0, undefined, 8])
  })

  it('supprimer un test ne déplace aucun identifiant : la carte suivante arrive sous son propre numéro', () => {
    const full = fake({ confirmationTests: [test(A, 0), test(B, 1), test(C, 2), test(D, 3)] })
    expect(idsOf(full, 'test')).toEqual({ 'g:x:test:0': A, 'g:x:test:1': B })
    // le premier test supprimé : l'identifiant du deuxième garde son texte, le troisième devient une carte
    const without = fake({ confirmationTests: [test(B, 1), test(C, 2), test(D, 3)] })
    expect(idsOf(without, 'test')).toEqual({ 'g:x:test:1': B, 'g:x:test:2': C })
    expect(zeroTests(without).map((t) => t.k)).toEqual([1, 2, 3])
  })

  it('rétrograder un test retire sa carte sans toucher aux autres, et son numéro ne resert pas', () => {
    const demoted = fake({
      confirmationTests: [test(A, 0, { definitive: false }), test(B, 1), test(C, 2), test('Un nouveau test : si la lumière saute, c’est cette entité.')],
    })
    expect(idsOf(demoted, 'test')).toEqual({ 'g:x:test:1': B, 'g:x:test:2': C })
    expect(zeroTests(demoted).map((t) => t.k)).toEqual([1, 2, 3])
    // même sans autre test numéroté, le numéro du test rétrogradé reste pris
    const alone = fake({ confirmationTests: [test(A, 5, { definitive: false }), test(B)] })
    expect(Object.keys(idsOf(alone, 'test'))).toEqual(['g:x:test:6'])
  })

  it('un test ajouté n’importe où dans la liste ne déplace aucun identifiant', () => {
    const added = fake({ confirmationTests: [test(D), test(A, 0), test(B, 1)] })
    expect(zeroTests(added)).toEqual([
      { text: D, k: 2 },
      { text: A, k: 0 },
      { text: B, k: 1 },
    ])
    // les deux premiers de la liste ont leur carte : A garde son identifiant, B ne perd pas le sien au profit d'un autre texte
    expect(idsOf(added, 'test')).toEqual({ 'g:x:test:2': D, 'g:x:test:0': A })
  })

  it('les signes à reconnaître gardent leur numéro quand un signe disparaît ou n’est plus « 0 preuve »', () => {
    const sign = (text: string, card?: number, zeroEvidence = true): TextItem => ({ text, zeroEvidence, ...(card === undefined ? {} : { card }) })
    const S0 = 'Souffle les bougies deux par deux.'
    const S1 = 'Laisse des traces de boue sur les tapis.'
    const S2 = 'Fait tinter les verres de la cuisine.'
    const empty = { keyTells: [], abilities: [], behaviors: [], observations: [], confirmationTests: [] }
    const full = fake({ ...empty, tells: [sign(S0, 0), sign(S1, 1), sign(S2, 2)] })
    expect(idsOf(full, 'reverse')).toEqual({ 'g:x:rev:0': S0, 'g:x:rev:1': S1 })
    const without = fake({ ...empty, tells: [sign(S1, 1), sign(S2, 2)] })
    expect(idsOf(without, 'reverse')).toEqual({ 'g:x:rev:1': S1, 'g:x:rev:2': S2 })
    const demoted = fake({ ...empty, tells: [sign(S0, 0, false), sign(S1, 1), sign('Renverse les chaises du salon.')] })
    expect(reverseTells(demoted, [demoted])).toEqual([
      { text: S1, k: 1 },
      { text: 'Renverse les chaises du salon.', k: 2 },
    ])
  })

  it('dans les fiches, chaque carte numérotée cite le texte qui porte ce numéro', () => {
    for (const g of GHOSTS) {
      for (const c of ghostCards(g, 0, GHOSTS)) {
        const n = Number(c.id.split(':').pop())
        if (c.kind === 'test') expect(g.confirmationTests.find((t) => t.card === n)?.text, c.id).toBe(c.back)
        if (c.kind === 'reverse') expect(g.tells.find((t) => t.card === n)?.zeroEvidence, c.id).toBe(true)
      }
    }
  })
})

describe('un identifiant de carte qui n’existe plus dans le paquet', () => {
  const DAY = 86_400_000
  const now = new Date(2026, 10, 17, 15, 0).getTime()
  const deck = buildDeck(GHOSTS, MECHANICS, [])
  const live = 'g:spirit:tells'
  /** un test retiré de la fiche depuis : sa progression est restée dans le carnet */
  const orphan = 'g:spirit:test:99'
  const learned = (due: number): CardState => ({ phase: 'review', step: 0, due, interval: 4, ease: 2.5, reps: 3, lapses: 0, last: now - 4 * DAY })
  const saved = (withOrphan: boolean): PersistedState =>
    hydrate({
      version: 1,
      onboarded: true,
      profile: { name: 'Léa', coachName: '', role: 'solo', createdAt: now - 10 * DAY },
      settings: { newPerDay: 12, focus: null, includeMechanics: true },
      cards: { [live]: learned(now + 2 * DAY), ...(withOrphan ? { [orphan]: learned(now - DAY) } : {}) },
      log: [
        { id: live, t: now - 4 * DAY, g: 3, isNew: true },
        ...(withOrphan
          ? [
              { id: orphan, t: now - 3 * DAY, g: 3, isNew: true },
              { id: orphan, t: now - DAY, g: 3, isNew: false },
              { id: orphan, t: now - 60_000, g: 1, isNew: false },
            ]
          : []),
      ],
      answers: {},
      activity: [],
      notes: [],
    })
  const state = saved(true)
  const clean = saved(false)

  it('le paquet ne le contient pas', () => {
    expect(deck.some((c) => c.id === orphan)).toBe(false)
    expect(deck.some((c) => c.id === live)).toBe(true)
  })

  it('reste dans le carnet, au chargement comme à l’export : rien n’est perdu si la carte revient', () => {
    expect(state.cards[orphan]).toEqual(learned(now - DAY))
    const copy = readBackup(JSON.parse(JSON.stringify(state)))
    expect(copy?.cards[orphan]).toEqual(learned(now - DAY))
    expect(copy?.log.filter((l) => l.id === orphan)).toHaveLength(3)
  })

  it('n’est jamais dû, ni posé, ni compté comme une carte vue ou apprise', () => {
    expect(dueCards(deck, state.cards, now)).toEqual(dueCards(deck, clean.cards, now))
    expect(dueCards(deck, state.cards, now + 30 * DAY).map((c) => c.id)).toEqual([live])
    const queue = buildReviewQueue(state, deck, now)
    expect(queue.length).toBeGreaterThan(0)
    expect(queue.every((c) => deck.includes(c))).toBe(true)
    expect(queue.map((c) => c.id)).toEqual(buildReviewQueue(clean, deck, now).map((c) => c.id))
    expect(unseenCards(deck, state.cards, state.settings)).toEqual(unseenCards(deck, clean.cards, clean.settings))
    expect(learnedCount(deck, state.cards)).toBe(learnedCount(deck, clean.cards))
    expect(studiedGhosts(deck, state.cards)).toEqual(['spirit'])
    expect(backupSummary(state).seen).toBe(1)
  })

  it('ne change ni la maîtrise d’une entité, ni les entités à travailler', () => {
    expect(ghostMastery('spirit', deck, state)).toBe(ghostMastery('spirit', deck, clean))
    const ids = GHOSTS.map((g) => g.id)
    const mastery = allGhostMastery(ids, deck, state)
    expect(mastery).toEqual(allGhostMastery(ids, deck, clean))
    expect(weakestGhosts(ids, mastery, deck, state)).toEqual(weakestGhosts(ids, mastery, deck, clean))
  })

  it('ses réponses restent au journal : les jours d’activité sont vrais, et ne comptent pas de nouvelle carte aujourd’hui', () => {
    expect(streak(state, now)).toBe(2)
    expect(streak(clean, now)).toBe(0)
    expect(newCardsIntroducedToday(state.log, now)).toBe(0)
  })

  it('sort de la file d’une séance reprise', () => {
    const run = {
      day: dayKey(now),
      since: now - 120_000,
      queue: [orphan, live],
      peers: [],
      known: [],
      done: 1,
      good: 0,
      passes: { [orphan]: 1 },
      total: 3,
      settled: 1,
      outcome: { cardId: orphan },
      revealed: false,
      previous: null,
    }
    const resumed = resumeSession<{ cardId: string }>(run, deck, state.log, now)
    expect(resumed?.queue.map((c) => c.id)).toEqual([live])
    // la correction gardée était celle de la carte disparue
    expect(resumed?.outcome).toBeNull()
  })
})
