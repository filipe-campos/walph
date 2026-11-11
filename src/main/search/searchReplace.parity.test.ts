import { describe, expect, it } from 'vitest'
import { parseRgLine } from './parseRipgrep'
import {
  applyEdits,
  compileSearchRegex,
  createReplacer,
  expandReplacement,
  planReplacements,
  relocateMatches,
  toUnicodeClasses
} from '@shared/searchReplace'
import type { SearchMatch, SearchOptions } from '@shared/types'

const LIT: SearchOptions = { caseSensitive: true, regex: false, wholeWord: false }
const LIT_I: SearchOptions = { caseSensitive: false, regex: false, wholeWord: false }
const RE: SearchOptions = { caseSensitive: true, regex: true, wholeWord: false }
const RE_I: SearchOptions = { caseSensitive: false, regex: true, wholeWord: false }

/** Simulates one line of `rg --json` (UTF-8 byte offsets) and runs it through main's real parser. */
function rgMatches(lineNumber: number, lineText: string, query: string, flags = 'g', eol = '\n'): SearchMatch[] {
  const raw = lineText + eol
  const submatches = [...lineText.matchAll(new RegExp(query, flags.includes('g') ? flags : flags + 'g'))].map((m) => ({
    start: Buffer.byteLength(lineText.slice(0, m.index), 'utf8'),
    end: Buffer.byteLength(lineText.slice(0, m.index + m[0].length), 'utf8')
  }))
  const json = JSON.stringify({
    type: 'match',
    data: { path: { text: 'a.txt' }, lines: { text: raw }, line_number: lineNumber, submatches }
  })
  return parseRgLine(json, '/root')!.matches
}

function run(content: string, matches: SearchMatch[], query: string, replacement: string, options: SearchOptions) {
  const replacer = createReplacer(query, replacement, options)!
  const plan = planReplacements(content, matches, replacer)
  return { ...plan, result: applyEdits(content, plan.edits) }
}

const m = (line: number, column: number, length: number, text: string): SearchMatch => ({ line, column, length, text })

describe('literal mode', () => {
  it('replaces foo with bar on several lines and several times on the same line', () => {
    const content = 'foo one\nnone\ntwo foo and foo\n'
    const matches = [...rgMatches(1, 'foo one', 'foo'), ...rgMatches(3, 'two foo and foo', 'foo')]
    const { result, skipped } = run(content, matches, 'foo', 'bar', LIT)
    expect(result).toBe('bar one\nnone\ntwo bar and bar\n')
    expect(skipped).toEqual([])
  })

  it('with caseSensitive false matches FOO for the query foo and keeps the rest', () => {
    const content = 'an FOO here\n'
    const { result, skipped } = run(content, rgMatches(1, 'an FOO here', 'foo', 'gi'), 'foo', 'bar', LIT_I)
    expect(result).toBe('an bar here\n')
    expect(skipped).toEqual([])
  })

  it('with caseSensitive true the FOO snippet does not reproduce the query foo and is skipped', () => {
    const content = 'an FOO here\n'
    const { result, skipped, edits } = run(content, [m(1, 3, 3, 'an FOO here')], 'foo', 'bar', LIT)
    expect(edits).toEqual([])
    expect(skipped).toEqual([0])
    expect(result).toBe(content)
  })

  it('$1, $& and $$ stay literal in literal mode', () => {
    const content = 'a foo b\n'
    const { result } = run(content, rgMatches(1, 'a foo b', 'foo'), 'foo', '$1-$&-$$', LIT)
    expect(result).toBe('a $1-$&-$$ b\n')
  })

  it('an empty replacement removes the snippet', () => {
    const { result } = run('a foo b\n', rgMatches(1, 'a foo b', 'foo'), 'foo', '', LIT)
    expect(result).toBe('a  b\n')
  })
})

