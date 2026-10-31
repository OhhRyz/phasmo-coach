import type { Profile } from '../store/schema'
import type { CoachNote } from './cards'

/**
 * Le nom du coach vu depuis cet appareil : le sien si c'est le carnet du coach, sinon celui que
 * l'élève a renseigné.
 */
export function coachNameOf(profile: Profile): string {
  return (profile.role === 'coach' ? profile.name : profile.coachName)?.trim() ?? ''
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr')

/**
 * Une note écrite par le coach ? Seules ces notes s'affichent au stylo rouge et sous « Mots de … » :
 * l'app ne met jamais de mots dans la bouche du coach.
 */
export function isCoachNote(note: CoachNote, profile: Profile): boolean {
  const coach = coachNameOf(profile)
  return !!coach && !!note.author && same(note.author, coach)
}

/** Une note écrite sur cet appareil par la personne qui tient le carnet. */
export function isOwnNote(note: CoachNote, profile: Profile): boolean {
  return !!profile.name && !!note.author && same(note.author, profile.name)
}

/** Ordre unique pour toute l'app : épinglées d'abord, puis les plus récentes. */
export function sortNotes(notes: CoachNote[]): CoachNote[] {
  return [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
}

/** Les notes du coach, dans l'ordre de l'app, éventuellement limitées à une entité. */
export function coachNotes(notes: CoachNote[], profile: Profile, ghostId?: string): CoachNote[] {
  return sortNotes(notes.filter((n) => isCoachNote(n, profile) && (ghostId == null || n.ghostId === ghostId)))
}

/** Une note qui deviendra vraiment une carte : il faut un texte ou une réponse au dos. */
export function makesCard(note: Pick<CoachNote, 'asCard' | 'body' | 'answer'>): boolean {
  return note.asCard && !!(note.body?.trim() || note.answer?.trim())
}
