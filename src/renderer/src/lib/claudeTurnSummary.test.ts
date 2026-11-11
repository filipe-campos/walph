import { describe, expect, it } from 'vitest'
import type { ClaudeBlock, ClaudeMessage } from '@shared/types'
import {
  filesChangedLabel,
  lineDiffCounts,
  turnChangedFiles,
  turnStartIndex,
  turnSummary,
  TURN_LCS_BUDGET,
  turnToastDescription
} from './claudeTurnSummary'

let seq = 0
const user = (text: string): ClaudeMessage => ({
  uuid: `u${++seq}`,
  role: 'user',
  blocks: [{ type: 'text', text }],
  parentToolUseId: null
})
const assistant = (...blocks: ClaudeBlock[]): ClaudeMessage => ({
  uuid: `a${++seq}`,
  role: 'assistant',
  blocks,
  parentToolUseId: null
})
const results = (...blocks: ClaudeBlock[]): ClaudeMessage => ({
  uuid: `r${++seq}`,
  role: 'user',
  blocks,
  parentToolUseId: null
})
const use = (toolUseId: string, name: string, input: unknown): ClaudeBlock => ({
  type: 'toolUse',
  toolUseId,
  name,
  input
})
const ok = (toolUseId: string, content = 'ok'): ClaudeBlock => ({
  type: 'toolResult',
  toolUseId,
  content,
  isError: false
})
const fail = (toolUseId: string): ClaudeBlock => ({ type: 'toolResult', toolUseId, content: 'x', isError: true })

describe('turnChangedFiles', () => {
  it('lists the files edited in the last turn, without repeats', () => {
    const messages = [
      user('antigo'),
      assistant(use('t0', 'Edit', { file_path: '/a/old.ts' })),
      user('novo'),
      assistant(use('t1', 'Edit', { file_path: '/a/x.ts' }), use('t2', 'Write', { file_path: '/a/y.ts' })),
      results(ok('t1'), ok('t2')),
      assistant(
        use('t3', 'MultiEdit', { file_path: '/a/x.ts' }),
        use('t4', 'NotebookEdit', { notebook_path: '/a/n.ipynb' })
      )
    ]
    expect(turnChangedFiles(messages)).toEqual(['/a/x.ts', '/a/y.ts', '/a/n.ipynb'])
  })

  it('ignores reads, edits with errors and result-only messages as the start of the turn', () => {
    const messages = [
      user('do it'),
      assistant(use('t1', 'Read', { file_path: '/a/r.ts' }), use('t2', 'Edit', { file_path: '/a/e.ts' })),
      results(ok('t1'), fail('t2'))
    ]
    expect(turnChangedFiles(messages)).toEqual([])
  })

  it('counts openDiff only if it was accepted', () => {
    const messages = [
      user('proponha'),
      assistant(
        use('d1', 'mcp__walph__openDiff', { filePath: '/a/ok.ts', newContents: '' }),
        use('d2', 'mcp__walph__openDiff', { filePath: '/a/no.ts', newContents: '' }),
        use('d3', 'mcp__walph__openDiff', { filePath: '/a/err.ts', newContents: '' }),
        use('d4', 'mcp__walph__openDiff', { filePath: '/a/pend.ts', newContents: '' })
      ),
      results(
        ok('d1', 'The user accepted the changes and the file was written.'),
        ok('d2', 'The user rejected the changes. Reason: no'),
        fail('d3')
      )
    ]
    expect(turnChangedFiles(messages)).toEqual(['/a/ok.ts'])
  })

  it('ignores a file without a path and unknown tools, and accepts filePath', () => {
    const messages = [
      user('do it'),
      assistant(
        use('t1', 'Edit', {}),
        use('t2', 'Edit', { file_path: '' }),
        use('t3', 'Bash', { file_path: '/a/b.ts' }),
        use('t4', 'Edit', null),
        use('t5', 'Write', { filePath: '/a/ok.ts' })
      )
    ]
    expect(turnChangedFiles(messages)).toEqual(['/a/ok.ts'])
  })

  it('a subagent message (parentToolUseId) does not start a new turn', () => {
    const sub: ClaudeMessage = { ...user('subagent task'), parentToolUseId: 'toolu_x' }
    const messages = [user('do it'), assistant(use('t1', 'Edit', { file_path: '/a/x.ts' })), sub]
    expect(turnChangedFiles(messages)).toEqual(['/a/x.ts'])
  })

  it('an edit still without a result (in progress) counts', () => {
    expect(turnChangedFiles([user('x'), assistant(use('t1', 'Edit', { file_path: '/a/x.ts' }))])).toEqual(['/a/x.ts'])
  })

  it('without a user message uses everything; empty gives empty', () => {
    expect(turnChangedFiles([])).toEqual([])
    expect(turnChangedFiles([assistant(use('t', 'Write', { file_path: '/a' }))])).toEqual(['/a'])
  })
})

