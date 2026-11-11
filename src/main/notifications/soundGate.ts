// A notice often goes out through two paths at once (toast + system notification, or a toast in another window):
// the sound plays only once per burst.

const SOUND_MIN_INTERVAL_MS = 1500

export interface SoundGate {
  /** Can it play now? If so, records the play. */
  allow(now: number): boolean
}

export function createSoundGate(minIntervalMs = SOUND_MIN_INTERVAL_MS): SoundGate {
  let last = -Infinity
  return {
    allow(now) {
      if (now - last < minIntervalMs) return false
      last = now
      return true
    }
  }
}