describe('regex mode with groups', () => {
  it('(\\w+)Service → $1Repository in two occurrences', () => {
    const line = 'const a = new UserService(); OrderService.x'
    const { result } = run(line + '\n', rgMatches(1, line, '(\\w+)Service'), '(\\w+)Service', '$1Repository', RE)
    expect(result).toBe('const a = new UserRepository(); OrderRepository.x\n')
  })

  it('$& is the whole match and $$ becomes $', () => {
    const { result } = run('abc\n', rgMatches(1, 'abc', 'b'), 'b', '[$&]$$', RE)
    expect(result).toBe('a[b]$c\n')
  })

  it('$<name> uses a named group', () => {
    const line = 'year=2024'
    const q = 'year=(?<y>\\d+)'
    const { result } = run(line, rgMatches(1, line, q), q, 'year:$<y>', RE)
    expect(result).toBe('year:2024')
  })

  it('a missing or unclosed $<name> stays literal', () => {
    const exec = (re: RegExp, s: string) => re.exec(s)!
    const mm = exec(/(?<y>\d+)/, '12')
    expect(expandReplacement('$<z>', mm)).toBe('$<z>')
    expect(expandReplacement('$<y', mm)).toBe('$<y')
    expect(expandReplacement('$<y>', exec(/\d+/, '12'))).toBe('$<y>')
  })

  it('$10 is only group 10 if it exists; otherwise it is $1 followed by 0', () => {
    const two = /(a)(b)/.exec('ab')!
    expect(expandReplacement('$10', two)).toBe('a0')
    expect(expandReplacement('$12', two)).toBe('a2')
    const ten = /(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)/.exec('abcdefghij')!
    expect(expandReplacement('$10', ten)).toBe('j')
    expect(expandReplacement('$1', ten)).toBe('a')
  })

  it('a missing group stays literal ($9, $0) and so does $ at the end', () => {
    const one = /(a)/.exec('a')!
    expect(expandReplacement('$9', one)).toBe('$9')
    expect(expandReplacement('$0', one)).toBe('$0')
    expect(expandReplacement('x$', one)).toBe('x$')
    expect(expandReplacement('$x', one)).toBe('$x')
  })

  it('a group that did not participate becomes empty', () => {
    const { result } = run('b\n', rgMatches(1, 'b', '(a)?b'), '(a)?b', '[$1]', RE)
    expect(result).toBe('[]\n')
  })

  it('case-insensitive regex matches and expands with the original text', () => {
    const { result } = run('Hello\n', rgMatches(1, 'Hello', '(h)ello', 'gi'), '(h)ello', '$1i', RE_I)
    expect(result).toBe('Hi\n')
  })
})

describe('offsets and multibyte (end to end with the ripgrep parser)', () => {
  it('converts byte offsets with é before the match', () => {
    const line = 'café foo'
    const { result, skipped } = run(line + '\n', rgMatches(1, line, 'foo'), 'foo', 'bar', LIT)
    expect(result).toBe('café bar\n')
    expect(skipped).toEqual([])
  })

  it('emoji (surrogate pair) before the match', () => {
    const line = '😀😀 foo 😀 foo'
    const matches = rgMatches(1, line, 'foo')
    expect(matches[0].column).toBe(5)
    const { result } = run(line, matches, 'foo', 'bar', LIT)
    expect(result).toBe('😀😀 bar 😀 bar')
  })

  it('CJK before the match and inside the match', () => {
    const line = '你好 世界 foo 世界'
    expect(run(line, rgMatches(1, line, 'foo'), 'foo', 'bar', LIT).result).toBe('你好 世界 bar 世界')
    expect(run(line, rgMatches(1, line, '世界'), '世界', 'world', LIT).result).toBe('你好 world foo world')
  })

  it('regex with groups over multibyte text and emoji in the match', () => {
    const line = 'é 😀x 😀y'
    const q = '😀(\\w)'
    const matches = rgMatches(1, line, q, 'gu')
    expect(matches.map((x) => x.length)).toEqual([3, 3])
    expect(run(line, matches, q, '<$1>', RE).result).toBe('é <x> <y>')
  })

  it('matches on different lines with multibyte in each one', () => {
    const content = 'é foo\n😀 foo\n你 foo'
    const matches = [
      ...rgMatches(1, 'é foo', 'foo'),
      ...rgMatches(2, '😀 foo', 'foo'),
      ...rgMatches(3, '你 foo', 'foo')
    ]
    expect(run(content, matches, 'foo', 'X', LIT).result).toBe('é X\n😀 X\n你 X')
  })
})

