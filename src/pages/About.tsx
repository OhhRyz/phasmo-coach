import { useState, type CSSProperties, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileHead, H, Notebook, Page, Stamp, TypedLink } from '../components/journal/Journal'
import { Modal } from '../components/ui'
import { DATA_INFO } from '../data'
import { SOURCE_REPO_URL, UPSTREAM_REPO_URL } from '../config'
import { fr, NNBSP } from '../engine/format'

type Style = CSSProperties & Record<`--${string}`, string | number>

/* Les intervalles de la répétition espacée, tracés au crayon : chaque saut est plus long que le précédent. */
const STEPS = [0, 1, 3, 8, 20]
const X = (d: number) => 18 + Math.sqrt(d / 20) * 404

function Intervals() {
  const base = 78
  return (
    <figure className="intervals">
      <svg className="draw" viewBox="0 0 440 112" role="img" aria-label="Une carte revient après 1 jour, puis 3, 8 et 20 jours.">
        <path className="iv-axis" d={`M8 ${base} L432 ${base}`} pathLength={1} style={{ '--d': '.2s', '--dur': '.6s' } as Style} />
        {STEPS.slice(1).map((d, i) => {
          const x1 = X(STEPS[i])
          const x2 = X(d)
          const h = 16 + (x2 - x1) * 0.42
          return (
            <path
              key={d}
              className="iv-hop"
              d={`M${x1 + 3} ${base - 4} Q${(x1 + x2) / 2} ${base - h * 1.5} ${x2 - 3} ${base - 4}`}
              pathLength={1}
              style={{ '--d': `${0.6 + i * 0.35}s`, '--dur': '.5s' } as Style}
            />
          )
        })}
        {STEPS.map((d) => (
          <g key={d}>
            <path className="iv-tick" d={`M${X(d)} ${base - 5} L${X(d)} ${base + 5}`} />
            <text className="iv-lbl" x={X(d)} y={base + 24} textAnchor="middle">
              {d === 0 ? 'jour 0' : `+${d} j`}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="pencil-note">une carte réussie revient de plus en plus tard</figcaption>
    </figure>
  )
}

/** Les cinq polices livrées avec l'app, et le texte de leur licence (copié dans public/licences). */
const FONTS = [
  { name: 'IM Fell English', by: 'Igino Marini', licence: 'SIL Open Font License 1.1', file: 'LICENSE-IMFellEnglish.txt', use: 'titres et noms' },
  { name: 'Libre Caslon Text', by: 'Pablo Impallari et Rodrigo Fuenzalida', licence: 'SIL Open Font License 1.1', file: 'LICENSE-LibreCaslonText.txt', use: 'texte des fiches' },
  { name: 'Special Elite', by: 'Astigmatic (Brian J. Bonislawsky)', licence: 'Apache 2.0', file: 'LICENSE-SpecialElite.txt', use: 'en-têtes tapés' },
  { name: 'Courier Prime', by: 'Alan Dague-Greene (Quote-Unquote Apps)', licence: 'SIL Open Font License 1.1', file: 'LICENSE-CourierPrime.txt', use: 'données et compteurs' },
  { name: 'Caveat', by: 'Pablo Impallari (Impallari Type)', licence: 'SIL Open Font License 1.1', file: 'LICENSE-Caveat.txt', use: 'écriture à la main' },
]

/**
 * Le texte d'une licence, lu dans une fenêtre : une fois l'app installée, son service worker renverrait
 * l'app à la place d'un fichier ouvert comme une page.
 */
function useLicence() {
  const [open, setOpen] = useState<(typeof FONTS)[number] | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const show = (font: (typeof FONTS)[number]) => (e: MouseEvent) => {
    e.preventDefault()
    setOpen(font)
    setText(null)
    setFailed(false)
    fetch(`./licences/${font.file}`)
      .then((r) => (r.ok && !(r.headers.get('content-type') ?? '').includes('html') ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(setText)
      .catch(() => setFailed(true))
  }
  const modal = (
    <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Licence\u202f: ${open.name}` : 'Licence'} actions={<TypedLink onClick={() => setOpen(null)}>Fermer</TypedLink>}>
      {failed ? (
        <p className="modal-text">
          {fr(`Le texte n’a pas pu être chargé (hors ligne ?). Il est aussi dans le code source, dossier public/licences : ${open?.file ?? ''}.`)}
        </p>
      ) : (
        <pre className="licence-text" tabIndex={0} aria-label={open ? `Texte de la licence de ${open.name}` : undefined}>
          {text ?? 'Chargement…'}
        </pre>
      )}
    </Modal>
  )
  return { show, modal }
}

export function About() {
  const licence = useLicence()
  return (
    <>
    <Notebook className="apropos">
      {/* ===================== page de gauche : le fonctionnement ===================== */}
      <Page side="left" section="1" label="Comment l’app retient ce que tu sais">
        <FileHead>
          <span>À propos</span>
          <span>
            Phasmo <b>Coach</b>
          </span>
        </FileHead>

        <div className="entry">
          <h1 className="entry-date">
            <em>À propos de ce carnet</em>
            Sources et fonctionnement
          </h1>
        </div>

        <section aria-labelledby="h-memo">
          <H id="h-memo">Comment l’app retient ce que tu sais</H>
          <p className="prose drop">
            {fr(
              'Chaque fiche est découpée en cartes : signes clés, seuil de chasse, vitesse, tests sans preuve, signes à reconnaître ; s’y ajoutent les faits de mécaniques. Les preuves, elles, restent sur les fiches et dans le carnet de preuves : le journal du jeu les donne, inutile de les apprendre par cœur. Chaque carte est un QCM : tu touches la réponse que tu crois juste (ou « Je ne sais pas »), et la correction s’affiche aussitôt. Juste, la carte revient plus tard : le lendemain, puis 3, 8, 20 jours plus tard… Faux, elle revient vite : quelques cartes plus loin dans la même séance, souvent posée autrement (dans l’autre sens, ou avec d’autres choix), puis sur un intervalle plus court. Une note sans mauvaises réponses se retourne simplement, et tu dis toi-même si tu savais. C’est la répétition espacée : on révise juste avant d’oublier, ce qui fixe la mémoire avec un minimum de temps.',
            )}
          </p>
          <Intervals />
          <p className="prose">
            {fr(
              'Une erreur au quiz peut ramener dans la révision du jour la carte correspondante, si tu l’avais déjà apprise. Les notes du carnet ajoutées à la révision (avec un texte ou une réponse) deviennent elles aussi des cartes : un conseil donné une fois revient de lui-même au bon moment.',
            )}
          </p>
          <p className="prose">
            Tout est enregistré dans le navigateur de cet appareil (aucun compte, aucun serveur). Pour changer d’appareil, exporte une
            sauvegarde depuis le <Link to="/profil">profil</Link>{NNBSP}; pour partager des notes ou un bilan, tout se passe dans la page{' '}
            <Link to="/coaching">Coaching</Link>.
          </p>
        </section>

        <section aria-labelledby="h-install">
          <H id="h-install">Installer le carnet</H>
          <p className="prose">
            {fr(
              'Installé sur l’écran d’accueil, le carnet s’ouvre comme une app et marche hors ligne. Dans un simple onglet, le navigateur peut effacer ce qu’il contient : sur iPhone, Safari le fait après 7 jours sans visite.',
            )}
          </p>
          <dl className="install">
            <div>
              <dt>iPhone</dt>
              <dd>
                {fr(
                  'Ouvre le carnet dans Safari, touche le bouton Partager, puis « Sur l’écran d’accueil ». L’app installée a sa propre mémoire, séparée de Safari : un lien reçu s’ouvre dans Safari, copie-le et colle-le dans l’app, page « Coaching » (le lien en bas de chaque page).',
                )}
              </dd>
            </div>
            <div>
              <dt>Android</dt>
              <dd>{fr('Dans Chrome, ouvre le menu (les trois points), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».')}</dd>
            </div>
          </dl>
        </section>
      </Page>

      {/* ===================== page de droite : sources et licence ===================== */}
      <Page side="right" section="1" label="Sources et licence">
        <FileHead>
          <span>Sources et licence</span>
          <span>{DATA_INFO.ghostCount} entités</span>
        </FileHead>

        <section aria-labelledby="h-src">
          <H id="h-src">Sources des données</H>
          <p className="prose">
            Les fiches des {DATA_INFO.ghostCount} entités sont dérivées de l’
            <a href={UPSTREAM_REPO_URL} target="_blank" rel="noreferrer">
              Unofficial Phasmo Cheat Sheet
            </a>{' '}
            de Ty Bayn (Zero-Network), publié sous licence GNU AGPL v3{NNBSP}: données de sauvegarde du projet et textes de son wiki,
            traduits et complétés pour les entités récentes, puis vérifiés point par point. {DATA_INFO.gameVersionNote}.
          </p>
          <p className="prose">
            {fr(
              'Le jeu évolue : si un détail ne correspond plus à ce que tu vois en partie, c’est le jeu qui a raison. Les points à confirmer sont signalés en bas de chaque fiche.',
            )}
          </p>
        </section>

        <section aria-labelledby="h-lic">
          <H id="h-lic" count="GNU AGPL v3">
            Licence
          </H>
          <p className="prose">
            Phasmo Coach est un logiciel libre sous licence GNU AGPL v3, comme le projet dont il dérive. Le code source est disponible
            ici{NNBSP}:{' '}
            <a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer" className="src-url">
              {SOURCE_REPO_URL.replace('https://', '')}
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="h-fonts">
          <H id="h-fonts" count="5 polices">
            Polices
          </H>
          <p className="prose">Les polices sont livrées avec l’app, sous leur propre licence libre.</p>
          <ul className="fonts">
            {FONTS.map((f) => (
              <li key={f.file}>
                <span className="fonts-name">{f.name}</span>
                <span className="fonts-by">
                  de {f.by}, {f.use}
                </span>
                <a className="fonts-lic" href={`./licences/${f.file}`} onClick={licence.show(f)}>
                  {f.licence}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <aside className="mention" aria-label="Mention légale">
          <Stamp tone="ink" small rotate={-4}>
            Projet de fan
          </Stamp>
          <p>
            {fr(
              'Phasmophobia, son logo et les informations du jeu appartiennent à Kinetic Games Limited. Ce projet de fan, à but éducatif, n’est ni créé ni approuvé par Kinetic Games. Aucune image ni aucun son du jeu n’est utilisé : les bruits de pas sont synthétisés par l’app.',
            )}
          </p>
        </aside>
      </Page>
    </Notebook>
    {licence.modal}
    </>
  )
}
