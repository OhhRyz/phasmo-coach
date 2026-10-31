import { PageHead } from '../components/ui'
import { DATA_INFO } from '../data'
import { SOURCE_REPO_URL, UPSTREAM_REPO_URL } from '../config'

export function About() {
  return (
    <div className="page narrow">
      <PageHead title="À propos" />
      <div className="stack" style={{ '--gap': '36px' } as React.CSSProperties}>
        <section className="stack about">
          <h2>Comment l’app retient ce que tu sais</h2>
          <p className="muted">
            Chaque fiche est découpée en cartes (preuves, seuil de chasse, vitesse, signes clés, tests 0 preuve…). Après chaque
            carte, tu indiques si c’était facile ou non : la carte revient alors dans 1 jour, puis 3, 8, 20 jours… et plus tôt
            si tu l’as oubliée. C’est la répétition espacée : on révise juste avant d’oublier, ce qui fixe la mémoire avec un
            minimum de temps. Les erreurs en quiz ou en enquête refont passer la carte correspondante en révision.
          </p>
          <p className="muted">
            Les notes du coach deviennent elles aussi des cartes : un conseil donné une fois revient de lui-même au bon
            moment.
          </p>
          <p className="muted">
            Tout est enregistré dans le navigateur de cet appareil (aucun compte, aucun serveur). Pour changer d’appareil ou
            partager, utilise l’export ou les liens de partage du profil et du carnet.
          </p>
        </section>
        <section className="stack about">
          <h2>Sources des données</h2>
          <p className="muted">
            Les fiches des {DATA_INFO.ghostCount} entités sont dérivées de l’<a href={UPSTREAM_REPO_URL} target="_blank" rel="noreferrer">Unofficial Phasmo Cheat Sheet</a>{' '}
            de Ty Bayn (Zero-Network), publié sous licence GNU AGPL v3 : données de sauvegarde du projet et textes de son wiki,
            traduits et complétés pour les entités récentes, puis vérifiés point par point. {DATA_INFO.gameVersionNote}.
          </p>
          <p className="muted">
            Le jeu évolue : si un détail ne correspond plus à ce que tu vois en partie, c’est le jeu qui a raison. Les points à
            confirmer sont signalés en bas de chaque fiche.
          </p>
        </section>
        <section className="stack about">
          <h2>Licence</h2>
          <p className="muted">
            Phasmo Coach est un logiciel libre sous licence GNU AGPL v3, comme le projet dont il dérive. Le code source est
            disponible ici : <a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer">{SOURCE_REPO_URL.replace('https://', '')}</a>.
          </p>
          <p className="muted">
            Phasmophobia, son logo et les informations du jeu appartiennent à Kinetic Games Limited. Ce projet de fan, à but
            éducatif, n’est ni créé ni approuvé par Kinetic Games. Aucune image ni aucun son du jeu n’est utilisé : les bruits de pas
            sont synthétisés par l’app.
          </p>
        </section>
      </div>
    </div>
  )
}
