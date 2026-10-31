/**
 * Encodage compact d'un objet JSON dans une URL (partage de notes ou de progression sans serveur).
 * Format : "z" + base64url(deflate-raw(json)) si CompressionStream est disponible, sinon "j" + base64url(json).
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

export async function encodePayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value))
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
    } catch {
      /* repli sans compression */
    }
  }
  return 'j' + toBase64Url(json)
}

export async function decodePayload<T>(data: string): Promise<T> {
  const kind = data[0]
  const bytes = fromBase64Url(data.slice(1))
  let json: Uint8Array
  if (kind === 'z') json = await pipe(bytes, new DecompressionStream('deflate-raw'))
  else if (kind === 'j') json = bytes
  else throw new Error('Format de lien inconnu')
  return JSON.parse(new TextDecoder().decode(json)) as T
}

export function appUrl(hashPath: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#${hashPath}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