describe('turnToastDescription', () => {
  it('omits, singularizes and pluralizes the count', () => {
    expect(turnToastDescription('Fix bug', 0)).toBe('Fix bug')
    expect(turnToastDescription('Fix bug', 1)).toBe('Fix bug · 1 arquivo alterado')
    expect(turnToastDescription('Fix bug', -1)).toBe('Fix bug')
    expect(turnToastDescription('Fix bug', 3)).toBe('Fix bug · 3 arquivos alterados')
  })
})

describe('lineDiffCounts', () => {
  it('counts new and removed lines', () => {
    expect(lineDiffCounts('', 'a\nb')).toEqual({ added: 2, removed: 0 })
    expect(lineDiffCounts('a\nb', '')).toEqual({ added: 0, removed: 2 })
    expect(lineDiffCounts('a', 'b')).toEqual({ added: 1, removed: 1 })
    expect(lineDiffCounts('', '')).toEqual({ added: 0, removed: 0 })
  })

  it('common lines do not count (LCS, not "everything replaced")', () => {
    expect(lineDiffCounts('a\nb\nc', 'a\nx\nb\nc')).toEqual({ added: 1, removed: 0 })
    expect(lineDiffCounts('a\nb\nc\nd', 'b\nd\ne')).toEqual({ added: 1, removed: 2 })
    // A common line in the middle, outside the prefix/suffix.
    expect(lineDiffCounts('x\nk\ny', 'p\nk\nq\nr')).toEqual({ added: 3, removed: 2 })
  })

  it('ignores the final line break and normalizes CRLF', () => {
    expect(lineDiffCounts('a\n', 'a')).toEqual({ added: 0, removed: 0 })
    expect(lineDiffCounts('a\r\nb\r\n', 'a\nc\n')).toEqual({ added: 1, removed: 1 })
  })

  it('identical text changes nothing', () => {
    expect(lineDiffCounts('a\nb', 'a\nb')).toEqual({ added: 0, removed: 0 })
  })
})

