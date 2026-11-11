import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import {
  type Harness,
  canUse,
  flush,
  lastRequest,
  of,
  promptInput,
  setup,
  toolOpts,
  useTempRoot
} from '../testing/fakeQuery'

const dir = useTempRoot()

describe('ClaudeConversation - tool permissions', () => {
  it('round trip: canUseTool emits permission and respond releases with allow', async () => {
    const h = setup()
    await h.conv.start()
    const suggestions = [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }]
    const pending = canUse(h)('Bash', { command: 'ls' }, toolOpts({ title: 'Claude wants to run ls', suggestions }))
    await flush()
    const req = lastRequest(h)
    expect(req).toMatchObject({ kind: 'tool', toolName: 'Bash', title: 'Claude wants to run ls', canAlwaysAllow: true })
    h.conv.respond(req.requestId, { behavior: 'allow' })
    expect(await pending).toEqual({ behavior: 'allow', updatedInput: { command: 'ls' } })
    await h.conv.close()
  })

  it('always allow returns the CLI suggestions; suppressAlwaysAllowRule ignores them', async () => {
    const h = setup()
    await h.conv.start()
    const suggestions = [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }]
    const p1 = canUse(h)('Bash', {}, toolOpts({ suggestions }))
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow', always: true })
    expect(await p1).toMatchObject({ behavior: 'allow', updatedPermissions: suggestions })

    const p2 = canUse(h)('Bash', {}, toolOpts({ suggestions, suppressAlwaysAllowRule: true }))
    await flush()
    expect(lastRequest(h)).toMatchObject({ canAlwaysAllow: false })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow', always: true })
    expect(await p2).not.toHaveProperty('updatedPermissions')
    await h.conv.close()
  })

  it('rejecting carries the user message', async () => {
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Bash', {}, toolOpts())
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny', message: ' use another command ' })
    expect(await p).toEqual({
      behavior: 'deny',
      message: 'The user rejected this tool call. User comment: use another command'
    })
    const p2 = canUse(h)('Bash', {}, toolOpts())
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
    expect(await p2).toEqual({ behavior: 'deny', message: 'The user rejected this tool call.' })
    await h.conv.close()
  })

  describe('AskUserQuestion', () => {
    const questions = [
      {
        question: 'Which?',
        header: 'Lib',
        options: [{ label: 'A' }, { label: 'B', description: 'bee' }],
        multiSelect: false
      },
      { question: 'Which ones?', header: 'Extras', options: [{ label: 'X' }, { label: 'Y' }], multiSelect: true }
    ]
    const ask = async (h: Harness, input: Record<string, unknown> = { questions }) => {
      const p = canUse(h)('AskUserQuestion', input, toolOpts())
      await flush()
      return p
    }

    it('is no longer disabled and emits a request of kind question', async () => {
      const h = setup()
      await h.conv.start()
      expect(h.queries[0].params.options.disallowedTools).toBeUndefined()
      const p = canUse(h)('AskUserQuestion', { questions }, toolOpts())
      await flush()
      const req = lastRequest(h)
      expect(req).toMatchObject({ kind: 'question' })
      if (req.kind !== 'question') throw new Error('kind')
      expect(req.questions.map((q) => q.id)).toEqual(['q1', 'q2'])
      expect(req.questions[0].options[0]).toEqual({ label: 'A', description: '' })
      h.conv.respond(req.requestId, { behavior: 'skip' })
      await p
      await h.conv.close()
    })

    it('answer becomes allow with updatedInput.answers keyed by the question text', async () => {
      const h = setup()
      await h.conv.start()
      const p = canUse(h)('AskUserQuestion', { questions, extra: 1 }, toolOpts())
      await flush()
      h.conv.respond(lastRequest(h).requestId, { behavior: 'answer', answers: { q1: ['A'], q2: ['X', 'free text'] } })
      expect(await p).toEqual({
        behavior: 'allow',
        updatedInput: { questions, extra: 1, answers: { 'Which?': 'A', 'Which ones?': 'X, free text' } }
      })
      await h.conv.close()
    })

    it('works in acceptEdits (does not depend on the mode)', async () => {
      const h = setup({ permissionMode: 'acceptEdits' })
      await h.conv.start()
      const p = canUse(h)('AskUserQuestion', { questions }, toolOpts())
      await flush()
      expect(lastRequest(h).kind).toBe('question')
      h.conv.respond(lastRequest(h).requestId, { behavior: 'skip' })
      await p
      await h.conv.close()
    })

    it('skip denies WITHOUT interrupt', async () => {
      const h = setup()
      await h.conv.start()
      const p = canUse(h)('AskUserQuestion', { questions }, toolOpts())
      await flush()
      h.conv.respond(lastRequest(h).requestId, { behavior: 'skip' })
      const result = await p
      expect(result).toMatchObject({ behavior: 'deny', message: expect.stringContaining('decide on your own') })
      expect(result).not.toHaveProperty('interrupt')
      await h.conv.close()
    })

    it('interrupt cancels with permissionCancelled', async () => {
      const h = setup()
      await h.conv.start()
      const p = canUse(h)('AskUserQuestion', { questions }, toolOpts())
      await flush()
      const id = lastRequest(h).requestId
      await h.conv.interrupt()
      expect(await p).toMatchObject({ behavior: 'deny', interrupt: true })
      expect(of(h, 'permissionCancelled')[0].requestId).toBe(id)
      await h.conv.close()
    })

    it('malformed input denies without emitting a request or throwing', async () => {
      const h = setup()
      await h.conv.start()
      for (const input of [
        {},
        { questions: [] },
        { questions: [{ question: 'x', options: [], multiSelect: 'yes' }] }
      ]) {
        const result = await ask(h, input)
        expect(result).toMatchObject({ behavior: 'deny', message: expect.stringContaining('AskUserQuestion') })
        expect(result).not.toHaveProperty('interrupt')
      }
      expect(of(h, 'permission')).toHaveLength(0)
      await h.conv.close()
    })

    it('invalid answers or allow/deny are ignored and the request stays pending', async () => {
      const h = setup()
      await h.conv.start()
      let settled = false
      const p = canUse(h)('AskUserQuestion', { questions }, toolOpts()).finally(() => (settled = true))
      await flush()
      const id = lastRequest(h).requestId
      h.conv.respond(id, { behavior: 'allow' })
      h.conv.respond(id, { behavior: 'deny' })
      h.conv.respond(id, { behavior: 'answer', answers: { q1: ['A'] } })
      h.conv.respond(id, { behavior: 'answer', answers: { q1: ['A', 'B'], q2: ['X'] } })
      await flush()
      expect(settled).toBe(false)
      h.conv.respond(id, { behavior: 'answer', answers: { q1: ['B'], q2: ['Y'] } })
      expect((await p).behavior).toBe('allow')
      await h.conv.close()
    })

    it('a rejected answer returns false and the request stays pending; an accepted one returns true', async () => {
      const h = setup()
      await h.conv.start()
      const p = canUse(h)('AskUserQuestion', { questions }, toolOpts())
      await flush()
      const req = lastRequest(h)
      expect(h.conv.respond(req.requestId, { behavior: 'answer', answers: { q1: ['A', 'B'], q2: ['X'] } })).toBe(false)
      expect(h.conv.respond(req.requestId, { behavior: 'allow' })).toBe(false)
      expect(of(h, 'permission')).toHaveLength(1)
      expect(h.conv.respond(req.requestId, { behavior: 'answer', answers: { q1: ['A'], q2: ['X', 'X', ' X '] } })).toBe(
        true
      )
      expect(await p).toMatchObject({ updatedInput: { answers: { 'Which?': 'A', 'Which ones?': 'X' } } })
      expect(h.conv.respond(req.requestId, { behavior: 'skip' })).toBe(true)
      await h.conv.close()
    })
  })

  it('interrupt cancels the pending requests and calls query.interrupt', async () => {
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Bash', {}, toolOpts())
    await flush()
    const id = lastRequest(h).requestId
    await h.conv.interrupt()
    expect(h.queries[0].interrupt).toHaveBeenCalled()
    expect(await p).toMatchObject({ behavior: 'deny', interrupt: true })
    expect(of(h, 'permissionCancelled')[0].requestId).toBe(id)
    await h.conv.close()
  })

  it('close cancels pending requests, closes the query and emits closed; canUseTool after closing denies', async () => {
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Bash', {}, toolOpts())
    await flush()
    await h.conv.close()
    expect(await p).toMatchObject({ behavior: 'deny', interrupt: true })
    expect(of(h, 'permissionCancelled')).toHaveLength(1)
    expect(h.queries[0].close).toHaveBeenCalled()
    expect(of(h, 'status').at(-1)!.status).toBe('closed')
    expect(await canUse(h)('Bash', {}, toolOpts())).toMatchObject({ behavior: 'deny', interrupt: true })
    // Closing again is harmless and the end of the iterator does not become an error.
    await h.conv.close()
    await flush()
    expect(of(h, 'error')).toHaveLength(0)
  })

  it('an interrupt the CLI does not honor within 8 s ends the conversation with error process', async () => {
    vi.useFakeTimers()
    try {
      const h = setup()
      await h.conv.start()
      await vi.advanceTimersByTimeAsync(0)
      await h.conv.send(promptInput('hi'))
      await h.conv.interrupt()
      await vi.advanceTimersByTimeAsync(8100)
      expect(of(h, 'error')[0].error.code).toBe('process')
      expect(of(h, 'status').at(-1)!.status).toBe('closed')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ClaudeConversation - edit approval', () => {
  it('Edit inside the folder emits kind edit with original and proposed; accepting releases', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'a.ts')
    await writeFile(file, 'const a = 1\n')
    const input = { file_path: file, old_string: 'a = 1', new_string: 'a = 2' }
    const p = canUse(h)('Edit', input, toolOpts())
    await flush()
    expect(lastRequest(h)).toMatchObject({
      kind: 'edit',
      toolName: 'Edit',
      path: file,
      original: 'const a = 1\n',
      proposed: 'const a = 2\n',
      isNewFile: false
    })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    expect(await p).toEqual({ behavior: 'allow', updatedInput: input })
    await h.conv.close()
  })

  it('a relative path is resolved against the folder; Write to a new file sets isNewFile', async () => {
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Write', { file_path: 'new/x.txt', content: 'hi' }, toolOpts())
    await flush()
    expect(lastRequest(h)).toMatchObject({
      kind: 'edit',
      path: join(dir.root, 'new/x.txt'),
      original: '',
      proposed: 'hi',
      isNewFile: true
    })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    await p
    await h.conv.close()
  })

  it('MultiEdit on a CRLF file proposes the text with CRLF', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'crlf.txt')
    await writeFile(file, 'a\r\nb\r\n')
    const p = canUse(h)(
      'MultiEdit',
      { file_path: file, edits: [{ old_string: 'a\nb', new_string: 'a\nc' }] },
      toolOpts()
    )
    await flush()
    expect(lastRequest(h)).toMatchObject({ kind: 'edit', proposed: 'a\r\nc\r\n' })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
    await p
    await h.conv.close()
  })

  it('rejecting the edit carries the reason', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'a.ts')
    await writeFile(file, 'x')
    const p = canUse(h)('Edit', { file_path: file, old_string: 'x', new_string: 'y' }, toolOpts())
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny', message: 'I prefer another name' })
    expect(await p).toEqual({
      behavior: 'deny',
      message: 'The user rejected this edit. User comment: I prefer another name'
    })
    await h.conv.close()
  })

  it('falls back to the tool card when old_string does not exist', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'a.ts')
    await writeFile(file, 'abc')
    const p = canUse(h)('Edit', { file_path: file, old_string: 'zzz', new_string: 'y' }, toolOpts())
    await flush()
    expect(lastRequest(h)).toMatchObject({ kind: 'tool', toolName: 'Edit' })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    expect((await p).behavior).toBe('allow')
    await h.conv.close()
  })

  it('falls back to the tool card for a file outside the folder (does not read the outside disk)', async () => {
    const h = setup()
    await h.conv.start()
    const outside = await mkdtemp(join(tmpdir(), 'walph-outside-'))
    try {
      await writeFile(join(outside, 'secret.txt'), 'SECRET_CONTENT')
      const p = canUse(h)(
        'Edit',
        { file_path: join(outside, 'secret.txt'), old_string: 'SECRET', new_string: 'x' },
        toolOpts()
      )
      await flush()
      const req = lastRequest(h)
      expect(req.kind).toBe('tool')
      expect(JSON.stringify(req)).not.toContain('SECRET_CONTENT') // the outside content does not leak into the request
      h.conv.respond(req.requestId, { behavior: 'deny' })
      await p
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
    await h.conv.close()
  })

  it('falls back to the tool card for a binary file', async () => {
    const h = setup()
    await h.conv.start()
    await mkdir(join(dir.root, 'sub'))
    const bin = join(dir.root, 'sub/b.bin')
    await writeFile(bin, Buffer.from([1, 0, 2, 0]))
    const p = canUse(h)('Edit', { file_path: bin, old_string: 'a', new_string: 'b' }, toolOpts())
    await flush()
    expect(lastRequest(h).kind).toBe('tool')
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
    await p
    await h.conv.close()
  })
})

