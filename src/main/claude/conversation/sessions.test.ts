import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import type { CommandFile } from '../commandFiles'
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

describe('ClaudeConversation - session status', () => {
  const statuses = (h: Harness): string[] => of(h, 'sessionStatus').map((e) => `${e.status}/${e.unread}`)
  const result = (isError = false, queued = 0) => ({
    type: 'result',
    subtype: 'success',
    is_error: isError,
    result: '',
    duration_ms: 1,
    total_cost_usd: 0,
    queued_turn_count: queued
  })

  it('send → running; result ok → done with 1 unread; markRead → idle', async () => {
    const h = setup()
    const changes: unknown[] = []
    h.deps.onSessionChange = (c) => changes.push(c)
    await h.conv.start()
    await h.conv.send(promptInput('hi'))
    h.queries[0].push(result())
    await flush()
    expect(statuses(h)).toEqual(['running/0', 'done/1'])
    expect(changes).toEqual([
      { status: 'running', previous: 'idle', unread: 0, notify: null, question: false },
      { status: 'done', previous: 'running', unread: 1, notify: 'done', question: false }
    ])
    expect(h.conv.unread).toBe(1)
    h.conv.markRead()
    h.conv.markRead() // no change: does not emit again
    expect(statuses(h)).toEqual(['running/0', 'done/1', 'idle/0'])
    await h.conv.close()
  })

  it('permission request → attention; answering goes back to running', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('hi'))
    const p = canUse(h)('Bash', { command: 'ls' }, toolOpts())
    await flush()
    expect(statuses(h)).toEqual(['running/0', 'attention/1'])
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    await p
    expect(statuses(h)).toEqual(['running/0', 'attention/1', 'running/1'])
    await h.conv.close()
  })

  it('permissionCancelled (interruption) clears attention', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('hi'))
    const p = canUse(h)('Bash', {}, toolOpts())
    await flush()
    await h.conv.interrupt()
    await p
    expect(of(h, 'permissionCancelled')).toHaveLength(1)
    expect(statuses(h).at(-1)).toBe('running/1')
    // The result of the interrupted turn becomes neither a failure nor a completion.
    h.queries[0].push(result(true))
    await flush()
    expect(statuses(h).at(-1)).toBe('idle/1')
    await h.conv.close()
  })

  it('result with error → error; new turn clears it; queued turn keeps running', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('a'))
    h.queries[0].push(result(true, 1))
    await flush()
    expect(statuses(h)).toEqual(['running/0', 'error/1', 'running/1'])
    h.queries[0].push(result(false, 0))
    await flush()
    expect(statuses(h).at(-1)).toBe('done/2')
    await h.conv.close()
  })

  it('process failure → error and notifies; close emits no more status', async () => {
    const h = setup()
    const changes: { notify: unknown }[] = []
    h.deps.onSessionChange = (c) => changes.push(c)
    await h.conv.start()
    await h.conv.send(promptInput('a'))
    h.queries[0].end()
    await flush()
    expect(statuses(h).at(-1)).toBe('error/1')
    expect(changes.at(-1)?.notify).toBe('error')

    const g = setup()
    await g.conv.start()
    await g.conv.send(promptInput('a'))
    const before = of(g, 'sessionStatus').length
    await g.conv.close()
    expect(of(g, 'sessionStatus')).toHaveLength(before)
    expect(g.conv.unread).toBe(0)
  })

  it('keeps the session title for notifications', async () => {
    const h = setup()
    await h.conv.start()
    expect(h.conv.sessionTitle).toBe('Nova conversa')
    await h.conv.send(promptInput('Fix the login'))
    expect(h.conv.sessionTitle).toBe('Fix the login')
    await h.conv.close()
  })

  it('result of the interrupted turn does not notify even after a new send', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('a'))
    await h.conv.interrupt()
    await h.conv.send(promptInput('b'))
    h.queries[0].push(result(true, 1))
    await flush()
    expect(h.conv.unread).toBe(0)
    h.queries[0].push(result(false, 0))
    await flush()
    expect(h.conv.unread).toBe(1)
    await h.conv.close()
  })

  it('a failed conversation keeps accepting markRead until closed', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('a'))
    h.queries[0].end()
    await flush()
    expect(h.conv.unread).toBe(1)
    h.conv.markRead()
    expect(h.conv.unread).toBe(0)
  })
})