describe('EOL, BOM and last line', () => {
  it('a \\r\\n file keeps \\r\\n after applying', () => {
    const content = 'foo a\r\nb foo\r\nfoo\r\n'
    const matches = [
      ...rgMatches(1, 'foo a', 'foo', 'g', '\r\n'),
      ...rgMatches(2, 'b foo', 'foo', 'g', '\r\n'),
      ...rgMatches(3, 'foo', 'foo', 'g', '\r\n')
    ]
    const { result, skipped } = run(content, matches, 'foo', 'bar', LIT)
    expect(result).toBe('bar a\r\nb bar\r\nbar\r\n')
    expect(skipped).toEqual([])
  })

  it('$ in a regex matches at the end of the line even with \\r\\n', () => {
    const content = 'ab\r\ncd\r\n'
    const matches = [m(1, 2, 0, 'ab'), m(2, 2, 0, 'cd')]
    expect(run(content, matches, '$', '!', RE).result).toBe('ab!\r\ncd!\r\n')
  })

  it('BOM: matches line 1 (no BOM in the rg text) and keeps the BOM', () => {
    const content = '﻿foo\nfoo\n'
    const matches = [...rgMatches(1, 'foo', 'foo'), ...rgMatches(2, 'foo', 'foo')]
    const { result, skipped } = run(content, matches, 'foo', 'bar', LIT)
    expect(result).toBe('﻿bar\nbar\n')
    expect(skipped).toEqual([])
  })

  it('BOM with column > 0 and multibyte on line 1', () => {
    const content = '﻿é foo\n'
    expect(run(content, rgMatches(1, 'é foo', 'foo'), 'foo', 'x', LIT).result).toBe('﻿é x\n')
  })

  it('last line without a final newline', () => {
    const content = 'a\nfoo'
    expect(run(content, rgMatches(2, 'foo', 'foo'), 'foo', 'bar', LIT).result).toBe('a\nbar')
  })

  it('an empty file or a line past the end is skipped', () => {
    const { skipped, edits } = run('', [m(1, 0, 3, 'foo')], 'foo', 'bar', LIT)
    expect(edits).toEqual([])
    expect(skipped).toEqual([0])
  })
})

