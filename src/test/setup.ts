import { beforeEach } from 'vitest'

// Les tests du moteur sont synchrones et longs : sans une pause entre deux, le fichier entier (plus d'une
// minute) ne rend jamais la main, et les messages du lanceur de tests attendent jusqu'à leur délai d'expiration.
beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