describe('ClaudeConversation - sessions', () => {
  const allowBash = (destination = 'localSettings'): unknown[] => [
    { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination }
  ]
  const settingsPath = (): string => join(dir.root, '.claude', 'settings.local.json')

  it('resume: Walph title and favorite beat the CLI ones', async () => {
    const h = setup({ resume: 'sess-1' })
    h.deps.loadSessionMeta = () => Promise.resolve({ favorite: true, title: 'Pix at checkout' })
    h.sdk.getSessionInfo.mockResolvedValue({ customTitle: 'from CLI', summary: 'summary' })
    const started = await h.conv.start()
    expect(started).toMatchObject({ title: 'Pix at checkout', favorite: true })
    expect(h.conv.sessionTitle).toBe('Pix at checkout')
    await h.conv.close()
  })

  it('resume without metadata: CLI title and favorite=false; new conversation: favorite=false', async () => {
    const h = setup({ resume: 'sess-1' })
    h.sdk.getSessionInfo.mockResolvedValue({ customTitle: 'from CLI', summary: 'summary' })
    expect(await h.conv.start()).toMatchObject({ title: 'from CLI', favorite: false })
    await h.conv.close()
    const fresh = setup()
    expect(await fresh.conv.start()).toMatchObject({ favorite: false })
    await fresh.conv.close()
  })

  it('resume without customTitle/summary: the tab uses the first message, like the history', async () => {
    const h = setup({ resume: 'sess-1' })
    h.sdk.getSessionInfo.mockResolvedValue({ firstPrompt: 'Fix the Pix bug\ndetails' })
    expect(await h.conv.start()).toMatchObject({ title: 'Fix the Pix bug' })
    await h.conv.close()
  })

  it('resume with a user title: the automatic one is not a copy of it and clearing the title reveals it', async () => {
    const h = setup({ resume: 'sess-1' })
    h.deps.loadSessionMeta = () => Promise.resolve({ favorite: false, title: 'My name' })
    h.sdk.getSessionInfo.mockResolvedValue({
      customTitle: 'My name',
      summary: 'My name',
      firstPrompt: 'Fix the Pix bug\ndetails'
    })
    const started = await h.conv.start()
    expect(started).toMatchObject({ title: 'My name', userTitle: 'My name' })
    expect(h.conv.autoTitle).toBe('Fix the Pix bug')
    h.conv.setUserTitle(null)
    expect(of(h, 'title').map((e) => e.title)).toEqual(['Fix the Pix bug'])
    await h.conv.close()
  })

  it('duplicate: an error that is not "not found" does not become "no messages"', async () => {
    const h = setup()
    const forkSession = vi.fn(() => Promise.reject(new Error('EACCES: permission denied')))
    ;(h.sdk as Record<string, unknown>).forkSession = forkSession
    await h.conv.start()
    await h.conv.send(promptInput('Hi'))
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'ok',
      total_cost_usd: 0,
      duration_ms: 1
    })
    await flush()
    await expect(h.conv.fork()).rejects.toThrow('Não foi possível duplicar a conversa: EACCES: permission denied.')
    await h.conv.close()
  })

  it('rewind to the beginning reports the sessionId change', async () => {
    const h = setup()
    const onSessionIdChange = vi.fn()
    h.deps.onSessionIdChange = onSessionIdChange
    await h.conv.start()
    const first = h.conv.currentSessionId
    const uuid = await h.conv.send(promptInput('Hi'))
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()
    await h.conv.rewind(uuid, { code: false, conversation: true })
    expect(onSessionIdChange).toHaveBeenCalledWith(first, h.conv.currentSessionId)
    expect(h.conv.currentSessionId).not.toBe(first)
    await h.conv.close()
  })

  it('user title: the automatic one does not overwrite it and clearing goes back to the automatic one', async () => {
    const h = setup()
    await h.conv.start()
    h.conv.setUserTitle('My name')
    await h.conv.send(promptInput('Fix the Pix bug'))
    expect(of(h, 'title')).toHaveLength(0)
    expect(h.conv.sessionTitle).toBe('My name')
    h.conv.setUserTitle(null)
    expect(of(h, 'title').map((e) => e.title)).toEqual(['Fix the Pix bug'])
    expect(h.conv.sessionTitle).toBe('Fix the Pix bug')
    await h.conv.close()
  })

  it('duplicate: without messages throws in pt-BR; with messages uses forkSession with "(cópia)"', async () => {
    const h = setup()
    const forkSession = vi.fn(() => Promise.resolve({ sessionId: 'new-1' }))
    ;(h.sdk as Record<string, unknown>).forkSession = forkSession
    await h.conv.start()
    await expect(h.conv.fork()).rejects.toThrow('A conversa ainda não tem mensagens para duplicar.')
    await h.conv.send(promptInput('Hi'))
    await expect(h.conv.fork()).rejects.toThrow('Aguarde o fim da primeira resposta')
    expect(forkSession).not.toHaveBeenCalled()
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'ok',
      total_cost_usd: 0,
      duration_ms: 1
    })
    await flush()
    expect(await h.conv.fork()).toBe('new-1')
    expect(forkSession).toHaveBeenCalledWith(h.conv.currentSessionId, { dir: dir.root, title: 'Hi (cópia)' })
    forkSession.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }))
    await expect(h.conv.fork()).rejects.toThrow('ainda não tem mensagens')
    await h.conv.close()
  })

  it('the message echo carries the editor context in `context` and not in the blocks', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send({
      ...promptInput('Explain'),
      activeFile: join(dir.root, 'a.ts'),
      selection: { path: join(dir.root, 'a.ts'), startLine: 3, endLine: 5, text: 'x' }
    })
    const echo = of(h, 'message').find((e) => e.message.role === 'user')!.message
    expect(echo.blocks).toEqual([{ type: 'text', text: 'Explain' }])
    expect(echo.context).toEqual({ path: join(dir.root, 'a.ts'), startLine: 3, endLine: 5 })
    await h.conv.send({ ...promptInput('none'), activeFile: null })
    const last = of(h, 'message')
      .filter((e) => e.message.role === 'user')
      .at(-1)!.message
    expect(last.context).toBeUndefined()
    await h.conv.close()
  })

  it('exportData has only what the user typed (no injected context)', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send({ ...promptInput('Explain'), activeFile: join(dir.root, 'a.ts') })
    const { title, messages } = h.conv.exportData()
    expect(title).toBe('Explain')
    expect(JSON.stringify(messages)).not.toContain('ide_opened_file')
    expect(messages[0].blocks).toEqual([{ type: 'text', text: 'Explain' }])
    await h.conv.close()
  })

  it('"Always in this workspace": writes the rule, keeps the file and applies it to the session', async () => {
    await mkdir(join(dir.root, '.claude'))
    await writeFile(settingsPath(), JSON.stringify({ env: { A: '1' }, permissions: { allow: ['Read'] } }))
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Bash', { command: 'npm test' }, toolOpts({ suggestions: allowBash() }))
    await flush()
    expect(lastRequest(h)).toMatchObject({ kind: 'tool', canAlwaysAllow: true, canAllowInWorkspace: true })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow', always: 'workspace' })
    expect(await p).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'npm test' },
      updatedPermissions: allowBash('session')
    })
    expect(JSON.parse(await readFile(settingsPath(), 'utf8'))).toEqual({
      env: { A: '1' },
      permissions: { allow: ['Read', 'Bash(npm test)'] }
    })
    expect(of(h, 'error')).toHaveLength(0)
    await h.conv.close()
  })

  it('"Always in this workspace" creates .claude/ and does not duplicate the rule', async () => {
    const h = setup()
    await h.conv.start()
    for (let i = 0; i < 2; i++) {
      const p = canUse(h)('Bash', {}, toolOpts({ suggestions: allowBash() }))
      await flush()
      h.conv.respond(lastRequest(h).requestId, { behavior: 'allow', always: 'workspace' })
      await p
    }
    expect(JSON.parse(await readFile(settingsPath(), 'utf8'))).toEqual({ permissions: { allow: ['Bash(npm test)'] } })
    await h.conv.close()
  })

  it('invalid file: allows in the session, warns with an error and does not overwrite', async () => {
    await mkdir(join(dir.root, '.claude'))
    await writeFile(settingsPath(), '{ broken')
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Bash', {}, toolOpts({ suggestions: allowBash() }))
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow', always: 'workspace' })
    expect(await p).toMatchObject({ behavior: 'allow', updatedPermissions: allowBash('session') })
    expect(await readFile(settingsPath(), 'utf8')).toBe('{ broken')
    expect(of(h, 'error')).toHaveLength(0)
    expect(of(h, 'notice')[0].message).toContain('só nesta sessão')
    // Not a conversation failure: the session status does not become "error".
    expect(of(h, 'sessionStatus').some((e) => e.status === 'error')).toBe(false)
    await h.conv.close()
  })

  it('no allow rule in the suggestions: no button, and "workspace" becomes just this call', async () => {
    const h = setup()
    await h.conv.start()
    const suggestions = [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
    const p = canUse(h)('Bash', {}, toolOpts({ suggestions }))
    await flush()
    expect(lastRequest(h)).toMatchObject({ canAllowInWorkspace: false })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow', always: 'workspace' })
    expect(await p).toEqual({ behavior: 'allow', updatedInput: {} })
    await h.conv.close()
  })

  it('"Always allow" does not let the CLI write to a file: destination becomes session', async () => {
    const h = setup()
    await h.conv.start()
    const p = canUse(h)('Bash', {}, toolOpts({ suggestions: allowBash() }))
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow', always: true })
    expect(await p).toMatchObject({ updatedPermissions: allowBash('session') })
    await expect(readFile(settingsPath(), 'utf8')).rejects.toThrow()
    await h.conv.close()
  })
})

