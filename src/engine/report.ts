import { SOURCE_REPO_URL } from '../config'
import { fr } from './format'

/** La partie de la fiche quand on ne sait pas laquelle choisir (ou que l'erreur touche toute la fiche). */
export const WHOLE_FICHE = 'Toute la fiche'

/** Ce qu'une personne signale sur une fiche, depuis la fenêtre « Signaler une erreur ». */
export interface FicheReport {
  /** le nom de l'entité de la fiche */
  fiche: string
  /** la partie de la fiche concernée (« Sans preuve », « Ne pas confondre »…) */
  part: string
  /** ce qui est faux ou pas clair, tel que la personne l'a écrit */
  what: string
  /** sa source (vidéo, patch, test en partie), facultative */
  source: string
  /** l'adresse de la fiche dans l'app */
  url: string
}

/**
 * Le signalement en texte brut, prêt à coller dans un message Discord à la personne qui s'occupe de l'app.
 * Les intitulés reçoivent la typographie française ; le texte de la personne reste tel qu'elle l'a écrit.
 */
export function reportText(r: FicheReport): string {
  const what = r.what.trim()
  const source = r.source.trim()
  return [
    fr('Signalement Phasmo Coach'),
    `${fr('Fiche :')} ${r.fiche}`,
    `${fr('Partie :')} ${r.part || WHOLE_FICHE}`,
    fr('Ce qui est faux ou pas clair :'),
    what,
    `${fr('Source :')} ${source || 'non précisée'}`,
    `${fr('Lien :')} ${r.url}`,
  ].join('\n')
}

/** Le titre de la demande sur GitHub : « Fiche Hantu : Sans preuve » (ou « Fiche Hantu » pour toute la fiche). */
export function reportTitle(r: Pick<FicheReport, 'fiche' | 'part'>): string {
  return !r.part || r.part === WHOLE_FICHE ? `Fiche ${r.fiche}` : fr(`Fiche ${r.fiche} : ${r.part}`)
}

/** Une nouvelle demande sur le dépôt du projet (jamais celui d'origine des données), titrée et déjà remplie. */
export function reportIssueUrl(r: FicheReport): string {
  return `${SOURCE_REPO_URL}/issues/new?title=${encodeURIComponent(reportTitle(r))}&body=${encodeURIComponent(reportText(r))}`
}
