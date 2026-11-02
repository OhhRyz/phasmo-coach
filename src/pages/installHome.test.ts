import { describe, expect, it } from 'vitest'
import { GHOSTS } from '../data'
import { NNBSP } from '../engine/format'
import { currentTab, LIGHT_LABEL, lightState, pageTitle } from '../components/Layout'
import { ACQUIRED, acquiredLine, notebookStats, registryCounts } from '../components/Registry'
import { QR_QUIET, qrModules, qrPath } from '../components/QrCode'
import { CHOICES, discordMessage, guideFor } from './installGuide'
import { IOS_FRESH_START } from './Home'

const URL = 'https://phasmo-coach.example/#/installer'

describe('Installer l’app depuis un ordinateur : un message prêt pour Discord', () => {
  const msg = discordMessage(URL)
  const lines = msg.split('\n')

  it('le lien, puis une ligne pour iPhone et une pour Android', () => {
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(`Phasmo Coach${NNBSP}: ${URL}`)
    expect(lines[1]).toMatch(/^Sur iPhone/)
    expect(lines[1]).toContain('Safari')
    expect(lines[2]).toMatch(/^Sur Android/)
    expect(lines[2]).toContain('Chrome')
  })

  // les libellés entre « » de chaque ligne, tels qu'ils s'affichent dans les menus du téléphone
  const quoted = (l: string) => [...l.matchAll(/«[\s\u202f\u00a0]*([^«»]+?)[\s\u202f\u00a0]*»/gu)].map((m) => m[1])
  const stepLabels = (choice: 'iphone' | 'android') => guideFor(CHOICES[choice]).steps.flatMap((st) => quoted(st.text))

  it('donne les étapes avec les libellés exacts des menus, pas « le même bouton »', () => {
    for (const l of lines) expect(l).not.toMatch(/même bouton/)
    // iPhone : Partager dans Safari, puis « Sur l’écran d’accueil », comme dans les étapes de la page
    expect(lines[1]).toContain('Partager')
    expect(quoted(lines[1])).toContain('Sur l’écran d’accueil')
    expect(stepLabels('iphone')).toContain('Sur l’écran d’accueil')
    // Android : le menu de Chrome, puis « Ajouter à l’écran d’accueil » ou « Installer »
    expect(lines[2]).toContain('menu')
    expect(quoted(lines[2])).toEqual(expect.arrayContaining(['Ajouter à l’écran d’accueil', 'Installer']))
    for (const label of quoted(lines[2])) expect(stepLabels('android')).toContain(label)
    for (const label of quoted(lines[1]).filter((q) => q !== '…')) expect(stepLabels('iphone').concat('Partager')).toContain(label)
  })

  it('typographie française : espace fine avant les deux-points, le lien reste intact', () => {
    for (const l of lines) expect(l).not.toMatch(/ [:;?!»]/)
    expect(lines[0].endsWith(URL)).toBe(true)
  })
})

describe('Installer l’app depuis un ordinateur : le code QR de la page', () => {
  const m = qrModules(URL)
  const n = m.length

  it('un carré de modules d’une version valable (21 + 4 par version)', () => {
    expect(n).toBeGreaterThanOrEqual(21)
    expect((n - 17) % 4).toBe(0)
    for (const row of m) expect(row).toHaveLength(n)
  })

  it('les trois repères de coin sont là : un carré plein de 3 dans un anneau de 7', () => {
    const finder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const ring = r === 0 || r === 6 || c === 0 || c === 6
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
          expect(m[r0 + r][c0 + c], `${r0 + r},${c0 + c}`).toBe(ring || core)
        }
    }
    finder(0, 0)
    finder(0, n - 7)
    finder(n - 7, 0)
  })

  it('le tracé garde la marge blanche de quatre modules et dessine chaque module encré une fois', () => {
    const d = qrPath(m)
    let inked = 0
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
      const [cx, cy, cw] = [Number(x), Number(y), Number(w)]
      expect(cx).toBeGreaterThanOrEqual(QR_QUIET)
      expect(cy).toBeGreaterThanOrEqual(QR_QUIET)
      expect(cx + cw).toBeLessThanOrEqual(n + QR_QUIET)
      expect(cy).toBeLessThan(n + QR_QUIET)
      for (let k = 0; k < cw; k++) expect(m[cy - QR_QUIET][cx - QR_QUIET + k]).toBe(true)
      inked += cw
    }
    expect(inked).toBe(m.flat().filter(Boolean).length)
  })

  it('le même lien donne toujours le même code', () => {
    expect(qrPath(qrModules(URL))).toBe(qrPath(m))
    expect(qrPath(qrModules(`${URL}x`))).not.toBe(qrPath(m))
  })
})

