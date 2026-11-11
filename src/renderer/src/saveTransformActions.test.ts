import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { undo } from '@codemirror/commands'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { installFakeApi } from './test/fakeApi'

installFakeApi({})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const { states } = await import('./components/editor/documentState')
const { forgetDocument, loadDocument } = await import('./components/editor/documentStore')
const { currentState } = await import('./components/editor/groupViews')
const { applySaveTransforms } = await import('./saveTransformActions')

const indent = { kind: 'spaces', size: 2 } as const
const text = (): string | undefined => currentState('t')?.doc.toString()

beforeEach(() => {
  resetStore()
  useStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      'files.trimTrailingWhitespace': true,
      'files.insertFinalNewline': true,
      'files.trimFinalNewlines': true
    }
  })
})

afterEach(() => forgetDocument('t'))

describe('applySaveTransforms', () => {
  it('composes the formatter edits with the adjustments in a single transaction (one undo)', () => {
    loadDocument('t', 'let  a=1  \n\n\n', indent)
    // The formatter replaces `a=1` with `a = 1`; the adjustments apply to the already formatted text.
    const changed = applySaveTransforms('t', [{ from: 5, to: 8, insert: 'a = 1' }])
    expect(changed).toBe(true)
    expect(text()).toBe('let  a = 1\n')
    const state = states.get('t')
    if (!state) throw new Error('no state')
    undo({ state, dispatch: (tr) => states.set('t', tr.state) })
    expect(text()).toBe('let  a=1  \n\n\n')
  })

  it('with nothing to adjust leaves the document alone', () => {
    loadDocument('t', 'ok\n', indent)
    const before = currentState('t')
    expect(applySaveTransforms('t')).toBe(false)
    expect(currentState('t')).toBe(before)
  })

  it('on auto save the cursor line keeps its trailing whitespace', () => {
    loadDocument('t', 'a  \nb  ', indent)
    // The cursor starts at the beginning of the document (line 1).
    applySaveTransforms('t', [], { auto: true })
    expect(text()).toBe('a  \nb\n')
  })

  it('with the options off does nothing', () => {
    useStore.setState({ settings: DEFAULT_SETTINGS })
    loadDocument('t', 'a  \n\n', indent)
    expect(applySaveTransforms('t')).toBe(false)
  })
})
