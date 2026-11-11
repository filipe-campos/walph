import { describe, expect, it } from 'vitest'
import {
  INITIAL_SESSION_STATE,
  notificationContent,
  notifyMoment,
  reduceSession,
  viewChanged,
  type SessionInput,
  type SessionState
} from './sessionStatus'

const run = (inputs: SessionInput[], from: SessionState = INITIAL_SESSION_STATE): SessionState =>
  inputs.reduce(reduceSession, from)

describe('reduceSession', () => {
  it('starts idle and with no unread', () => {
    expect(INITIAL_SESSION_STATE).toMatchObject({ status: 'idle', unread: 0 })
  })

  it('working → running; result ok → done with 1 unread', () => {
    expect(run([{ type: 'working' }]).status).toBe('running')
    const done = run([{ type: 'working' }, { type: 'result', isError: false }, { type: 'idle' }])
    expect(done).toMatchObject({ status: 'done', unread: 1 })
  })

  it('an error result and error() count as a single failure', () => {
    const s = run([{ type: 'working' }, { type: 'result', isError: true }, { type: 'error' }])
    expect(s).toMatchObject({ status: 'error', unread: 1 })
  })

  it('an API error before the result does not count twice nor become done', () => {
    const err = run([{ type: 'working' }, { type: 'error' }, { type: 'result', isError: true }])
    expect(err).toMatchObject({ status: 'error', unread: 1 })
    const ok = run([{ type: 'working' }, { type: 'error' }, { type: 'result', isError: false }, { type: 'idle' }])
    expect(ok).toMatchObject({ status: 'error', unread: 1, signal: null })
  })

  it('error() alone (fail) becomes error and counts', () => {
    expect(run([{ type: 'working' }, { type: 'error' }, { type: 'closed' }])).toMatchObject({
      status: 'error',
      unread: 1
    })
  })

  it('a pending permission beats everything; resolving goes back to the previous status', () => {
    const asking = run([{ type: 'working' }, { type: 'permission', requestId: 'a' }])
    expect(asking).toMatchObject({ status: 'attention', unread: 1 })
    expect(reduceSession(asking, { type: 'permissionDone', requestId: 'a' }).status).toBe('running')
  })

  it('attention > error > running > done > idle', () => {
    const s = run([
      { type: 'working' },
      { type: 'error' },
      { type: 'permission', requestId: 'a' },
      { type: 'permission', requestId: 'b' }
    ])
    expect(s.status).toBe('attention')
    const one = reduceSession(s, { type: 'permissionDone', requestId: 'a' })
    expect(one.status).toBe('attention')
    expect(reduceSession(one, { type: 'permissionDone', requestId: 'b' }).status).toBe('error')
  })

  it('a new turn beats the previous done/error; error beats running; attention beats done', () => {
    const err = run([{ type: 'result', isError: true }, { type: 'working' }])
    expect(err.status).toBe('running')
    const failing = run([{ type: 'working' }, { type: 'error' }])
    expect(failing.status).toBe('error')
    const doneAsk = run([
      { type: 'working' },
      { type: 'result', isError: false },
      { type: 'permission', requestId: 'a' }
    ])
    expect(doneAsk.status).toBe('attention')
    expect(reduceSession(doneAsk, { type: 'permissionDone', requestId: 'a' }).status).toBe('done')
  })

  it('markRead with a pending request resets unread but keeps attention', () => {
    const s = run([{ type: 'permission', requestId: 'a' }, { type: 'markRead' }])
    expect(s).toMatchObject({ status: 'attention', unread: 0 })
  })

  it('markRead with nothing does not get a negative unread nor change the status', () => {
    const s = run([{ type: 'markRead' }, { type: 'markRead' }])
    expect(s).toMatchObject({ status: 'idle', unread: 0 })
  })

  it('different requests each count; permissionDone of an unknown id is ignored', () => {
    const s = run([
      { type: 'permission', requestId: 'a' },
      { type: 'permission', requestId: 'b' },
      { type: 'permissionDone', requestId: 'zzz' }
    ])
    expect(s).toMatchObject({ unread: 2, pending: ['a', 'b'] })
  })

  it('the same requestId does not count twice', () => {
    const s = run([
      { type: 'permission', requestId: 'a' },
      { type: 'permission', requestId: 'a' }
    ])
    expect(s.unread).toBe(1)
  })

  it('markRead resets unread and done becomes idle; error stays', () => {
    const done = run([{ type: 'working' }, { type: 'result', isError: false }, { type: 'idle' }, { type: 'markRead' }])
    expect(done).toMatchObject({ status: 'idle', unread: 0 })
    const err = run([{ type: 'working' }, { type: 'result', isError: true }, { type: 'markRead' }])
    expect(err).toMatchObject({ status: 'error', unread: 0 })
  })

  it('a new turn clears the previous error and done, keeping unread', () => {
    const s = run([{ type: 'working' }, { type: 'result', isError: true }, { type: 'working' }])
    expect(s).toMatchObject({ status: 'running', unread: 1 })
  })

  it('an interrupted turn is neither completion nor failure', () => {
    const s = run([{ type: 'working' }, { type: 'result', isError: true, interrupted: true }, { type: 'idle' }])
    expect(s).toMatchObject({ status: 'idle', unread: 0, signal: null })
  })

  it('unread accumulates across turns', () => {
    const turn: SessionInput[] = [{ type: 'working' }, { type: 'result', isError: false }, { type: 'idle' }]
    expect(run([...turn, ...turn]).unread).toBe(2)
  })

  it('a background task keeps running after the result and defers the done notice', () => {
    const s = run([
      { type: 'working' },
      { type: 'background', active: true },
      { type: 'result', isError: false },
      { type: 'idle' }
    ])
    expect(s).toMatchObject({ status: 'running', unread: 0, signal: null })
    // Agents finished: the CLI opens a turn with the report and its result is what notifies.
    const after = run(
      [{ type: 'background', active: false }, { type: 'working' }, { type: 'result', isError: false }],
      s
    )
    expect(after).toMatchObject({ status: 'done', unread: 1, signal: 'done' })
  })

  it('an error with a background task still notifies; closed resets the background', () => {
    const err = run([{ type: 'background', active: true }, { type: 'working' }, { type: 'result', isError: true }])
    expect(err).toMatchObject({ status: 'error', unread: 1 })
    expect(run([{ type: 'background', active: true }, { type: 'closed' }]).status).toBe('idle')
  })

  it('closed clears pending requests', () => {
    const s = run([{ type: 'permission', requestId: 'a' }, { type: 'closed' }])
    expect(s.pending).toEqual([])
    expect(s.status).toBe('idle')
  })
})