describe('Premier lancement : installer l’app sans pression', () => {
  it('maintenant ou plus tard, la progression suit par copier-coller', () => {
    expect(IOS_FRESH_START).not.toMatch(/avant de commencer|page blanche/)
    expect(IOS_FRESH_START).toContain('maintenant ou plus tard')
    expect(IOS_FRESH_START).toContain('copier-coller')
  })
})

describe('Onglets : un seul allumé, même après un retour en arrière', () => {
  it('chaque page allume au plus un onglet', () => {
    const cases: [string, ReturnType<typeof currentTab>][] = [
      ['/', 'home'],
      ['', 'home'],
      ['/revision', 'review'],
      ['/codex', 'codex'],
      ['/codex/demon', 'codex'],
      ['/entrainement', 'train'],
      ['/quiz', 'train'],
      ['/enquete', 'train'],
      ['/oreille', 'train'],
      ['/mecaniques', 'mechanics'],
      ['/carnet', 'notes'],
      ['/carnet/', 'notes'],
      ['/profil', null],
      ['/progression', null],
      ['/coaching', null],
      ['/installer', null],
      ['/a-propos', null],
      ['/codexx', null],
      ['/inconnue', null],
    ]
    for (const [path, tab] of cases) expect(currentTab(path), path).toBe(tab)
  })
})

describe('Interrupteur « Lumière » : un nom et un état explicites', () => {
  it('le nom accessible commence par le mot affiché, l’état se lit en toutes lettres', () => {
    expect(LIGHT_LABEL.startsWith('Lumière')).toBe(true)
    expect(lightState(false)).toBe('allumée')
    expect(lightState(true)).toBe('éteinte')
  })
})

describe('Ma progression : une seule page, les chiffres déjà montrés ailleurs', () => {
  it('a son titre d’onglet', () => {
    expect(pageTitle('/progression')).toBe('Ma progression · Phasmo Coach')
  })

  it('le bilan du registre : acquises, en cours, pas encore travaillées (le total y est)', () => {
    const ids = GHOSTS.map((g) => g.id)
    const mastery: Record<string, number> = { [ids[0]]: ACQUIRED, [ids[1]]: 0.84, [ids[2]]: 0.2, [ids[3]]: 1 }
    const c = registryCounts(mastery)
    expect(c).toEqual({ acquired: 2, inProgress: 2, untouched: GHOSTS.length - 4 })
    expect(c.acquired + c.inProgress + c.untouched).toBe(GHOSTS.length)
    expect(registryCounts({})).toEqual({ acquired: 0, inProgress: 0, untouched: GHOSTS.length })
  })

  it('le compteur du titre s’accorde', () => {
    expect(acquiredLine(0, 30)).toBe('aucune acquise sur 30')
    expect(acquiredLine(1, 30)).toBe('1 acquise sur 30')
    expect(acquiredLine(3, 30)).toBe('3 acquises sur 30')
  })

  it('les chiffres de la carte d’enquête du profil : questions vues, révisions, jours', () => {
    const now = Date.UTC(2026, 10, 1, 12)
    const state = {
      cards: { a: { due: 0 }, c: { due: 0 }, z: { due: 0 } } as never,
      log: [{ id: 'a', t: now, g: 3 as const, isNew: true }, { id: 'a', t: now, g: 1 as const, isNew: false }],
      profile: { name: 'Léa', coachName: '', role: 'solo' as const, createdAt: now - 3 * 86_400_000 },
    }
    expect(notebookStats(state, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], now)).toEqual({ seen: 2, reviews: 2, days: 3 })
  })
})
