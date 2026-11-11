import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeEvent, ClaudePermissionRequest } from '@shared/types'
import { makeRealTempDir } from '../testing/testEnv'
import { flush, toolOpts as sdkToolOpts } from './testing/fakeQuery'
import { PermissionBroker, type PermissionHost } from './permissionBroker'

let root: string
let events: ClaudeEvent[]
let closed: boolean
let hostRoot: string | null

const host = {
  id: 'c1',
  emit: vi.fn((event: ClaudeEvent) => void events.push(event)),
  isClosed: () => closed,
  getRoot: () => hostRoot,
  plansDir: () => undefined,
  openExternal: vi.fn(() => Promise.resolve()),
  applySession: vi.fn(),
  holdIdle: vi.fn(),
  refreshIdle: vi.fn(),
  adoptPermissionMode: vi.fn()
} satisfies PermissionHost

const requests = (): ClaudePermissionRequest[] => events.flatMap((e) => (e.type === 'permission' ? [e.request] : []))
const lastRequest = (): ClaudePermissionRequest => requests().at(-1)!
const waitRequest = (): Promise<void> => vi.waitFor(() => expect(requests().length).toBeGreaterThan(0))
const notices = (): string[] => events.flatMap((e) => (e.type === 'notice' ? [e.message] : []))
type ToolOptions = Parameters<InstanceType<typeof PermissionBroker>['canUseTool']>[2]
const toolOpts = (extra: Record<string, unknown> = {}): ToolOptions => sdkToolOpts(extra) as ToolOptions

const allowBash = (destination = 'localSettings') => [
  { type: 'addRules', behavior: 'allow', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], destination }
]

