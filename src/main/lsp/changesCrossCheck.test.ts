// Cross-checks the client (renderer: CodeMirror ChangeSet → LSP contentChanges) with main's sync server
// (`applyChanges`): the text main rebuilds must be identical to CodeMirror's. Lives in the `node` project because the
// renderer (jsdom) must not import main code; `@shared/lspPosition` is pure and depends only on @codemirror/state.
import { ChangeSet, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { changesToLsp } from '@shared/lspPosition'
import { applyChanges } from './applyChanges'

/** Deterministic PRNG (mulberry32): reproducible failure. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Mixes ASCII, accents, CJK (BMP), emoji (surrogate pair) and line breaks.
const ALPHABET = ['a', 'b', ' ', 'é', '日', '😀', '🎉', '\n', '\n', 'x']

function randomText(next: () => number, max: number): string {
  const len = Math.floor(next() * max)
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(next() * ALPHABET.length)]
  return s
}

/** Does not split surrogate pairs: CodeMirror also treats the pair as one character. */
function randomBoundary(text: string, next: () => number): number {
  let pos = Math.floor(next() * (text.length + 1))
  if (pos > 0 && pos < text.length && /[\ud800-\udbff]/.test(text[pos - 1]) && /[\udc00-\udfff]/.test(text[pos])) pos--
  return pos
}

describe('changesToLsp (renderer) × applyChanges (main)', () => {
  it('rebuilds the same text as CodeMirror over 500 random edits with emoji, CJK and multiple lines', () => {
    const next = rng(42)
    for (let n = 0; n < 500; n++) {
      const text = randomText(next, 40)
      const state = EditorState.create({ doc: text })
      // Up to 4 non-overlapping changes, in coordinates of the initial document.
      const cuts = Array.from({ length: 8 }, () => randomBoundary(text, next)).sort((a, b) => a - b)
      const specs: { from: number; to: number; insert: string }[] = []
      for (let i = 0; i < cuts.length; i += 2) {
        if (next() < 0.3) continue
        specs.push({ from: cuts[i], to: cuts[i + 1], insert: randomText(next, 6) })
      }
      const changes = ChangeSet.of(specs, text.length)
      const viaLsp = applyChanges(text, changesToLsp(state.doc, changes))
      expect(viaLsp, `text=${JSON.stringify(text)} specs=${JSON.stringify(specs)}`).toBe(
        changes.apply(state.doc).toString()
      )
    }
  })

  it('sequence of transactions: main follows the document version by version', () => {
    const next = rng(7)
    let state = EditorState.create({ doc: 'olá 😀\nmundo 日本\n' })
    let mirror = state.doc.toString()
    for (let n = 0; n < 200; n++) {
      const text = state.doc.toString()
      const from = randomBoundary(text, next)
      const to = Math.max(from, randomBoundary(text, next))
      const tr = state.update({ changes: { from, to, insert: randomText(next, 5) } })
      mirror = applyChanges(mirror, changesToLsp(state.doc, tr.changes))
      state = tr.state
      expect(mirror).toBe(state.doc.toString())
    }
  })

  it('replacing one emoji with another and inserting right after a surrogate pair', () => {
    const state = EditorState.create({ doc: 'a😀b😀' })
    const changes = ChangeSet.of(
      [
        { from: 1, to: 3, insert: '🎉' },
        { from: 6, insert: '!' }
      ],
      state.doc.length
    )
    expect(applyChanges('a😀b😀', changesToLsp(state.doc, changes))).toBe('a🎉b😀!')
  })
})
