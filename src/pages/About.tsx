import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { FileHead, H, Notebook, Page, Stamp } from '../components/journal/Journal'
import { DATA_INFO } from '../data'
import { SOURCE_REPO_URL, UPSTREAM_REPO_URL } from '../config'

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

export function About() {
  return (
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
            Mode d’emploi
          </h1>
        </div>

        <section aria-labelledby="h-memo">
          <H id="h-memo">Comment l’app retient ce que tu sais</H>
          <p className="prose drop">
            Chaque fiche est découpée en cartes (preuves, seuil de chasse, vitesse, signes clés, tests 0 preuve…). Après chaque carte, tu
            indiques si c’était facile ou non : la carte revient alors dans 1 jour, puis 3, 8, 20 jours… et plus tôt si tu l’as oubliée.
            C’est la répétition espacée : on révise juste avant d’oublier, ce qui fixe la mémoire avec un minimum de temps. Les erreurs en
            quiz ou en enquête refont passer la carte correspondante en révision.
          </p>
          <Intervals />
          <p className="prose">
            Les notes du coach deviennent elles aussi des cartes : un conseil donné une fois revient de lui-même au bon moment.
          </p>
          <p className="prose">
            Tout est enregistré dans le navigateur de cet appareil (aucun compte, aucun serveur). Pour changer d’appareil ou partager,
            utilise l’export ou les liens de partage du <Link to="/profil">profil</Link> et du <Link to="/carnet">carnet</Link>.
          </p>
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
            de Ty Bayn (Zero-Network), publié sous licence GNU AGPL v3 : données de sauvegarde du projet et textes de son wiki, traduits et
            complétés pour les entités récentes, puis vérifiés point par point. {DATA_INFO.gameVersionNote}.
          </p>
          <p className="prose">
            Le jeu évolue : si un détail ne correspond plus à ce que tu vois en partie, c’est le jeu qui a raison. Les points à confirmer
            sont signalés en bas de chaque fiche.
          </p>
        </section>

        <section aria-labelledby="h-lic">
          <H id="h-lic" count="GNU AGPL v3">
            Licence
          </H>
          <p className="prose">
            Phasmo Coach est un logiciel libre sous licence GNU AGPL v3, comme le projet dont il dérive. Le code source est disponible ici :{' '}
            <a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer" className="src-url">
              {SOURCE_REPO_URL.replace('https://', '')}
            </a>
            .
          </p>
        </section>

        <aside className="mention" aria-label="Mention légale">
          <Stamp tone="ink" small rotate={-4}>
            Projet de fan
          </Stamp>
          <p>
            Phasmophobia, son logo et les informations du jeu appartiennent à Kinetic Games Limited. Ce projet de fan, à but éducatif, n’est
            ni créé ni approuvé par Kinetic Games. Aucune image ni aucun son du jeu n’est utilisé : les bruits de pas sont synthétisés par
            l’app.
          </p>
        </aside>
      </Page>
    </Notebook>
  )
}
