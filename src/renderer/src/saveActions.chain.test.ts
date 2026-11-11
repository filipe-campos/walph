import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

// Fake disk: each write only finishes when the test says so, in whatever order it wants.
const writes: { text: string; finish: () => void }[] = []
let doc = 'v1'
let disk = ''
let failNext = false
vi.mock('./components/editor/documentState', () => ({
  hasDocument: () => {
    if (!failNext) return true
    failNext = false
    throw new Error('failed')
  }
}))
vi.mock('./components/editor/groupViews', () => ({ currentState: () => undefined }))
vi.mock('./components/editor/documentConfig', () => ({ setDocumentIndent: () => {} }))
vi.mock('./components/editor/documentStore', () => ({
  saveDocument: async () => {
    const text = doc
    await new Promise<void>((finish) => writes.push({ text, finish }))
    disk = text
    return false
  }
}))

const { useStore } = await import('./store')
const { saveTab } = await import('./saveActions')

beforeEach(() => {
  writes.length = 0
  doc = 'v1'
  disk = ''
  failNext = false
  useStore.setState({
    tabs: [{ id: 'a', kind: 'file', path: '/p/a', dirty: true, eol: 'LF' }] as never
  })
})

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('concurrent saveTab', () => {
  it('the second write waits for the first and the disk ends with the newest text', async () => {
    const first = saveTab('a')
    await tick()
    doc = 'v2'
    const second = saveTab('a')
    await tick()
    expect(writes).toHaveLength(1)
    writes[0].finish()
    await first
    await tick()
    expect(writes).toHaveLength(2)
    writes[1].finish()
    await second
    expect(disk).toBe('v2')
    expect(useStore.getState().tabs[0]).toMatchObject({ dirty: false })
  })

  it('different tabs do not wait for each other', async () => {
    useStore.setState({
      tabs: [
        { id: 'a', kind: 'file', path: '/p/a', dirty: true, eol: 'LF' },
        { id: 'b', kind: 'file', path: '/p/b', dirty: true, eol: 'LF' }
      ] as never
    })
    const a = saveTab('a')
    const b = saveTab('b')
    await tick()
    expect(writes).toHaveLength(2)
    writes.forEach((w) => w.finish())
    await Promise.all([a, b])
  })

  it('a write that rejects does not drop the queued one', async () => {
    failNext = true
    const first = saveTab('a')
    doc = 'v2'
    const second = saveTab('a')
    await expect(first).rejects.toThrow('failed')
    await tick()
    expect(writes).toHaveLength(1)
    writes[0].finish()
    await expect(second).resolves.toBe(true)
    expect(disk).toBe('v2')
  })
})
