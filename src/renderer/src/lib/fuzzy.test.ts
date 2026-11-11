import { describe, expect, it } from 'vitest'
import { fuzzyMatch } from './fuzzy'

describe('fuzzyMatch', () => {
  it('an empty query matches with score 0', () => {
    expect(fuzzyMatch('', 'Qualquer')).toEqual({ score: 0, matches: [] })
  })
  it('returns null when it is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'Terminal')).toBeNull()
    expect(fuzzyMatch('lmt', 'Terminal')).toBeNull()
  })
  it('ignores case and accents keeping the indexes', () => {
    expect(fuzzyMatch('ação', 'Ação')?.matches).toEqual([0, 1, 2, 3])
    expect(fuzzyMatch('acao', 'Ação')?.matches).toEqual([0, 1, 2, 3])
  })
  it('returns the matched indexes', () => {
    expect(fuzzyMatch('term', 'Terminal: Alternar Terminal')?.matches).toEqual([0, 1, 2, 3])
  })
  it('prefers a contiguous sequence to scattered letters', () => {
    const contiguo = fuzzyMatch('ter', 'Terminal')!
    const espalhado = fuzzyMatch('ter', 'Tela de Registro')!
    expect(contiguo.score).toBeGreaterThan(espalhado.score)
  })
  it('prefers a word start', () => {
    const a = fuzzyMatch('at', 'Alternar Terminal')!
    const b = fuzzyMatch('at', 'Matriz')!
    expect(a.score).toBeGreaterThan(b.score)
  })
  it('picks word starts even after the first possible match', () => {
    expect(fuzzyMatch('at', 'Alternar Terminal')?.matches).toEqual([0, 9])
  })

  it('ignores accents and case in the query and the text, with indexes of the original text', () => {
    expect(fuzzyMatch('CAFE', 'Pré café')?.matches).toEqual([4, 5, 6, 7])
    expect(fuzzyMatch('é', 'Pré')?.matches).toEqual([2])
  })
  it('does not match when the letter order is reversed', () => {
    expect(fuzzyMatch('lanimret', 'Terminal')).toBeNull()
    expect(fuzzyMatch('tt', 'Te')).toBeNull()
  })
  it('a query longer than the text does not match', () => {
    expect(fuzzyMatch('terminais', 'Term')).toBeNull()
  })
  it('a query with only spaces matches as empty', () => {
    expect(fuzzyMatch('   ', 'Terminal')).toEqual({ score: 0, matches: [] })
  })
  it('spaces in the query are ignored', () => {
    expect(fuzzyMatch('te rm', 'Terminal')?.matches).toEqual([0, 1, 2, 3])
  })
  it('"term" ranks the terminal command above scattered letters', () => {
    const alvo = fuzzyMatch('term', 'Terminal: Alternar Terminal')!
    const espalhado = fuzzyMatch('term', 'Arquivo: Fechar Aba (tela de entrada, registro, memória)')!
    expect(espalhado).not.toBeNull()
    expect(alvo.score).toBeGreaterThan(espalhado.score)
  })
  it('a contiguous sequence in the middle beats scattered letters on weak word starts', () => {
    const continuo = fuzzyMatch('zoom', 'Exibir: Aumentar Zoom')!
    const espalhado = fuzzyMatch('zoom', 'Exibir: Zebra Onda Oval Mesa')!
    expect(continuo.score).toBeGreaterThan(espalhado.score)
  })
  it('word starts after separators and camelCase count as a start', () => {
    expect(fuzzyMatch('ms', 'meu_super')?.matches).toEqual([0, 4])
    expect(fuzzyMatch('ms', 'meuSuper')?.matches).toEqual([0, 3])
  })
})