describe('safety', () => {
  it('a line changed since the search (match.text differs) is skipped without an edit', () => {
    const content = 'foo changed\nfoo\n'
    const matches = [m(1, 0, 3, 'foo'), m(2, 0, 3, 'foo')]
    const { edits, skipped, result } = run(content, matches, 'foo', 'bar', LIT)
    expect(skipped).toEqual([0])
    expect(edits).toHaveLength(1)
    expect(result).toBe('foo changed\nbar\n')
  })

  it('a line number past the end, zero, negative or fractional is skipped', () => {
    const content = 'foo\n'
    const matches = [m(5, 0, 3, 'foo'), m(0, 0, 3, 'foo'), m(-1, 0, 3, 'foo'), m(1.5, 0, 3, 'foo')]
    const { edits, skipped } = run(content, matches, 'foo', 'bar', LIT)
    expect(edits).toEqual([])
    expect(skipped).toEqual([0, 1, 2, 3])
  })

  it('a column/length that go past the line are skipped', () => {
    const { skipped } = run('foo\n', [m(1, 2, 3, 'foo')], 'foo', 'bar', LIT)
    expect(skipped).toEqual([0])
    const re = run('foo\n', [m(1, 2, 3, 'foo')], 'foo', 'bar', RE)
    expect(re.skipped).toEqual([0])
  })

  it('duplicated match: only the first is applied', () => {
    const mt = m(1, 0, 3, 'foo')
    const { edits, skipped, result } = run('foo\n', [mt, { ...mt }], 'foo', 'bar', LIT)
    expect(edits).toHaveLength(1)
    expect(skipped).toEqual([1])
    expect(result).toBe('bar\n')
  })

  it('overlapping matches: the first (by offset) wins and the other is skipped', () => {
    const line = 'aaaa'
    const matches = [m(1, 1, 2, line), m(1, 0, 2, line)]
    const { edits, skipped, result } = run(line, matches, 'aa', 'X', LIT)
    expect(edits).toEqual([{ from: 0, to: 2, insert: 'X' }])
    expect(skipped).toEqual([0])
    expect(result).toBe('Xaa')
  })

  it('a zero-length regex (^) works on several lines', () => {
    const content = 'a\nb\n'
    const matches = [m(1, 0, 0, 'a'), m(2, 0, 0, 'b')]
    const { result, skipped } = run(content, matches, '^', '> ', RE)
    expect(result).toBe('> a\n> b\n')
    expect(skipped).toEqual([])
  })

  it('a duplicated zero-length match: only one is applied', () => {
    const { edits, skipped } = run('a\n', [m(1, 0, 0, 'a'), m(1, 0, 0, 'a')], '^', '> ', RE)
    expect(edits).toHaveLength(1)
    expect(skipped).toEqual([1])
  })

  it('several matches on the same line, given out of order', () => {
    const line = 'x foo y foo z foo'
    const matches = rgMatches(1, line, 'foo').reverse()
    const { result, skipped } = run(line, matches, 'foo', 'barbaz', LIT)
    expect(result).toBe('x barbaz y barbaz z barbaz')
    expect(skipped).toEqual([])
  })

  it('^ is evaluated against the whole line: column > 0 does not match', () => {
    const { skipped, edits } = run('xfoo\n', [m(1, 1, 3, 'xfoo')], '^foo', 'bar', RE)
    expect(edits).toEqual([])
    expect(skipped).toEqual([0])
  })

  it('$ is evaluated against the whole line: a match that does not end the line does not match $', () => {
    const { skipped } = run('foo bar\n', [m(1, 0, 3, 'foo bar')], 'foo$', 'x', RE)
    expect(skipped).toEqual([0])
    expect(run('bar foo\n', rgMatches(1, 'bar foo', 'foo$'), 'foo$', 'x', RE).result).toBe('bar x\n')
  })

  it('\\b uses the line context: foo inside foobar is skipped, a standalone one is replaced', () => {
    const line = 'foobar foo'
    const stale = run(line, [m(1, 0, 3, line)], '\\bfoo\\b', 'X', RE)
    expect(stale.skipped).toEqual([0])
    const ok = run(line, rgMatches(1, line, '\\bfoo\\b'), '\\bfoo\\b', 'X', RE)
    expect(ok.result).toBe('foobar X')
  })

  it('lookbehind sees the text before the column', () => {
    const line = 'a1 b1'
    const q = '(?<=b)1'
    expect(run(line, rgMatches(1, line, q), q, '2', RE).result).toBe('a1 b2')
  })

  it('a length different from the ripgrep match is skipped in regex mode', () => {
    const { skipped } = run('foo\n', [m(1, 0, 2, 'foo')], 'foo', 'x', RE)
    expect(skipped).toEqual([0])
  })

  it('skipped indexes come out in ascending order', () => {
    const matches = [m(9, 0, 1, 'a'), m(1, 0, 3, 'foo'), m(8, 0, 1, 'a')]
    expect(run('foo\n', matches, 'foo', 'b', LIT).skipped).toEqual([0, 2])
  })
})

