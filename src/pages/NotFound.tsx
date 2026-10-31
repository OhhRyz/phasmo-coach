import { FileHead, Notebook, Page, TypedLink } from '../components/journal/Journal'

export function NotFound() {
  return (
    <div className="arrachee">
      <Notebook single>
        <Page section="1" label="Page introuvable">
          <FileHead>
            <span>
              Page <b>?</b>
            </span>
            <span>Introuvable</span>
          </FileHead>
          <h1 className="entry-date arrachee-title">
            <em>Il manque une page</em>
            Cette page a été arrachée du carnet
          </h1>
          <p className="lead">La page demandée n’existe pas (ou elle a été hantée).</p>
          <p className="arrachee-actions">
            <TypedLink to="/">Retour à l’accueil</TypedLink>
            <TypedLink to="/codex">ouvrir le codex</TypedLink>
          </p>
        </Page>
      </Notebook>
    </div>
  )
}
