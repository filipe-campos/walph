import { describe, expect, it } from 'vitest'
import {
  parseBreakpointStatuses,
  parseCapabilities,
  parseContinued,
  parseEvaluate,
  parseOutput,
  parseScopes,
  parseStackFrames,
  parseStopped,
  parseThreads,
  parseVariables,
  responseErrorMessage
} from './normalize'

describe('normalize: capabilities', () => {
  it('reads the flags and the default exception filters', () => {
    const caps = parseCapabilities({
      supportsConfigurationDoneRequest: true,
      supportsConditionalBreakpoints: true,
      supportsTerminateRequest: 'yes',
      exceptionBreakpointFilters: [
        { filter: 'raised', default: false },
        { filter: 'uncaught', default: true },
        { default: true }
      ]
    })
    expect(caps.configurationDone).toBe(true)
    expect(caps.conditionalBreakpoints).toBe(true)
    expect(caps.terminate).toBe(false)
    expect(caps.exceptionBreakpoints).toBe(true)
    expect(caps.defaultExceptionFilters).toEqual(['uncaught'])
  })

  it('the `capabilities` event only changes what came in', () => {
    const first = parseCapabilities({ supportsRestartRequest: true })
    const next = parseCapabilities({ supportsLogPoints: true }, first)
    expect(next.restart).toBe(true)
    expect(next.logPoints).toBe(true)
  })
})

describe('normalize: responses', () => {
  it('prefers `error.format` with the variables filled in', () => {
    const response = {
      message: 'notStopped',
      body: { error: { format: 'Thread {id} did not stop', variables: { id: '3' } } }
    }
    expect(responseErrorMessage(response, 'next')).toBe('Thread 3 did not stop')
    expect(responseErrorMessage({ message: 'failed\nbadly' }, 'next')).toBe('failed badly')
    expect(responseErrorMessage({}, 'next')).toBe('next')
  })

  it('threads and frames: drops items without id, cleans texts and only accepts an absolute path', () => {
    expect(parseThreads({ threads: [{ id: 1, name: 'Main\u0007' }, { name: 'no id' }, { id: 2 }] })).toEqual([
      { id: 1, name: 'Main ' },
      { id: 2, name: '2' }
    ])
    const frames = parseStackFrames({
      stackFrames: [
        { id: 7, name: 'f', line: 3, column: 2, source: { path: '/p/a.py' } },
        { id: 8, name: 'g', line: 0, source: { path: 'rel.py', name: 'rel.py', presentationHint: 'deemphasize' } },
        { name: 'no id' }
      ]
    })
    expect(frames).toEqual([
      { id: 7, name: 'f', path: '/p/a.py', sourceName: 'a.py', line: 3, column: 2, hint: 'normal' },
      { id: 8, name: 'g', path: null, sourceName: 'rel.py', line: 1, column: 1, hint: 'subtle' }
    ])
  })

  it('scopes, variables and evaluation', () => {
    expect(
      parseScopes({
        scopes: [
          { name: 'Locals', variablesReference: 5 },
          { name: 'G', expensive: true }
        ]
      })
    ).toEqual([
      { name: 'Locals', variablesReference: 5, expensive: false },
      { name: 'G', variablesReference: 0, expensive: true }
    ])
    expect(
      parseVariables({ variables: [{ name: 'x', value: 'a\r\nb', type: 'str', variablesReference: -1 }] })
    ).toEqual([{ name: 'x', value: 'a\nb', type: 'str', variablesReference: 0 }])
    expect(parseEvaluate({ result: '42', variablesReference: 3 })).toEqual({
      result: '42',
      type: null,
      variablesReference: 3
    })
    expect(parseEvaluate(null)).toEqual({ result: '', type: null, variablesReference: 0 })
  })

  it('breakpoints: aligned with the request, with the actual line when the adapter moved it', () => {
    const { statuses, ids } = parseBreakpointStatuses(
      {
        breakpoints: [
          { id: 1, verified: true, line: 4 },
          { verified: false, message: 'no code' }
        ]
      },
      [3, 9, 12]
    )
    expect(statuses).toEqual([
      { line: 3, verified: true, actualLine: 4, message: null },
      { line: 9, verified: false, actualLine: null, message: 'no code' },
      { line: 12, verified: false, actualLine: null, message: null }
    ])
    expect(ids).toEqual([1, null, null])
  })
})

describe('normalize: events', () => {
  it('stopped and continued', () => {
    expect(
      parseStopped({ reason: 'exception', threadId: 2, text: 'ZeroDivisionError', allThreadsStopped: true })
    ).toEqual({
      threadId: 2,
      reason: 'exception',
      description: 'ZeroDivisionError',
      allThreadsStopped: true
    })
    expect(parseStopped(undefined)).toEqual({
      threadId: null,
      reason: 'pause',
      description: null,
      allThreadsStopped: false
    })
    expect(parseContinued({ threadId: 1 })).toEqual({ threadId: 1, allThreadsContinued: true })
    expect(parseContinued({ allThreadsContinued: false })).toEqual({ threadId: null, allThreadsContinued: false })
  })

  it('output: strips ANSI and control characters, drops telemetry and empty output', () => {
    expect(parseOutput({ category: 'stdout', output: '\u001b[31mred\u001b[0m\r\n' })).toEqual({
      category: 'stdout',
      text: 'red\n'
    })
    expect(parseOutput({ output: 'x' })).toEqual({ category: 'console', text: 'x' })
    expect(parseOutput({ category: 'telemetry', output: 'x' })).toBeNull()
    expect(parseOutput({ category: 'stdout', output: '' })).toBeNull()
    expect(parseOutput({ category: 'stdout' })).toBeNull()
  })
})
