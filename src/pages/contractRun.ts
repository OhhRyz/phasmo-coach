import { getGhost } from '../data'
import { EVIDENCE_IDS } from '../data/evidence'
import type { FilterState } from '../engine/filter'
import { DIFFICULTIES, type Scenario } from '../engine/scenario'
import { readRun } from './savedRun'

/**
 * Le contrat en cours de la mise en situation (voir savedRun) : un détour par le codex, un autre onglet ou un
 * rechargement ne le perd plus, la page propose « Reprendre le contrat » (même onglet, même journée).
 */
export const CONTRACT_KEY = 'phasmo-coach/contrat'

/** « Reprendre le contrat » depuis une autre page (enveloppe des exercices, accueil) : il reprend aussitôt. */
export const RESUME_CONTRACT = '/enquete?contrat=reprendre'

export interface SavedContract {
  scenario: Scenario
  /** rapports dévoilés, le contexte (rapport 00) compris */
  revealed: number
  filter: FilterState
  /** entités barrées à la main dans « Encore possibles » */
  struck: string[]
  /** fausses pistes déjà désignées */
  wrong: string[]
}

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Un contrat relu tel quel : entité connue, rapports lisibles, carnet de preuves cohérent. */
export function validContract(c: SavedContract): boolean {
  const s = c?.scenario
  if (!s || typeof s !== 'object' || !getGhost(s.ghostId) || !DIFFICULTIES.some((d) => d.id === s.difficulty)) return false
  if (!Array.isArray(s.clues) || s.clues.length < 2 || !s.clues.every((k) => k && typeof k.id === 'string' && typeof k.text === 'string' && typeof k.time === 'string'))
    return false
  if (typeof s.map !== 'string' || typeof s.room !== 'string' || !Array.isArray(s.visibleEvidence) || ![0, 1, 2, 3].includes(s.evidenceCount)) return false
  if (!Number.isInteger(c.revealed) || c.revealed < 2 || c.revealed > s.clues.length) return false
  const f = c.filter
  if (!f || typeof f !== 'object' || !f.evidence || typeof f.evidence !== 'object' || !Array.isArray(f.speed)) return false
  if (Object.keys(f.evidence).some((id) => !(EVIDENCE_IDS as readonly string[]).includes(id))) return false
  // deux erreurs terminent le contrat : il n'en reste jamais deux dans un contrat en cours
  return strings(c.struck) && strings(c.wrong) && c.wrong.length < 2 && c.wrong.every((id) => !!getGhost(id))
}

export function readContract(now = Date.now()): SavedContract | null {
  return readRun<SavedContract>(CONTRACT_KEY, validContract, now)
}