describe('createReplacer / compileSearchRegex', () => {
  it('returns null for an invalid regex', () => {
    expect(createReplacer('(', 'x', RE)).toBeNull()
    expect(compileSearchRegex('(', RE)).toBeNull()
  })

  it('literal mode never fails, even with metacharacters', () => {
    expect(createReplacer('(', 'x', LIT)).not.toBeNull()
    const { result } = run('f(x)\n', rgMatches(1, 'f(x)', '\\('), '(', '[', LIT)
    expect(result).toBe('f[x)\n')
  })

  it('falls back to a regex without u when the syntax is only valid without it (\\-)', () => {
    expect(() => new RegExp(String.raw`a\-b`, 'u')).toThrow()
    const re = compileSearchRegex('a\\-b', RE)
    expect(re).not.toBeNull()
    expect(re!.unicode).toBe(false)
    expect(re!.sticky).toBe(true)
    const { result } = run('a-b\n', [m(1, 0, 3, 'a-b')], 'a\\-b', 'X', RE)
    expect(result).toBe('X\n')
  })

  it('uses u when possible and i according to caseSensitive', () => {
    const a = compileSearchRegex('a', RE)!
    expect(a.unicode).toBe(true)
    expect(a.ignoreCase).toBe(false)
    expect(compileSearchRegex('a', RE_I)!.ignoreCase).toBe(true)
  })

  it('the regex replacer is reusable (lastIndex does not leak between calls)', () => {
    const r = createReplacer('o', '0', RE)!
    const mt = m(1, 1, 1, 'foo')
    expect(r('foo', mt)).toBe('0')
    expect(r('foo', mt)).toBe('0')
    expect(r('foo', m(1, 0, 1, 'foo'))).toBeNull()
  })
})

describe('applyEdits', () => {
  it('applies edits out of order without changing the given array', () => {
    const edits = [
      { from: 6, to: 9, insert: 'C' },
      { from: 0, to: 3, insert: 'A' },
      { from: 3, to: 3, insert: '-' }
    ]
    const copy = structuredClone(edits)
    expect(applyEdits('foo bar baz', edits)).toBe('A- baCaz')
    expect(edits).toEqual(copy)
  })

  it('without edits returns the content', () => {
    expect(applyEdits('abc', [])).toBe('abc')
  })
})

// Same `\w` set as the ripgrep used by the engine.
const W = '\\p{Alphabetic}\\p{M}\\p{Nd}\\p{Pc}\\p{Join_Control}'
const uni = (q: string) => new RegExp(toUnicodeClasses(q)!, 'u')

