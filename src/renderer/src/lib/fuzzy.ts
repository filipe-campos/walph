// Command palette style fuzzy search: case/accent-insensitive subsequence with scoring.

export interface FuzzyResult {
  score: number
  /**
   * Indexes in `text` (UTF-16 units, like `text.slice`) of the start of each matched character, for highlighting.
   * A character outside the BMP (emoji) takes 2 units; the index points to the first.
   */
  matches: number[]
}

const SEPARATORS = new Set([' ', ':', '.', '-', '/', '_', '\\'])

// Folds each character alone (no NFD on the whole text) so the indexes stay valid in the original.
// ASCII (almost every file path) skips normalize, which dominates the cost over thousands of paths.
function fold(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch
  return String.fromCodePoint(ch.normalize('NFD').codePointAt(0)!).toLowerCase()
}

// ASCII shortcut by code; outside ASCII compares the upper/lower case versions (covers accents).
function isLower(ch: string): boolean {
  const code = ch.charCodeAt(0)
  if (code < 128) return code >= 97 && code <= 122
  return ch === ch.toLowerCase() && ch !== ch.toUpperCase()
}

function isUpper(ch: string): boolean {
  const code = ch.charCodeAt(0)
  if (code < 128) return code >= 65 && code <= 90
  return ch !== ch.toLowerCase()
}

const MATCH = 1
const WORD_START = 8
const CONSECUTIVE = 6
const GAP = 1
const MAX_GAP_PENALTY = 5
const FIRST_BONUS = 10

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = Array.from(query.replace(/\s+/g, ''), fold)
  if (q.length === 0) return { score: 0, matches: [] }
  // Works by code point (emoji = 1 position) and converts to a UTF-16 index only at the end.
  const chars = Array.from(text)
  const n = chars.length
  const m = q.length
  if (m > n) return null

  const t = chars.map(fold)
  // O(n) prefilter: without the subsequence, it does not even allocate the DP (most paths in Quick Open do not match).
  for (let i = 0, j = 0; i < m; i++, j++) {
    while (j < n && t[j] !== q[i]) j++
    if (j === n) return null
  }
  const offsets = new Int32Array(n)
  const wordStart = new Uint8Array(n)
  for (let j = 0, offset = 0; j < n; j++) {
    const char = chars[j] ?? ''
    const before = chars[j - 1] ?? ''
    offsets[j] = offset
    wordStart[j] = j === 0 || SEPARATORS.has(before) || (isLower(before) && isUpper(char)) ? 1 : 0
    offset += char.length
  }

  // dp[i*n+j]: best score matching q[0..i] with q[i] at t[j]; prev keeps the previous j to rebuild.
  const NEG = -Infinity
  const dp = new Float64Array(m * n).fill(NEG)
  const prev = new Int32Array(m * n).fill(-1)

  for (let j = 0; j < n; j++) {
    if (t[j] === q[0]) dp[j] = MATCH + (wordStart[j] ? WORD_START : 0) + Math.max(0, FIRST_BONUS - j)
  }

  // The gap penalty saturates at MAX_GAP_PENALTY: every k with gap ≥ 5 (k ≤ j-6) has the same penalty, so a running
  // maximum of them + looking at the window of the 5 previous ones is enough. O(m·n) instead of O(m·n²), which matters
  // in Quick Open.
  const FAR = MAX_GAP_PENALTY + 1
  for (let i = 1; i < m; i++) {
    const row = i * n
    const prevRow = row - n
    let farBest = NEG
    let farFrom = -1
    for (let j = i; j < n; j++) {
      const k0 = j - FAR
      // Strict (>): on a tie the oldest k stays, as in the full scan.
      const far = k0 >= i - 1 ? (dp[prevRow + k0] ?? NEG) : NEG
      if (far > farBest) {
        farBest = far
        farFrom = k0
      }
      if (t[j] !== q[i]) continue

      let best = farFrom >= 0 ? farBest - MAX_GAP_PENALTY * GAP : NEG
      let from = farFrom
      for (let k = Math.max(i - 1, j - MAX_GAP_PENALTY); k < j; k++) {
        const d = dp[prevRow + k] ?? NEG
        if (d === NEG) continue
        const s = d + (k === j - 1 ? CONSECUTIVE : -(j - k - 1) * GAP)
        if (s > best) {
          best = s
          from = k
        }
      }
      if (from >= 0) {
        dp[row + j] = best + MATCH + (wordStart[j] ? WORD_START : 0)
        prev[row + j] = from
      }
    }
  }

  const last = (m - 1) * n
  let end = -1
  let top = NEG
  for (let j = m - 1; j < n; j++) {
    const score = dp[last + j] ?? NEG
    if (score > top) {
      top = score
      end = j
    }
  }
  if (end < 0) return null

  const matches = new Array<number>(m)
  for (let i = m - 1, j = end; i >= 0; i--) {
    matches[i] = offsets[j] ?? 0
    j = prev[i * n + j] ?? -1
  }
  return { score: top, matches }
}