describe('ClaudeConversation - commands and outside attachments', () => {
  it('merges init with the files (scope) and rereads on every call', async () => {
    const h = setup()
    let files: CommandFile[] = [
      { name: 'review', description: 'Reviews', argumentHint: '[file]', scope: 'project' },
      { name: 'mine', description: 'Mine', argumentHint: '', scope: 'user' }
    ]
    h.deps.readCommandFiles = () => Promise.resolve(files)
    await h.conv.start()
    await flush()
    const init = of(h, 'init').at(-1)
    expect(init?.commands).toEqual([
      { name: 'compact', description: 'Compacts', argumentHint: '', scope: 'builtin' },
      { name: 'mine', description: 'Mine', argumentHint: '', scope: 'user' },
      { name: 'review', description: 'Reviews', argumentHint: '[file]', scope: 'project' }
    ])
    files = [files[0]]
    expect((await h.conv.slashCommands()).map((c) => c.name)).toEqual(['compact', 'review'])
    await h.conv.close()
  })

  it('failing to read the files does not break the list', async () => {
    const h = setup()
    h.deps.readCommandFiles = () => Promise.reject(new Error('disk'))
    await h.conv.start()
    expect((await h.conv.slashCommands()).map((c) => c.scope)).toEqual(['builtin'])
    await h.conv.close()
  })

  it('sends an outside file only if main allowed it', async () => {
    const outside = join(dir.tmp, '..', `outside-${Date.now()}.txt`)
    await writeFile(outside, 'secret')
    try {
      const h = setup()
      await h.conv.start()
      await expect(h.conv.send({ ...promptInput('look'), attachments: [{ path: outside }] })).rejects.toThrow(
        'fora da pasta'
      )
      h.deps.verifyAttachment = (p) => Promise.resolve(p === outside ? 'ok' : 'unknown')
      await h.conv.send({ ...promptInput('look'), attachments: [{ path: outside }] })
      await flush()
      expect(JSON.stringify(h.sent)).toContain('secret')
      await h.conv.close()
    } finally {
      await rm(outside, { force: true })
    }
  })
})