describe('toUnicodeClasses', () => {
  it('rewrites \\w, \\W, \\d and \\D outside classes', () => {
    expect(toUnicodeClasses('\\w')).toBe(`[${W}]`)
    expect(toUnicodeClasses('\\W')).toBe(`[^${W}]`)
    expect(toUnicodeClasses('\\d')).toBe('\\p{Nd}')
    expect(toUnicodeClasses('\\D')).toBe('\\P{Nd}')
  })

  it('\\w and \\d start matching non-ASCII letters and digits; \\W and \\D negate them', () => {
    expect(uni('^\\w+$').test('ação')).toBe(true)
    expect(uni('^\\W$').test('é')).toBe(false)
    expect(uni('^\\W$').test('-')).toBe(true)
    expect(uni('^\\d+$').test('٣٤')).toBe(true)
    expect(uni('^\\D$').test('٣')).toBe(false)
    expect(uni('^\\D$').test('a')).toBe(true)
  })

  it('\\b and \\B use a Unicode boundary', () => {
    expect(uni('\\bfoo').test('éfoo')).toBe(false)
    expect(uni('\\bfoo').test('é foo')).toBe(true)
    expect(uni('foo\\b').test('fooé')).toBe(false)
    expect(uni('\\Bfoo').test('éfoo')).toBe(true)
    expect(uni('\\Bfoo').test('é foo')).toBe(false)
  })

  it('\\w, \\d and \\D inside [...] become the class content', () => {
    expect(toUnicodeClasses('[\\w]')).toBe(`[${W}]`)
    expect(toUnicodeClasses('[\\d.]')).toBe('[\\p{Nd}.]')
    expect(toUnicodeClasses('[\\D]')).toBe('[\\P{Nd}]')
    expect(uni('^[\\w.]+$').test('é.ç')).toBe(true)
  })

  it('[^\\w-] keeps the negation and the hyphen at the end', () => {
    expect(toUnicodeClasses('[^\\w-]')).toBe(`[^${W}-]`)
    expect(uni('^[^\\w-]$').test('é')).toBe(false)
    expect(uni('^[^\\w-]$').test('-')).toBe(false)
    expect(uni('^[^\\w-]$').test('!')).toBe(true)
  })

  it('] right at the start of the class is literal', () => {
    expect(toUnicodeClasses('[]a]')).toBe('[\\]a]')
    expect(toUnicodeClasses('[^]a]')).toBe('[^\\]a]')
    const re = uni('^[]a]+$')
    expect(re.test(']a')).toBe(true)
    expect(re.test('b')).toBe(false)
  })

  it('the class closes at the first ] and what comes after is rewritten again', () => {
    expect(toUnicodeClasses('[a]\\w')).toBe(`[a][${W}]`)
  })

  it('an escaped backslash (\\\\w) stays literal: backslash then w', () => {
    expect(toUnicodeClasses('\\\\w')).toBe('\\\\w')
    expect(uni('\\\\w').test('\\w')).toBe(true)
    expect(uni('\\\\w').test('a')).toBe(false)
  })

  it('returns null for \\W and \\B inside a class', () => {
    expect(toUnicodeClasses('[\\W]')).toBeNull()
    expect(toUnicodeClasses('[\\B]')).toBeNull()
    expect(toUnicodeClasses('[^a\\W]')).toBeNull()
  })

  it('\\b inside a class is still backspace (\\b)', () => {
    expect(toUnicodeClasses('[a\\b]')).toBe('[a\\b]')
  })

  it('other escapes pass unchanged', () => {
    expect(toUnicodeClasses('\\.')).toBe('\\.')
    expect(toUnicodeClasses('\\x41')).toBe('\\x41')
    expect(toUnicodeClasses('\\p{L}')).toBe('\\p{L}')
    expect(toUnicodeClasses('a.*b')).toBe('a.*b')
  })

  it('a backslash at the end of the query passes as is', () => {
    expect(toUnicodeClasses('a\\')).toBe('a\\')
  })
})

