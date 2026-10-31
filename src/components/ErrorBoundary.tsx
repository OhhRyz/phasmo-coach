import { Component, type ReactNode } from 'react'
import { FileHead, Notebook, Page } from './journal/Journal'

/**
 * Filet de sécurité : si un écran plante (lien de partage abîmé, donnée inattendue), on affiche une
 * page du carnet au lieu d'un écran blanc. Le reste de l'app et les données restent intacts.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Notebook single>
        <Page side="left">
          <FileHead>
            <span>Page illisible</span>
          </FileHead>
          <h1 className="h">
            <span>Cette page n’a pas pu s’afficher</span>
          </h1>
          <p className="prose">
            Ton carnet n’a rien perdu : seule cette page pose problème. Si elle vient d’un lien reçu, demande à le renvoyer.
          </p>
          <p>
            <a className="link" href="#/">
              Retour à l’accueil
            </a>
          </p>
        </Page>
      </Notebook>
    )
  }
}