describe('turnSummary', () => {
  it('adds up Edit and MultiEdit per file with a real line diff', () => {
    const messages = [
      user('do it'),
      assistant(
        use('t1', 'Edit', { file_path: '/a/x.ts', old_string: 'a\nb', new_string: 'a\nb\nc' }),
        use('t2', 'MultiEdit', {
          file_path: '/a/x.ts',
          edits: [
            { old_string: 'k', new_string: 'm\nn' },
            { old_string: 'z\nw', new_string: '' }
          ]
        })
      ),
      results(ok('t1'), ok('t2'))
    ]
    expect(turnSummary(messages)).toEqual([
      { path: '/a/x.ts', added: 3, removed: 3, replaceAll: false, overwrite: false, uncounted: false }
    ])
  })

  it('replace_all is flagged', () => {
    const messages = [
      user('x'),
      assistant(use('t1', 'Edit', { file_path: '/a/x.ts', old_string: 'foo', new_string: 'bar', replace_all: true }))
    ]
    expect(turnSummary(messages)[0]).toMatchObject({ added: 1, removed: 1, replaceAll: true })
  })

  it('a new Write counts the lines as +; an overwrite flags unknown removals', () => {
    const messages = [
      user('x'),
      assistant(
        use('w1', 'Write', { file_path: '/a/new.ts', content: 'a\nb\nc\n' }),
        use('w2', 'Write', { file_path: '/a/old.ts', content: 'a\nb' })
      ),
      results(ok('w1', 'File created successfully at: /a/new.ts'), ok('w2', 'The file /a/old.ts has been updated.'))
    ]
    const [novo, velho] = turnSummary(messages)
    expect(novo).toMatchObject({ added: 3, removed: 0, overwrite: false })
    expect(velho).toMatchObject({ added: 2, removed: 0, overwrite: true })
  })

  it('ignores edits with errors/denied and reads; notebook and openDiff stay without a count', () => {
    const messages = [
      user('x'),
      assistant(
        use('t1', 'Edit', { file_path: '/a/e.ts', old_string: 'a', new_string: 'b' }),
        use('t2', 'Read', { file_path: '/a/r.ts' }),
        use('t3', 'NotebookEdit', { notebook_path: '/a/n.ipynb' }),
        use('t4', 'mcp__walph__openDiff', { filePath: '/a/d.ts', newContents: '' })
      ),
      results(fail('t1'), ok('t3'), ok('t4', 'The user accepted the changes.'))
    ]
    expect(turnSummary(messages)).toEqual([
      { path: '/a/n.ipynb', added: 0, removed: 0, replaceAll: false, overwrite: false, uncounted: true },
      { path: '/a/d.ts', added: 0, removed: 0, replaceAll: false, overwrite: false, uncounted: true }
    ])
  })

  it('only the last turn goes in', () => {
    const messages = [
      user('antigo'),
      assistant(use('t0', 'Edit', { file_path: '/a/old.ts', old_string: 'a', new_string: 'b' })),
      user('novo'),
      assistant(use('t1', 'Edit', { file_path: '/a/x.ts', old_string: 'a', new_string: 'b\nc' }))
    ]
    expect(turnSummary(messages).map((f) => f.path)).toEqual(['/a/x.ts'])
    expect(turnSummary([])).toEqual([])
  })
})

describe('turnStartIndex and filesChangedLabel', () => {
  it('turn start and label', () => {
    expect(turnStartIndex([user('a'), assistant(), user('b'), assistant()])).toBe(3)
    expect(turnStartIndex([])).toBe(0)
    expect(filesChangedLabel(1)).toBe('1 arquivo alterado')
    expect(filesChangedLabel(3)).toBe('3 arquivos alterados')
  })
})

describe('LCS budget per turn', () => {
  // Different prefix and suffix force the LCS; the common middle makes the exact result small.
  const shared = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n')
  const edit = (n: number): ClaudeBlock => ({
    type: 'toolUse',
    toolUseId: `e${n}`,
    name: 'Edit',
    input: { file_path: `/a/f${n}.ts`, old_string: `p\n${shared}\nq`, new_string: `r\n${shared}\ns` }
  })

  it('within the budget the count is exact; exhausted, it falls back to everything replaced', () => {
    const count = Math.floor(TURN_LCS_BUDGET / (1002 * 1002)) + 2
    const files = turnSummary([user('x'), assistant(...Array.from({ length: count }, (_, i) => edit(i)))])
    expect(files[0]).toMatchObject({ added: 2, removed: 2 })
    expect(files[count - 1]).toMatchObject({ added: 1002, removed: 1002 })
  })

  it('a giant edit never runs the LCS', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n')
    const other = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n')
    expect(lineDiffCounts(big, other)).toEqual({ added: 3000, removed: 3000 })
  })
})
