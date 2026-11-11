import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeSessionStore, type StoredMessage } from './sessionStore'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'walph-fakestore-'))
  file = join(dir, 'store.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

type Input = Omit<StoredMessage, 'session_id'>
const user = (uuid: string, content: unknown): Input => ({
  type: 'user',
  uuid,
  message: { role: 'user', content },
  parent_tool_use_id: null
})
const assistant = (uuid: string): Input => ({
  type: 'assistant',
  uuid,
  message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  parent_tool_use_id: null
})

function seeded(path: string | null = null): FakeSessionStore {
  const store = new FakeSessionStore(path)
  store.append('s1', '/p', user('u1', 'first prompt'))
  store.append('s1', '/p', assistant('a1'))
  store.append('s1', '/p', user('u2', 'second'))
  return store
}

describe('FakeSessionStore', () => {
  it('the session comes into existence on the first message and keeps the first prompt', () => {
    const store = seeded()
    expect(store.info('s1')).toMatchObject({
      sessionId: 's1',
      cwd: '/p',
      firstPrompt: 'first prompt',
      summary: 'first prompt'
    })
    expect(store.info('nothing')).toBeUndefined()
    expect(store.messages('s1').map((m) => [m.uuid, m.session_id])).toEqual([
      ['u1', 's1'],
      ['a1', 's1'],
      ['u2', 's1']
    ])
  })

  it('the first prompt ignores injected blocks and images, using the first typed text', () => {
    const store = new FakeSessionStore(null)
    store.append(
      's',
      '/p',
      user('u', [
        { type: 'text', text: '<ide_opened_file>a.ts</ide_opened_file>' },
        { type: 'image', source: {} },
        { type: 'text', text: 'real question' }
      ])
    )
    expect(store.info('s')?.firstPrompt).toBe('real question')
  })

  it('without typed text there is no first prompt and the summary is the generic one', () => {
    const store = new FakeSessionStore(null)
    store.append('s', '/p', user('u', [{ type: 'text', text: '<attached_file path="x">' }]))
    store.append('t', '/p', assistant('a'))
    expect(store.info('s')).not.toHaveProperty('firstPrompt')
    expect(store.info('s')?.summary).toBe('Test session')
    expect(store.info('t')?.summary).toBe('Test session')
  })

  it('the user-defined title wins over the summary', () => {
    const store = seeded()
    store.rename('s1', 'My title')
    expect(store.info('s1')).toMatchObject({ customTitle: 'My title', summary: 'My title' })
  })

  it('renaming a missing session fails like the real SDK', () => {
    expect(() => new FakeSessionStore(null).rename('x', 't')).toThrow('Session x not found')
  })

  it('messages returns copies: changing the result does not change the store', () => {
    const store = seeded()
    store.messages('s1')[0].uuid = 'mutated'
    expect(store.messages('s1')[0].uuid).toBe('u1')
    expect(store.messages('nothing')).toEqual([])
  })

  describe('list', () => {
    function twoSessions(): FakeSessionStore {
      const store = new FakeSessionStore(null)
      store.append('a', '/p', user('1', 'A'))
      store.append('b', '/q', user('2', 'B'))
      store.append('c', '/p', user('3', 'C'))
      return store
    }

    it('sorts from most recent to oldest, even in the same millisecond', () => {
      expect(
        twoSessions()
          .list(undefined)
          .map((s) => s.sessionId)
      ).toEqual(['c', 'b', 'a'])
    })

    it('filters by folder', () => {
      expect(
        twoSessions()
          .list('/p')
          .map((s) => s.sessionId)
      ).toEqual(['c', 'a'])
    })

    it('paginates with limit and offset', () => {
      const store = twoSessions()
      expect(store.list(undefined, 2).map((s) => s.sessionId)).toEqual(['c', 'b'])
      expect(store.list(undefined, 2, 1).map((s) => s.sessionId)).toEqual(['b', 'a'])
      expect(store.list(undefined, undefined, 2).map((s) => s.sessionId)).toEqual(['a'])
    })

    it('a new message brings the session to the top', () => {
      const store = twoSessions()
      store.append('a', '/p', assistant('x'))
      expect(store.list(undefined)[0].sessionId).toBe('a')
    })
  })

  describe('open (rewind)', () => {
    it('drops the messages after the resume point', () => {
      const store = seeded()
      store.open('s1', 'a1')
      expect(store.messages('s1').map((m) => m.uuid)).toEqual(['u1', 'a1'])
    })

    it('without resumeAt, with an unknown uuid, the last message or a missing session nothing changes', () => {
      const store = seeded()
      store.open('s1')
      store.open('s1', 'does-not-exist')
      store.open('s1', 'u2')
      store.open('nothing', 'u1')
      expect(store.messages('s1')).toHaveLength(3)
    })
  })

  describe('fork', () => {
    it('copies the messages with new uuids and a new session, keeping the original', () => {
      const store = seeded()
      const { sessionId } = store.fork('s1')
      expect(sessionId).not.toBe('s1')
      const copy = store.messages(sessionId)
      expect(copy.map((m) => m.type)).toEqual(['user', 'assistant', 'user'])
      expect(copy.every((m) => m.session_id === sessionId)).toBe(true)
      expect(copy.map((m) => m.uuid)).not.toContain('u1')
      expect(store.messages('s1')).toHaveLength(3)
      expect(store.info(sessionId)).toMatchObject({ cwd: '/p', customTitle: 'first prompt (fork)' })
    })

    it('upToMessageId cuts the copy at the given message', () => {
      const store = seeded()
      const { sessionId } = store.fork('s1', { upToMessageId: 'a1', title: 'Branch' })
      expect(store.messages(sessionId)).toHaveLength(2)
      expect(store.info(sessionId)?.customTitle).toBe('Branch')
    })

    it('unknown upToMessageId copies everything', () => {
      const store = seeded()
      expect(store.messages(store.fork('s1', { upToMessageId: 'no' }).sessionId)).toHaveLength(3)
    })

    it('the fork shows up in the list and uses the source custom title in the suffix', () => {
      const store = seeded()
      store.rename('s1', 'Base')
      const { sessionId } = store.fork('s1')
      expect(store.info(sessionId)?.customTitle).toBe('Base (fork)')
      expect(store.list(undefined)[0].sessionId).toBe(sessionId)
    })

    it('fails if the source does not exist', () => {
      expect(() => new FakeSessionStore(null).fork('x')).toThrow('Session x not found')
    })
  })

  describe('persistence', () => {
    it('writes on every change and another store reads the same state', () => {
      const store = seeded(file)
      store.rename('s1', 'Title')
      const reopened = new FakeSessionStore(file)
      expect(reopened.info('s1')).toMatchObject({ customTitle: 'Title', firstPrompt: 'first prompt' })
      expect(reopened.messages('s1')).toHaveLength(3)
    })

    it('the rewind is persisted', () => {
      seeded(file).open('s1', 'u1')
      expect(new FakeSessionStore(file).messages('s1')).toHaveLength(1)
    })

    it('without a file or with an unreadable file it starts empty', () => {
      expect(new FakeSessionStore(file).list(undefined)).toEqual([])
      writeFileSync(file, '{ not json')
      expect(new FakeSessionStore(file).list(undefined)).toEqual([])
    })

    it('ignores invalid entries of the file', () => {
      writeFileSync(
        file,
        JSON.stringify({
          sessions: [null, { sessionId: 1, messages: [] }, { sessionId: 'ok', messages: [] }, { sessionId: 'x' }]
        })
      )
      expect(new FakeSessionStore(file).list(undefined).map((s) => s.sessionId)).toEqual(['ok'])
    })

    it('in-memory mode (null) creates no file', () => {
      seeded(null)
      expect(readdirSync(dir)).toEqual([])
    })
  })
})