describe('notifyMoment / viewChanged', () => {
  it('notifies when entering done, attention and error', () => {
    expect(notifyMoment(run([{ type: 'working' }, { type: 'result', isError: false }]))).toBe('done')
    expect(notifyMoment(run([{ type: 'permission', requestId: 'a' }]))).toBe('attention')
    expect(notifyMoment(run([{ type: 'working' }, { type: 'result', isError: true }]))).toBe('error')
  })

  it('does not notify on transitions without an unread increase', () => {
    const done = run([{ type: 'working' }, { type: 'result', isError: false }])
    expect(notifyMoment(reduceSession(done, { type: 'idle' }))).toBeNull()
    expect(notifyMoment(reduceSession(done, { type: 'markRead' }))).toBeNull()
  })

  it('done with a pending request does not notify over attention', () => {
    const s = run([
      { type: 'permission', requestId: 'a' },
      { type: 'result', isError: false }
    ])
    expect(s.unread).toBe(2)
    expect(notifyMoment(s)).toBeNull()
  })

  it('viewChanged only looks at status and unread', () => {
    const a = run([{ type: 'working' }])
    expect(viewChanged(a, reduceSession(a, { type: 'working' }))).toBe(false)
    expect(viewChanged(a, reduceSession(a, { type: 'idle' }))).toBe(true)
  })
})

describe('notificationContent', () => {
  it('uses the fixed titles and the session name as the body', () => {
    expect(notificationContent('done', 'Fix bug')).toEqual({ title: 'Claude Code terminou', body: 'Fix bug' })
    expect(notificationContent('attention', 'x').title).toBe('Claude Code precisa de você')
    expect(notificationContent('error', 'x').title).toBe('Claude Code falhou')
  })

  it('a question only changes the attention title', () => {
    expect(notificationContent('attention', 'x', true).title).toBe('Claude Code tem uma pergunta')
    expect(notificationContent('done', 'x', true).title).toBe('Claude Code terminou')
    const s = run([{ type: 'permission', requestId: 'a', question: true }])
    expect(s).toMatchObject({ status: 'attention', question: true })
    expect(run([{ type: 'permission', requestId: 'a' }]).question).toBe(false)
  })

  it('truncates, removes controls and falls back to "Nova conversa"', () => {
    expect(notificationContent('done', 'a'.repeat(200)).body).toHaveLength(80)
    expect(notificationContent('done', 'line1\nline2\u0007').body).toBe('line1 line2')
    expect(notificationContent('done', '  ').body).toBe('Nova conversa')
  })
})