describe('createReplacer: ripgrep Unicode fidelity (regex mode)', () => {
  it('(\\w*)(.*) with $2$1 on "ação": \\w covers the whole word', () => {
    const { result, skipped } = run('ação', [m(1, 0, 4, 'ação')], '(\\w*)(.*)', '$2$1', RE)
    expect(skipped).toEqual([])
    expect(result).toBe('ação')
  })

  it('\\bfoo\\b on "éfoo" (column 1) is skipped, and on "é foo" is replaced', () => {
    const bad = run('éfoo', [m(1, 1, 3, 'éfoo')], '\\bfoo\\b', 'X', RE)
    expect(bad.skipped).toEqual([0])
    expect(bad.result).toBe('éfoo')
    const ok = run('é foo', [m(1, 2, 3, 'é foo')], '\\bfoo\\b', 'X', RE)
    expect(ok.skipped).toEqual([])
    expect(ok.result).toBe('é X')
  })

  it('😀(\\w) → <$1> on "é 😀x 😀y" and with a non-ASCII letter in the group', () => {
    const line = 'é 😀x 😀y'
    const matches = [m(1, 2, 3, line), m(1, 6, 3, line)]
    expect(run(line, matches, '😀(\\w)', '<$1>', RE).result).toBe('é <x> <y>')
    expect(run('😀ç', [m(1, 0, 3, '😀ç')], '😀(\\w)', '<$1>', RE).result).toBe('<ç>')
  })

  it('a query valid only without u ((.)(.*)\\-): a non-ASCII line is skipped, ASCII works', () => {
    const q = '(.)(.*)\\-'
    expect(() => new RegExp(q, 'u')).toThrow()
    const r = createReplacer(q, '$1|$2', RE)!
    expect(r).not.toBeNull()
    expect(r('😀-', m(1, 0, 3, '😀-'))).toBeNull()
    expect(r('é-', m(1, 0, 2, 'é-'))).toBeNull()
    expect(r('ab-', m(1, 0, 3, 'ab-'))).toBe('a|b')
    expect(run('a-\n', [m(1, 0, 2, 'a-')], q, '$1|$2', RE).result).toBe('a|\n')
  })

  it('a non-ASCII line only affects the variant without u: a query with u stays exact', () => {
    const r = createReplacer('(.)-', '$1', RE)!
    expect(r('😀-', m(1, 0, 3, '😀-'))).toBe('😀')
  })

  it('a replacement that produces a lone surrogate is refused (null)', () => {
    const lone = createReplacer('foo', '\uD83D', RE)!
    expect(lone('foo', m(1, 0, 3, 'foo'))).toBeNull()
    const low = createReplacer('foo', '\uDE00', RE)!
    expect(low('foo', m(1, 0, 3, 'foo'))).toBeNull()
    const { edits, skipped } = run('foo', [m(1, 0, 3, 'foo')], 'foo', '\uD83D', RE)
    expect(edits).toEqual([])
    expect(skipped).toEqual([0])
  })

  it('a complete surrogate pair in the replacement is accepted', () => {
    expect(run('foo', [m(1, 0, 3, 'foo')], 'foo', '😀', RE).result).toBe('😀')
  })

  it('\\d+ with $& reproduces the match in Arabic-Indic digits (٣٤)', () => {
    expect(run('٣٤', [m(1, 0, 2, '٣٤')], '\\d+', '<$&>', RE).result).toBe('<٣٤>')
    expect(run('x٣٤ y', [m(1, 1, 2, 'x٣٤ y')], '\\d+', '[$&]', RE).result).toBe('x[٣٤] y')
    expect(run('a12', [m(1, 1, 2, 'a12')], '\\d+', '[$&]', RE).result).toBe('a[12]')
  })
})