// symlink requires developer/admin mode on Windows
describe.skipIf(process.platform === 'win32')('ClaudeConversation - edit with symlink', () => {
  it('a symlink inside the folder pointing outside falls back to the tool card', async () => {
    const h = setup()
    await h.conv.start()
    const outside = await mkdtemp(join(tmpdir(), 'walph-outside-'))
    try {
      await writeFile(join(outside, 'target.txt'), 'SECRET_CONTENT')
      await symlink(join(outside, 'target.txt'), join(dir.root, 'shortcut.txt'))
      const p = canUse(h)(
        'Edit',
        { file_path: join(dir.root, 'shortcut.txt'), old_string: 'SECRET', new_string: 'x' },
        toolOpts()
      )
      await flush()
      expect(lastRequest(h).kind).toBe('tool')
      expect(JSON.stringify(lastRequest(h))).not.toContain('SECRET_CONTENT')
      h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
      await p
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
    await h.conv.close()
  })
})

describe('ClaudeConversation - plan', () => {
  it('approving the plan changes the mode and releases with setMode in the session', async () => {
    const h = setup({ permissionMode: 'plan' })
    await h.conv.start()
    const input = { plan: '# Plan\n1. do it' }
    const p = canUse(h)('ExitPlanMode', input, toolOpts())
    await flush()
    const req = lastRequest(h)
    expect(req).toMatchObject({ kind: 'plan', plan: '# Plan\n1. do it' })
    h.conv.respond(req.requestId, { behavior: 'allow', mode: 'acceptEdits' })
    expect(await p).toEqual({
      behavior: 'allow',
      updatedInput: input,
      updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
    })
    expect(of(h, 'permissionMode').at(-1)).toMatchObject({ mode: 'acceptEdits' })
    await h.conv.close()
  })

  it('approving without a chosen mode goes back to default', async () => {
    const h = setup({ permissionMode: 'plan' })
    await h.conv.start()
    const p = canUse(h)('ExitPlanMode', { plan: 'x' }, toolOpts())
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    expect(await p).toMatchObject({ updatedPermissions: [{ mode: 'default' }] })
    await h.conv.close()
  })

  it('rejecting the plan denies with the message and does not change the mode', async () => {
    const h = setup({ permissionMode: 'plan' })
    await h.conv.start()
    const p = canUse(h)('ExitPlanMode', { plan: 'x' }, toolOpts())
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny', message: 'redo it' })
    expect(await p).toEqual({ behavior: 'deny', message: 'The user rejected the plan. User comment: redo it' })
    expect(of(h, 'permissionMode')).toHaveLength(0)
    await h.conv.close()
  })

  it('ExitPlanMode without a text plan falls back to the tool card', async () => {
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('ExitPlanMode', {}, toolOpts())
    await flush()
    expect(lastRequest(h).kind).toBe('tool')
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
    await p
    await h.conv.close()
  })
})

describe('ClaudeConversation - edit approval behind a symlinked folder', () => {
  it.skipIf(process.platform === 'win32')(
    'folder behind a symlink: Edit on the real spelling shows the diff with the window path',
    async () => {
      const h = setup()
      const link = join(dir.tmp, 'link-root')
      await mkdir(join(dir.root, 'real'))
      await symlink(join(dir.root, 'real'), link)
      h.deps.getRoot = () => link
      await h.conv.start()
      await writeFile(join(dir.root, 'real', 'u.ts'), 'a b')
      const p = canUse(h)(
        'Edit',
        { file_path: join(dir.root, 'real', 'u.ts'), old_string: 'a', new_string: 'x' },
        toolOpts()
      )
      await flush()
      expect(lastRequest(h)).toMatchObject({ kind: 'edit', path: join(link, 'u.ts'), proposed: 'x b' })
      h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
      await p
      await h.conv.close()
    }
  )
})

describe('ClaudeConversation - CLI permission suggestions', () => {
  it('canAlwaysAllow only holds with CLI suggestions', async () => {
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Bash', {}, toolOpts({ suggestions: [] }))
    await flush()
    expect(lastRequest(h)).toMatchObject({ kind: 'tool', canAlwaysAllow: false })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
    await p
    await h.conv.close()
  })
})

describe('ClaudeConversation - plans folder', () => {
  it('ExitPlanMode without plan uses the planFilePath under the plans folder and refuses outside it', async () => {
    const h = setup()
    const plans = join(dir.root, 'plans')
    await mkdir(plans)
    await writeFile(join(plans, 'p.md'), '# from file')
    h.deps.plansDir = () => plans
    await h.conv.start()
    const p = canUse(h)('ExitPlanMode', { planFilePath: join(plans, 'p.md') }, toolOpts())
    await flush()
    expect(lastRequest(h)).toMatchObject({ kind: 'plan', plan: '# from file' })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
    await p
    await writeFile(join(dir.root, 'outside.md'), 'secret')
    const q = canUse(h)('ExitPlanMode', { planFilePath: join(dir.root, 'outside.md') }, toolOpts())
    await flush()
    expect(lastRequest(h).kind).toBe('tool')
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny' })
    await q
    await h.conv.close()
  })
})
