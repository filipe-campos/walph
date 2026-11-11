import { describe, expect, it, vi } from 'vitest'
import type { ClaudeEditorContext } from '@shared/types'
import type { Sdk } from './sdk'
import { createIdeServer, IDE_ALLOWED_TOOLS, IDE_SERVER_NAME, IDE_TOOL_NAMES, type IdeHost } from './ideServer'

type Handler = (args: never) => Promise<{ content: { type: string; text: string }[]; isError: boolean }>

const context: ClaudeEditorContext = {
  activeFile: '/p/a.ts',
  selection: null,
  openFiles: [{ path: '/p/a.ts', dirty: true }]
}

function setup(over: Partial<IdeHost> = {}) {
  const host: IdeHost = {
    getRoot: () => '/p',
    getEditorContext: () => context,
    getDiagnostics: async () => [],
    openDiff: async () => ({ accepted: true }),
    ...over
  }
  const handlers = new Map<string, Handler>()
  const sdk = {
    tool: (name: string, _d: string, _s: unknown, handler: Handler) => ({ name, handler }),
    createSdkMcpServer: (opts: { name: string; tools: { name: string; handler: Handler }[] }) => {
      for (const t of opts.tools) handlers.set(t.name, t.handler)
      return opts
    }
  } as unknown as Sdk
  const server = createIdeServer(sdk, host) as unknown as { name: string }
  const call = (name: string, args: unknown = {}) => handlers.get(name)!(args as never)
  return { host, handlers, server, call }
}

describe('createIdeServer', () => {
  it('registers the walph server with all tools allowed', () => {
    const { handlers, server } = setup()
    expect(server.name).toBe(IDE_SERVER_NAME)
    expect([...handlers.keys()]).toEqual(IDE_TOOL_NAMES)
    expect(IDE_ALLOWED_TOOLS).toEqual([
      'mcp__walph__getDiagnostics',
      'mcp__walph__getCurrentSelection',
      'mcp__walph__getOpenEditors',
      'mcp__walph__getWorkspaceFolders',
      'mcp__walph__openDiff'
    ])
  })

  it('returns the tool text as a non-error result', async () => {
    const { call } = setup()
    const result = await call('getOpenEditors')
    expect(result.isError).toBe(false)
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({ activeFile: '/p/a.ts', openEditors: [{ filePath: '/p/a.ts', isDirty: true }] })
    })
  })

  it('getWorkspaceFolders lists the folder or nothing', async () => {
    expect(JSON.parse((await setup().call('getWorkspaceFolders')).content[0].text)).toEqual({ folders: ['/p'] })
    const none = setup({ getRoot: () => null })
    expect(JSON.parse((await none.call('getWorkspaceFolders')).content[0].text)).toEqual({ folders: [] })
  })

  it('a tool failure becomes an error result with the message, without throwing', async () => {
    const { call } = setup({ getRoot: () => null })
    const result = await call('getDiagnostics', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('No folder is open in the IDE.')
  })

  it('an async host rejection also becomes an error', async () => {
    const { call } = setup({
      getDiagnostics: async () => {
        throw new Error('server crashed')
      }
    })
    const result = await call('getDiagnostics', { filePath: '/p/a.ts' })
    expect(result).toMatchObject({ isError: true, content: [{ text: 'server crashed' }] })
  })

  it('a thrown value that is not an Error uses the generic message', async () => {
    const { call } = setup({
      getEditorContext: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'text'
      }
    })
    const result = await call('getCurrentSelection')
    expect(result).toMatchObject({ isError: true, content: [{ text: 'IDE tool failure.' }] })
  })

  it('getDiagnostics passes the filePath to the host', async () => {
    const getDiagnostics = vi.fn(async () => [])
    const { call } = setup({ getDiagnostics })
    const result = await call('getDiagnostics', { filePath: '/p/a.ts' })
    expect(getDiagnostics).toHaveBeenCalledWith('/p/a.ts')
    expect(result.isError).toBe(false)
  })

  describe('openDiff', () => {
    it('accepted', async () => {
      const openDiff = vi.fn(async () => ({ accepted: true }))
      const { call } = setup({ openDiff })
      const result = await call('openDiff', { filePath: '/p/a.ts', newContents: 'x' })
      expect(openDiff).toHaveBeenCalledWith('/p/a.ts', 'x')
      expect(result.content[0].text).toContain('accepted')
      expect(result.isError).toBe(false)
    })

    it('rejected with a reason', async () => {
      const { call } = setup({ openDiff: async () => ({ accepted: false, message: 'too large' }) })
      const text = (await call('openDiff', { filePath: '/p/a.ts', newContents: 'x' })).content[0].text
      expect(text).toBe('The user rejected the changes. Reason: too large')
    })

    it('rejected without a reason', async () => {
      const { call } = setup({ openDiff: async () => ({ accepted: false }) })
      const text = (await call('openDiff', { filePath: '/p/a.ts', newContents: 'x' })).content[0].text
      expect(text).toBe('The user rejected the changes.')
    })

    it('file changed on disk: nothing written, even if accepted', async () => {
      const { call } = setup({ openDiff: async () => ({ accepted: true, changed: true }) })
      const text = (await call('openDiff', { filePath: '/p/a.ts', newContents: 'x' })).content[0].text
      expect(text).toContain('nothing was written')
    })
  })
})