beforeEach(async () => {
  root = makeRealTempDir('walph-broker-')
  events = []
  closed = false
  hostRoot = root
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('PermissionBroker: respond', () => {
  it('an unknown or repeated id counts as accepted and resolves nothing', async () => {
    const broker = new PermissionBroker(host)
    expect(broker.respond('does-not-exist', { behavior: 'allow' })).toBe(true)
    const p = broker.canUseTool('Bash', {}, toolOpts())
    await flush()
    const id = lastRequest().requestId
    expect(broker.respond(id, { behavior: 'allow' })).toBe(true)
    await expect(p).resolves.toEqual({ behavior: 'allow', updatedInput: {} })
    expect(broker.respond(id, { behavior: 'deny' })).toBe(true)
    expect(broker.pendingCount).toBe(0)
  })

  it('an answer of another kind is refused (false) and the request stays pending', async () => {
    const broker = new PermissionBroker(host)
    const p = broker.canUseTool('Bash', {}, toolOpts())
    await flush()
    const id = lastRequest().requestId
    expect(broker.respond(id, { behavior: 'skip' })).toBe(false)
    expect(broker.respond(id, { behavior: 'answer', answers: {} })).toBe(false)
    expect(broker.respond(id, { behavior: 'elicitation', action: 'decline' })).toBe(false)
    expect(broker.pendingCount).toBe(1)
    expect(broker.respond(id, { behavior: 'allow' })).toBe(true)
    await expect(p).resolves.toEqual({ behavior: 'allow', updatedInput: {} })
  })

  it('a question only accepts a valid answer or skip', async () => {
    const broker = new PermissionBroker(host)
    const input = {
      questions: [{ question: 'Which?', header: 'Q', options: [{ label: 'A' }, { label: 'B' }], multiSelect: false }]
    }
    const p = broker.canUseTool('AskUserQuestion', input, toolOpts())
    await flush()
    const id = lastRequest().requestId
    expect(lastRequest().kind).toBe('question')
    expect(broker.respond(id, { behavior: 'allow' })).toBe(false)
    expect(broker.respond(id, { behavior: 'answer', answers: { q1: ['A', 'B'] } })).toBe(false)
    expect(broker.respond(id, { behavior: 'answer', answers: {} })).toBe(false)
    expect(broker.respond(id, { behavior: 'answer', answers: { q1: ['A'] } })).toBe(true)
    await expect(p).resolves.toMatchObject({
      behavior: 'allow',
      updatedInput: { answers: { 'Which?': 'A' } }
    })
  })
})

describe('PermissionBroker: cancellation', () => {
  it('an aborted signal emits permissionCancelled and denies with interrupt', async () => {
    const broker = new PermissionBroker(host)
    const ctrl = new AbortController()
    const p = broker.canUseTool('Bash', {}, toolOpts({ signal: ctrl.signal }))
    await flush()
    const id = lastRequest().requestId
    ctrl.abort()
    await expect(p).resolves.toMatchObject({ behavior: 'deny', interrupt: true })
    expect(events).toContainEqual({ type: 'permissionCancelled', id: 'c1', requestId: id })
    expect(broker.pendingCount).toBe(0)
    expect(host.applySession).toHaveBeenCalledWith({ type: 'permissionDone', requestId: id })
  })

  it('an already aborted signal emits no request, leaves nothing pending, gives back the idle deadline', async () => {
    const broker = new PermissionBroker(host)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(broker.canUseTool('Bash', {}, toolOpts({ signal: ctrl.signal }))).resolves.toMatchObject({
      behavior: 'deny',
      interrupt: true
    })
    expect(requests()).toHaveLength(0)
    expect(events.filter((e) => e.type === 'permissionCancelled')).toHaveLength(1)
    expect(broker.pendingCount).toBe(0)
    expect(host.holdIdle).toHaveBeenCalledTimes(1)
    expect(host.refreshIdle).toHaveBeenCalledTimes(1)
  })

  it('responding removes the abort listener: aborting later does not cancel again', async () => {
    const broker = new PermissionBroker(host)
    const ctrl = new AbortController()
    const p = broker.canUseTool('Bash', {}, toolOpts({ signal: ctrl.signal }))
    await flush()
    broker.respond(lastRequest().requestId, { behavior: 'allow' })
    await p
    ctrl.abort()
    expect(events.some((e) => e.type === 'permissionCancelled')).toBe(false)
  })

  it('cancelAllPending cancels every request, tells the renderer and releases idleness', async () => {
    const broker = new PermissionBroker(host)
    const a = broker.canUseTool('Bash', {}, toolOpts())
    const b = broker.canUseTool('Read', {}, toolOpts())
    await flush()
    expect(broker.pendingCount).toBe(2)
    broker.cancelAllPending()
    await expect(Promise.all([a, b])).resolves.toEqual([
      expect.objectContaining({ behavior: 'deny', interrupt: true }),
      expect.objectContaining({ behavior: 'deny', interrupt: true })
    ])
    expect(events.filter((e) => e.type === 'permissionCancelled')).toHaveLength(2)
    expect(broker.pendingCount).toBe(0)
    expect(host.refreshIdle).toHaveBeenCalledTimes(2)
  })

  it('a closed conversation denies without asking and cancels the elicitation', async () => {
    closed = true
    const broker = new PermissionBroker(host)
    await expect(broker.canUseTool('Bash', {}, toolOpts())).resolves.toMatchObject({
      behavior: 'deny',
      interrupt: true
    })
    const request = { serverName: 's', message: 'm', mode: 'form', requestedSchema: { type: 'object', properties: {} } }
    await expect(
      broker.onElicitation(request as never, { signal: new AbortController().signal, requestId: 'e1' })
    ).resolves.toEqual({
      action: 'cancel'
    })
    expect(requests()).toHaveLength(0)
  })
})

describe('PermissionBroker: "always in this workspace" rule', () => {
  const settingsPath = (): string => join(root, '.claude', 'settings.local.json')

  async function allowAlwaysWorkspace(): Promise<unknown> {
    const broker = new PermissionBroker(host)
    const p = broker.canUseTool('Bash', { command: 'npm test' }, toolOpts({ suggestions: allowBash() }))
    await flush()
    broker.respond(lastRequest().requestId, { behavior: 'allow', always: 'workspace' })
    return p
  }

  it('saves the rule and applies the suggestions only to the session', async () => {
    await expect(allowAlwaysWorkspace()).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { command: 'npm test' },
      updatedPermissions: allowBash('session')
    })
    expect(JSON.parse(await readFile(settingsPath(), 'utf8'))).toEqual({ permissions: { allow: ['Bash(npm test)'] } })
    expect(notices()).toEqual([])
  })

  it('invalid file: allows in the session, warns with a notice and does not overwrite', async () => {
    await mkdir(join(root, '.claude'))
    await writeFile(settingsPath(), '{ broken')
    await expect(allowAlwaysWorkspace()).resolves.toMatchObject({
      behavior: 'allow',
      updatedPermissions: allowBash('session')
    })
    expect(await readFile(settingsPath(), 'utf8')).toBe('{ broken')
    expect(notices()).toHaveLength(1)
    expect(notices()[0]).toContain('só nesta sessão')
    expect(notices()[0]).not.toMatch(/\.\./)
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })

  it('no open folder: the failure reason goes in the notice and the call stays allowed', async () => {
    hostRoot = null
    await expect(allowAlwaysWorkspace()).resolves.toMatchObject({ behavior: 'allow' })
    expect(notices()[0]).toContain('Nenhuma pasta aberta')
  })

  it('suppressAlwaysAllowRule ignores "always" and returns no permissions', async () => {
    const broker = new PermissionBroker(host)
    const p = broker.canUseTool('Bash', {}, toolOpts({ suggestions: allowBash(), suppressAlwaysAllowRule: true }))
    await flush()
    expect(lastRequest()).toMatchObject({ canAlwaysAllow: false, canAllowInWorkspace: false })
    broker.respond(lastRequest().requestId, { behavior: 'allow', always: 'workspace' })
    await expect(p).resolves.toEqual({ behavior: 'allow', updatedInput: {} })
    await expect(readFile(settingsPath(), 'utf8')).rejects.toThrow()
  })
})

