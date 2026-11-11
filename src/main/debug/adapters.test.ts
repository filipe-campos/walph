import { describe, expect, it } from 'vitest'
import { resolveAdapter, withPort } from './adapters'
import { parseRunInTerminal } from './runInTerminal'
import { parseSourceBreakpoints, parseStartOptions } from './validate'

describe('resolveAdapter', () => {
  it('built-in python (debugpy) when there is no configuration', () => {
    expect(resolveAdapter('python', undefined, 'linux')).toEqual({
      id: 'python',
      command: 'python3',
      args: ['-m', 'debugpy.adapter'],
      transport: 'stdio',
      env: {},
      builtin: true
    })
    expect(resolveAdapter('debugpy', {}, 'win32')?.command).toBe('python')
  })

  it('the user configuration wins over the built-in one and the aliases (`pwa-node` → `node`)', () => {
    const setting = {
      python: { command: '/venv/bin/python', args: ['-m', 'debugpy.adapter'] },
      node: { command: 'node', args: ['/js-debug/src/dapDebugServer.js', '${port}'], transport: 'tcp' as const }
    }
    expect(resolveAdapter('python', setting)?.command).toBe('/venv/bin/python')
    expect(resolveAdapter('python', setting)?.builtin).toBe(false)
    expect(resolveAdapter('pwa-node', setting)).toMatchObject({ id: 'node', transport: 'tcp' })
  })

  it('type without adapter and prototype keys = none', () => {
    expect(resolveAdapter('go', {})).toBeNull()
    expect(resolveAdapter('node', undefined)).toBeNull()
    expect(resolveAdapter('constructor', {})).toBeNull()
  })

  it('replaces `${port}` in the arguments', () => {
    expect(withPort(['a.js', '${port}', '--p=${port}'], 4711)).toEqual(['a.js', '4711', '--p=4711'])
  })
})

describe('renderer validation', () => {
  it('start options: drops what is invalid', () => {
    expect(parseStartOptions({ noDebug: true, file: '/p/a.py', line: 3.9, selectedText: 'x' })).toEqual({
      noDebug: true,
      file: '/p/a.py',
      line: 3,
      selectedText: 'x'
    })
    expect(parseStartOptions({ noDebug: 'yes', file: 'rel.py', line: 0 })).toEqual({})
    expect(parseStartOptions(null)).toEqual({})
  })

  it('breakpoints: positive integer lines, no duplicates, empty texts dropped', () => {
    expect(
      parseSourceBreakpoints([
        { line: 3, condition: 'x > 1' },
        { line: 3 },
        { line: 0 },
        { line: 1.5 },
        { line: 9, condition: '  ', logMessage: 'v={v}' },
        'x'
      ])
    ).toEqual([
      { line: 3, condition: 'x > 1' },
      { line: 9, logMessage: 'v={v}' }
    ])
    expect(parseSourceBreakpoints('x')).toBeNull()
  })
})

describe('parseRunInTerminal', () => {
  it('splits the executable, uses the view folder without cwd and cleans the title', () => {
    expect(
      parseRunInTerminal(
        { kind: 'integrated', title: 'Python\nDebug', args: ['/usr/bin/python3', 'app.py'], env: { A: '1', B: null } },
        '/w'
      )
    ).toEqual({
      file: '/usr/bin/python3',
      args: ['app.py'],
      cwd: '/w',
      env: { A: '1', B: null },
      title: 'Python Debug'
    })
  })

  it('rejects empty or non-text args, an invalid environment and no folder at all', () => {
    expect(parseRunInTerminal({ args: [] }, '/w')).toBeNull()
    expect(parseRunInTerminal({ args: ['a', 1] }, '/w')).toBeNull()
    expect(parseRunInTerminal({ args: ['a'], env: { 'A=B': '1' } }, '/w')).toBeNull()
    expect(parseRunInTerminal({ args: ['a'], cwd: 'rel' }, null)).toBeNull()
    expect(parseRunInTerminal({ args: ['a'], cwd: '/x' }, null)?.cwd).toBe('/x')
  })
})