describe('relocateMatches', () => {
  const foo = (line: number) => m(line, 0, 3, 'foo')

  it('line inserted above: the match moves down one line', () => {
    expect(relocateMatches('new\nfoo\nbar', [foo(1)])).toEqual([foo(2)])
  })

  it('lines removed above: the match moves up', () => {
    expect(relocateMatches('foo', [foo(3)])).toEqual([foo(1)])
    expect(relocateMatches('a\nfoo', [foo(5)])).toEqual([foo(2)])
  })

  it('a line that stays in place does not change', () => {
    expect(relocateMatches('a\nfoo\nb', [foo(2)])).toEqual([foo(2)])
  })

  it('identical lines: the one closest to the original wins', () => {
    const content = 'foo\nz\nz\nfoo\nz\nz\nz'
    expect(relocateMatches(content, [foo(5)])).toEqual([foo(4)])
    expect(relocateMatches('foo\nz\nz\nz\nz\nz\nfoo\nz', [foo(5)])).toEqual([foo(7)])
  })

  it('each buffer line is used only once', () => {
    // Two "foo" lines on disk, only one in the buffer: the other stays as is and will be skipped.
    const content = 'a\nfoo\nb'
    const out = relocateMatches(content, [foo(2), foo(3)])
    expect(out).toEqual([foo(2), foo(3)])
    const { edits, skipped } = planReplacements(content, out, createReplacer('foo', 'X', LIT)!)
    expect(edits).toEqual([{ from: 2, to: 5, insert: 'X' }])
    expect(skipped).toEqual([1])
  })

  it('two equal lines on disk and in the buffer take two distinct lines', () => {
    const out = relocateMatches('new\nfoo\nfoo', [foo(1), foo(2)])
    expect(out.map((x) => x.line).sort()).toEqual([2, 3])
  })

  it('a line not found stays unchanged and planReplacements skips it', () => {
    const content = 'other\nthing'
    const out = relocateMatches(content, [foo(1)])
    expect(out).toEqual([foo(1)])
    const plan = planReplacements(content, out, createReplacer('foo', 'X', LIT)!)
    expect(plan.edits).toEqual([])
    expect(plan.skipped).toEqual([0])
  })

  it('\\r\\n content: the \\r is not part of the line text', () => {
    expect(relocateMatches('new\r\nfoo\r\n', [foo(1)])).toEqual([foo(2)])
    expect(relocateMatches('foo\r\nbar', [foo(1)])).toEqual([foo(1)])
  })

  it('a BOM at the start does not keep line 1 from being found', () => {
    expect(relocateMatches('﻿foo\nbar', [foo(1)])).toEqual([foo(1)])
    expect(relocateMatches('﻿new\nfoo', [foo(1)])).toEqual([foo(2)])
    expect(relocateMatches('x\n﻿foo', [foo(2)])).toEqual([foo(2)])
  })

  it('keeps order and other fields, several matches on the same line, without mutating the input', () => {
    const line = 'foo & foo'
    const input: SearchMatch[] = [m(4, 6, 3, line), m(1, 0, 3, 'bar'), m(4, 0, 3, line)]
    const copy = structuredClone(input)
    const out = relocateMatches('new\nbar\nx\ny\n' + line, input)
    expect(out).toEqual([m(5, 6, 3, line), m(2, 0, 3, 'bar'), m(5, 0, 3, line)])
    expect(input).toEqual(copy)
  })

  it('empty list and empty content', () => {
    expect(relocateMatches('abc', [])).toEqual([])
    expect(relocateMatches('', [foo(1)])).toEqual([foo(1)])
  })

  it('end to end: dirty tab with new lines above and \\r\\n EOL', () => {
    const content = 'import x\r\n\r\nfoo a\r\nb foo\r\nfoo\r\n'
    const matches = [
      ...rgMatches(1, 'foo a', 'foo'),
      ...rgMatches(2, 'b foo', 'foo'),
      ...rgMatches(3, 'foo', 'foo'),
      ...rgMatches(4, 'deleted line foo', 'foo')
    ]
    const replacer = createReplacer('foo', 'bar', LIT)!
    const { edits, skipped } = planReplacements(content, relocateMatches(content, matches), replacer)
    expect(applyEdits(content, edits)).toBe('import x\r\n\r\nbar a\r\nb bar\r\nbar\r\n')
    expect(skipped).toEqual([3])
  })

  it('end to end: BOM, multibyte and regex with groups after relocating', () => {
    const content = '﻿// new\ncafé UserService\n'
    const matches = rgMatches(1, 'café UserService', '(\\w+)Service')
    const replacer = createReplacer('(\\w+)Service', '$1Repo', RE)!
    const { edits, skipped } = planReplacements(content, relocateMatches(content, matches), replacer)
    expect(skipped).toEqual([])
    expect(applyEdits(content, edits)).toBe('﻿// new\ncafé UserRepo\n')
  })

  it('without relocating, the same scenario is skipped (relocation is what makes it applicable)', () => {
    const content = 'new\nfoo\n'
    const replacer = createReplacer('foo', 'X', LIT)!
    expect(planReplacements(content, [foo(1)], replacer).skipped).toEqual([0])
    expect(planReplacements(content, relocateMatches(content, [foo(1)]), replacer).skipped).toEqual([])
  })
})
