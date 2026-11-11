import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi } from './test/fakeApi'

// `saveActions.ts` reads `window.api` on load: the stub must exist before the import.
installFakeApi()

const { useStore } = await import('./store')
const { withAutoSaveSuspended, handleCloseRequested, handleCloseAborted } = await import('./saveActions')

const suspended = (): boolean => useStore.getState().confirmingSave

beforeEach(() => {
  handleCloseAborted()
  useStore.setState({ tabs: [], confirmingSave: false })
})

describe('withAutoSaveSuspended', () => {
  it('suspends while running and resumes when done', async () => {
    let during = false
    await withAutoSaveSuspended(async () => {
      during = suspended()
    })
    expect(during).toBe(true)
    expect(suspended()).toBe(false)
  })

  it('nested: only resumes when the last one ends', async () => {
    let afterInner = false
    await withAutoSaveSuspended(async () => {
      await withAutoSaveSuspended(async () => {})
      afterInner = suspended()
    })
    expect(afterInner).toBe(true)
    expect(suspended()).toBe(false)
  })

  it('resumes even when fn fails', async () => {
    await expect(
      withAutoSaveSuspended(async () => {
        throw new Error('x')
      })
    ).rejects.toThrow('x')
    expect(suspended()).toBe(false)
  })
})

describe('window closing', () => {
  it('a confirmed close keeps auto save suspended even after another dialog ends', async () => {
    await handleCloseRequested()
    expect(suspended()).toBe(true)
    await withAutoSaveSuspended(async () => {})
    expect(suspended()).toBe(true)
  })

  it('a close aborted in another window releases auto save', async () => {
    await handleCloseRequested()
    handleCloseAborted()
    expect(suspended()).toBe(false)
  })

  it('aborting with a dialog still open does not release too early', async () => {
    await handleCloseRequested()
    let during = false
    await withAutoSaveSuspended(async () => {
      handleCloseAborted()
      during = suspended()
    })
    expect(during).toBe(true)
    expect(suspended()).toBe(false)
  })
})