// O(m·n²) reference (full scan of k, like the original version), by code point with UTF-16 indexes.
function reference(query: string, text: string): { score: number; matches: number[] } | null {
  const fold = (ch: string): string => String.fromCodePoint(ch.normalize('NFD').codePointAt(0)!).toLowerCase()
  const q = Array.from(query.replace(/\s+/g, ''), fold)
  if (q.length === 0) return { score: 0, matches: [] }
  const chars = Array.from(text)
  const t = chars.map(fold)
  const n = t.length
  const m = q.length
  if (m > n) return null
  const offsets: number[] = []
  for (let j = 0, o = 0; j < n; o += chars[j].length, j++) offsets.push(o)
  const lower = (c: string): boolean => c === c.toLowerCase() && c !== c.toUpperCase()
  const ws = (j: number): boolean =>
    j === 0 || ' :.-/_\\'.includes(chars[j - 1]) || (lower(chars[j - 1]) && chars[j] !== chars[j].toLowerCase())
  const dp = Array.from({ length: m }, () => new Array<number>(n).fill(-Infinity))
  const prev = Array.from({ length: m }, () => new Array<number>(n).fill(-1))
  for (let i = 0; i < m; i++) {
    for (let j = i; j < n; j++) {
      if (t[j] !== q[i]) continue
      const base = 1 + (ws(j) ? 8 : 0)
      if (i === 0) {
        dp[0][j] = base + Math.max(0, 10 - j)
        continue
      }
      let best = -Infinity
      let from = -1
      for (let k = i - 1; k < j; k++) {
        if (dp[i - 1][k] === -Infinity) continue
        const s = dp[i - 1][k] + (k === j - 1 ? 6 : -Math.min(j - k - 1, 5))
        if (s > best) {
          best = s
          from = k
        }
      }
      if (from >= 0) {
        dp[i][j] = best + base
        prev[i][j] = from
      }
    }
  }
  let end = -1
  let top = -Infinity
  for (let j = m - 1; j < n; j++) {
    if (dp[m - 1][j] > top) {
      top = dp[m - 1][j]
      end = j
    }
  }
  if (end < 0) return null
  const matches = new Array<number>(m)
  for (let i = m - 1, j = end; i >= 0; i--) {
    matches[i] = offsets[j]
    j = prev[i][j]
  }
  return { score: top, matches }
}

describe('fuzzyMatch: optimization and unicode', () => {
  it('gives the same result as the full O(m·n²) scan on random inputs', () => {
    // Deterministic PRNG so the test is reproducible.
    let seed = 42
    const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const alphabet = 'aAbBcé/._- x😀'
    const pick = (len: number): string =>
      Array.from({ length: len }, () => Array.from(alphabet)[Math.floor(rand() * Array.from(alphabet).length)]).join('')
    for (let n = 0; n < 3000; n++) {
      const text = pick(1 + Math.floor(rand() * 40))
      const query = pick(1 + Math.floor(rand() * 5))
      expect(fuzzyMatch(query, text), `${query} in ${text}`).toEqual(reference(query, text))
    }
  })

  it('returns correct UTF-16 indexes after an emoji', () => {
    const text = '😀 abc'
    const result = fuzzyMatch('ac', text)!
    expect(result.matches).toEqual([3, 5])
    expect(result.matches.map((i) => text[i])).toEqual(['a', 'c'])
  })

  it('matches the emoji itself pointing to the first unit of the pair', () => {
    const text = 'x😀y'
    expect(fuzzyMatch('😀y', text)!.matches).toEqual([1, 3])
  })

  it('the emoji counts as 1 position in the start bonus and in the gap count', () => {
    // With the emoji taking 1 position, "ab" in "😀ab" has the same score as "xab".
    expect(fuzzyMatch('ab', '😀ab')!.score).toBe(fuzzyMatch('ab', 'xab')!.score)
  })

  // Measuring time with coverage on says nothing (instrumentation).
  it.skipIf(!!import.meta.env.WALPH_COVERAGE)('scores 10 thousand long paths fast (Quick Open)', () => {
    const paths = Array.from(
      { length: 10_000 },
      (_, i) => `src/renderer/src/components/module${i}/subfolder/other/one-more/FileWithAVeryLongName${i}.tsx`
    )
    const start = performance.now()
    for (const p of paths) fuzzyMatch('compsarqtsx', p)
    // Loose limit (slow CI machine); the O(m·n²) version took several times longer.
    expect(performance.now() - start).toBeLessThan(1500)
  })
})
