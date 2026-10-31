/**
 * Bruits de pas synthétisés (Web Audio), sans aucun fichier son.
 * Cadence : même relation vitesse → pas/minute que le métronome du cheat sheet
 * (bpm = 60 / (1/v − 0,075)), à 100 % de vitesse.
 */

export function speedToBpm(speed: number): number {
  return 60 / (1 / speed - 0.075)
}

export function bpmToSpeed(bpm: number): number {
  return bpm / (60 + bpm * 0.075)
}

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext {
  if (!ctx) {
    // Sur iPhone, le Web Audio suit le bouton silencieux, sauf en session « lecture » (Safari 16.4+)
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) {
      try {
        session.type = 'playback'
      } catch {
        /* non pris en charge */
      }
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise
  const len = Math.floor(ac.sampleRate * 0.25)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noise = buf
  return buf
}

function footstep(ac: AudioContext, out: AudioNode, at: number, left: boolean, volume: number) {
  // impact grave
  const thump = ac.createOscillator()
  const tg = ac.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(left ? 92 : 84, at)
  thump.frequency.exponentialRampToValueAtTime(42, at + 0.11)
  tg.gain.setValueAtTime(0.0001, at)
  tg.gain.exponentialRampToValueAtTime(0.9 * volume, at + 0.004)
  tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.14)
  thump.connect(tg).connect(out)
  thump.start(at)
  thump.stop(at + 0.16)

  // frottement (bruit filtré)
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = left ? 520 : 460
  bp.Q.value = 0.9
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1800
  const ng = ac.createGain()
  ng.gain.setValueAtTime(0.0001, at)
  ng.gain.exponentialRampToValueAtTime(0.55 * volume, at + 0.006)
  ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.12)
  src.connect(bp).connect(lp).connect(ng).connect(out)
  src.start(at, Math.random() * 0.1, 0.14)

  const pan = (out as StereoPannerNode).pan
  if (pan) pan.setValueAtTime(left ? -0.12 : 0.12, at)
}

export interface Footsteps {
  play(speed: number, seconds?: number): void
  stop(): void
  readonly playing: boolean
}

export function createFootsteps(onEnd?: () => void): Footsteps {
  let timer: number | null = null
  let endTimer: number | null = null
  let nextAt = 0
  let left = true
  let playing = false
  let master: GainNode | null = null

  const stop = () => {
    if (timer != null) window.clearInterval(timer)
    if (endTimer != null) window.clearTimeout(endTimer)
    timer = endTimer = null
    if (master && ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
      const m = master
      window.setTimeout(() => m.disconnect(), 200)
    }
    master = null
    if (playing) {
      playing = false
      onEnd?.()
    }
  }

  return {
    get playing() {
      return playing
    },
    play(speed: number, seconds = 6) {
      stop()
      const ac = audio()
      master = ac.createGain()
      master.gain.value = 0.8
      const panner = ac.createStereoPanner()
      panner.connect(master).connect(ac.destination)
      const interval = 60 / speedToBpm(speed)
      nextAt = ac.currentTime + 0.05
      playing = true
      const out = panner
      timer = window.setInterval(() => {
        while (nextAt < ac.currentTime + 0.12) {
          footstep(ac, out, nextAt, left, 1)
          left = !left
          nextAt += interval
        }
      }, 25)
      endTimer = window.setTimeout(stop, seconds * 1000)
    },
    stop,
  }
}
