// Icône « carnet d'enquête » : couverture kraft, élastique, bande Dymo rouge.
// Usage : node scripts/make-icons.cjs  (Playwright requis ; écrit les PNG dans public/)
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const FONT = path.join(__dirname, '../src/assets/fonts/special-elite-latin-400-normal.woff2')
const OUT = process.argv[2] || path.join(__dirname, '../public')
const fontData = fs.readFileSync(FONT).toString('base64')

// scale: 1 = contenu normal ; pour maskable on réduit le carnet dans la zone sûre (cercle 80 %)
function svg({ size, safe = 1, text = true }) {
  const s = 512
  const k = safe
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="desk" cx="38%" cy="30%" r="85%">
      <stop offset="0" stop-color="#4a5c51"/><stop offset=".55" stop-color="#33413a"/><stop offset="1" stop-color="#1f2924"/>
    </radialGradient>
    <linearGradient id="kraft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d0a877"/><stop offset=".6" stop-color="#c29a6b"/><stop offset="1" stop-color="#a98152"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 .25  0 0 0 0 .17  0 0 0 0 .08  0 0 0 .22 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".45"/>
    </filter>
    <filter id="tapeShadow" x="-10%" y="-30%" width="120%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".35"/>
    </filter>
    <linearGradient id="relief" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/>
    </linearGradient>
    <style>@font-face{font-family:Elite;src:url(data:font/woff2;base64,${fontData}) format('woff2');}</style>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#desk)"/>
  <g transform="translate(256 262) scale(${k}) rotate(-5) translate(-256 -262)">
    <g filter="url(#shadow)">
      <!-- pages visibles sur la tranche -->
      <rect x="138" y="84" width="252" height="344" rx="16" fill="#efe6d2"/>
      <rect x="132" y="80" width="252" height="344" rx="16" fill="#f6efdf"/>
      <!-- couverture kraft -->
      <rect x="124" y="74" width="252" height="344" rx="16" fill="url(#kraft)"/>
      <rect x="124" y="74" width="252" height="344" rx="16" fill="#000" filter="url(#grain)"/>
      <!-- dos du carnet -->
      <rect x="124" y="74" width="26" height="344" rx="12" fill="#8e6a40" opacity=".55"/>
    </g>
    <!-- élastique -->
    <rect x="322" y="68" width="16" height="356" rx="4" fill="#232a26"/>
    <rect x="325" y="68" width="3" height="356" fill="#3a443e"/>
    <!-- bande Dymo rouge -->
    <g filter="url(#tapeShadow)" transform="rotate(-3 250 250)">
      <path d="M96 206 H404 L398 246 L404 286 H96 L102 246 Z" fill="#b3241a"/>
      <path d="M96 206 H404 L398 246 L404 286 H96 L102 246 Z" fill="url(#relief)"/>
      ${text ? `<text x="250" y="266" text-anchor="middle" font-family="Elite" font-size="58" letter-spacing="10" fill="#fbf3e6" style="text-shadow:0 2px 0 rgba(0,0,0,.45)">PHASMO</text>` : ''}
    </g>
  </g>
</svg>`
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const jobs = [
    ['icon-512.png', 512, 1],
    ['icon-192.png', 192, 1],
    ['apple-touch-icon.png', 180, 1],
    ['icon-maskable-512.png', 512, 0.74],
  ]
  for (const [name, size, safe] of jobs) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0">${svg({ size, safe })}</body></html>`)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(150)
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: size, height: size } })
  }
  await browser.close()
})()
