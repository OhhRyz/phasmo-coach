import type { Profile } from '../store/schema'
import type { CoachNote } from './cards'

/**
 * Le nom du coach vu depuis cet appareil : le sien si c'est le carnet du coach, celui que la personne
 * coachée a renseigné, et aucun pour qui s'entraîne seul·e.
 */
export function coachNameOf(profile: Profile): string {
  if (profile.role === 'solo') return ''
  return (profile.role === 'coach' ? profile.name : profile.coachName)?.trim() ?? ''
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr')

/**
 * Le profil après avoir reçu des notes signées `from` (lien ou fichier) : qui s'entraînait seul·e, ou
 * était coaché·e sans avoir noté par qui, reconnaît l'expéditeur comme son coach. Ses propres notes
 * (même prénom) ou un envoi sans nom ne changent rien ; le carnet d'un coach non plus.
 */
export function adoptCoach(profile: Profile, from: string | undefined): Profile {
  const sender = from?.trim().slice(0, 80) ?? ''
  if (!sender || same(sender, profile.name)) return profile
  if (profile.role === 'solo') return { ...profile, role: 'student', coachName: sender }
  if (profile.role === 'student' && !profile.coachName.trim()) return { ...profile, coachName: sender }
  return profile
}

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