describe('PermissionBroker: openDiff', () => {
  async function review(file: string, newContents: string, answer: Parameters<PermissionBroker['respond']>[1]) {
    const broker = new PermissionBroker(host)
    const run = broker.openDiff(file, newContents)
    await waitRequest()
    broker.respond(lastRequest().requestId, answer)
    return run
  }

  it('accepted writes the new content', async () => {
    const file = join(root, 'a.txt')
    await writeFile(file, 'old')
    await expect(review(file, 'new', { behavior: 'allow' })).resolves.toEqual({ accepted: true })
    expect(await readFile(file, 'utf8')).toBe('new')
    expect(lastRequest()).toMatchObject({ kind: 'edit', toolName: 'openDiff', original: 'old', proposed: 'new' })
  })

  it('refuses and does not write when the file changed on disk during review', async () => {
    const file = join(root, 'a.txt')
    await writeFile(file, 'old')
    const broker = new PermissionBroker(host)
    const run = broker.openDiff(file, 'new')
    await waitRequest()
    await writeFile(file, 'edited outside')
    broker.respond(lastRequest().requestId, { behavior: 'allow' })
    await expect(run).resolves.toEqual({ accepted: false, changed: true })
    expect(await readFile(file, 'utf8')).toBe('edited outside')
  })

  it('refuses when a new file was created outside during review', async () => {
    const file = join(root, 'new.txt')
    const broker = new PermissionBroker(host)
    const run = broker.openDiff(file, 'mine')
    await waitRequest()
    expect(lastRequest()).toMatchObject({ isNewFile: true, original: '' })
    await writeFile(file, 'from outside')
    broker.respond(lastRequest().requestId, { behavior: 'allow' })
    await expect(run).resolves.toEqual({ accepted: false, changed: true })
    expect(await readFile(file, 'utf8')).toBe('from outside')
  })

  it('an accepted new file is created in UTF-8 inside new folders', async () => {
    const file = join(root, 'sub', 'dir', 'n.txt')
    await expect(review(file, 'ação', { behavior: 'allow' })).resolves.toEqual({ accepted: true })
    expect(await readFile(file, 'utf8')).toBe('ação')
  })

  it('a line-ending-only difference does not count as a change', async () => {
    const file = join(root, 'e.txt')
    await writeFile(file, 'a\nb')
    const broker = new PermissionBroker(host)
    const run = broker.openDiff(file, 'new')
    await waitRequest()
    await writeFile(file, 'a\r\nb')
    broker.respond(lastRequest().requestId, { behavior: 'allow' })
    await expect(run).resolves.toEqual({ accepted: true })
  })

  it('rejected returns the trimmed comment and does not write', async () => {
    const file = join(root, 'a.txt')
    await writeFile(file, 'old')
    await expect(review(file, 'new', { behavior: 'deny', message: '  no  ' })).resolves.toEqual({
      accepted: false,
      message: 'no'
    })
    expect(await readFile(file, 'utf8')).toBe('old')
  })

  it('cancelled by cancelAllPending returns "cancelled"', async () => {
    const file = join(root, 'a.txt')
    await writeFile(file, 'old')
    const broker = new PermissionBroker(host)
    const run = broker.openDiff(file, 'new')
    await waitRequest()
    broker.cancelAllPending()
    await expect(run).resolves.toEqual({ accepted: false, message: 'cancelled' })
    expect(await readFile(file, 'utf8')).toBe('old')
  })

  it('throws without a folder, with content too large or a path outside the folder, opening no request', async () => {
    const broker = new PermissionBroker(host)
    hostRoot = null
    await expect(broker.openDiff(join(root, 'a'), 'x')).rejects.toThrow('No folder')
    hostRoot = root
    await expect(broker.openDiff(join(root, 'a'), 'x'.repeat(5 * 1024 * 1024 + 1))).rejects.toThrow('too large')
    await expect(broker.openDiff(join(root, '..', 'outside.txt'), 'x')).rejects.toThrow()
    expect(requests()).toHaveLength(0)
  })

  it('preserves the UTF-16 encoding of the existing file', async () => {
    const file = join(root, 'u16.txt')
    await writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]))
    await expect(review(file, 'olá', { behavior: 'allow' })).resolves.toEqual({ accepted: true })
    const bytes = await readFile(file)
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xfe])
    expect(bytes.subarray(2).toString('utf16le')).toBe('olá')
  })
})
