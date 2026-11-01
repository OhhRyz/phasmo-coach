import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/**
 * Le code QR d'un lien, dessiné à l'encre en SVG (aucune image, aucun logo, rien ne part sur le réseau) :
 * sur ordinateur, la page « Installer l'app » le montre pour ouvrir le carnet sur le téléphone.
 */

/** La marge blanche autour du code, en modules : les lecteurs en demandent quatre. */
export const QR_QUIET = 4

/** Les modules du code (true = encre), ligne par ligne. Correction d'erreurs M : il se lit même un peu froissé. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/**
 * Le tracé SVG des modules encrés, marge comprise (un carré de `côté + 2 × QR_QUIET` unités) : une suite de
 * traits horizontaux, un par série de modules encrés d'une ligne.
 */
export function qrPath(modules: boolean[][]): string {
  const out: string[] = []
  modules.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      if (!row[c]) {
        c++
        continue
      }
      const start = c
      while (c < row.length && row[c]) c++
      out.push(`M${start + QR_QUIET} ${r + QR_QUIET}h${c - start}v1h-${c - start}z`)
    }
  })
  return out.join('')
}

export function QrCode({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const { d, size } = useMemo(() => {
    const m = qrModules(text)
    return { d: qrPath(m), size: m.length + 2 * QR_QUIET }
  }, [text])
  return (
    <svg className={`qr ${className}`} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} className="qr-paper" />
      <path d={d} fill="currentColor" />
    </svg>
  )
}

export default QrCode
