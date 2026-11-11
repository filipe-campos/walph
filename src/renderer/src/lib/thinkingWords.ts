import { t } from '@shared/i18n'

/** Spinner words in the current language (each language has its own list, without repeats). */
export const thinkingWords = (): string[] => t().claude.thinkingWords.words.split('|')

/** FNV-1a hash: spreads similar seeds (turn ids) to different points of the list. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Word of turn `seed` at rotation `step`: stable for the same pair and different from the previous one on each step.
 */
export function pickThinkingWord(seed: string, step = 0): string {
  const words = thinkingWords()
  return words[(hash(seed) + step) % words.length] ?? ''
}
