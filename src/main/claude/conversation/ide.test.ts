import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import { type Harness, flush, lastRequest, of, setup, useTempRoot } from '../testing/fakeQuery'

const dir = useTempRoot()

describe('ClaudeConversation - IDE tools', () => {
  const handlerOf = (h: Harness, name: string) =>
    h.sdk.tool.mock.calls.find((c) => c[0] === name)![3] as (a: unknown) => Promise<{
      content: { text: string }[]
      isError: boolean
    }>

  it('an accepted openDiff writes the file inside the folder', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'd.txt')
    await writeFile(file, 'old')
    const run = handlerOf(h, 'openDiff')({ filePath: file, newContents: 'new' })
    await flush()
    expect(lastRequest(h)).toMatchObject({ kind: 'edit', toolName: 'openDiff', original: 'old', proposed: 'new' })
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    const res = await run
    expect(res.isError).toBe(false)
    expect(res.content[0].text).toContain('accepted')
    expect(await readFile(file, 'utf8')).toBe('new')
    await h.conv.close()
  })

  it('a rejected openDiff does not write and returns the reason', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'd.txt')
    await writeFile(file, 'old')
    const run = handlerOf(h, 'openDiff')({ filePath: file, newContents: 'new' })
    await flush()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'deny', message: 'no' })
    expect((await run).content[0].text).toContain('Reason: no')
    expect(await readFile(file, 'utf8')).toBe('old')
    await h.conv.close()
  })

  it('an openDiff cancelled by interrupt does not write', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'd.txt')
    await writeFile(file, 'old')
    const run = handlerOf(h, 'openDiff')({ filePath: file, newContents: 'new' })
    await flush()
    await h.conv.interrupt()
    expect((await run).content[0].text).toContain('rejected')
    expect(await readFile(file, 'utf8')).toBe('old')
    await h.conv.close()
  })

  it('an openDiff outside the folder becomes an error result and does not write', async () => {
    const h = setup()
    await h.conv.start()
    const outside = await mkdtemp(join(tmpdir(), 'walph-outside-'))
    try {
      const target = join(outside, 'x.txt')
      const res = await handlerOf(h, 'openDiff')({ filePath: target, newContents: 'x' })
      expect(res.isError).toBe(true)
      expect(of(h, 'permission')).toHaveLength(0)
      await expect(readFile(target, 'utf8')).rejects.toThrow()
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
    await h.conv.close()
  })

  it('getDiagnostics with a path outside the folder returns an error', async () => {
    const h = setup()
    await h.conv.start()
    const res = await handlerOf(h, 'getDiagnostics')({ filePath: '/etc/passwd' })
    expect(res.isError).toBe(true)
    await h.conv.close()
  })
})

describe('ClaudeConversation - openDiff and the disk during review', () => {
  const handlerOf = (h: Harness, name: string) =>
    h.sdk.tool.mock.calls.find((c) => c[0] === name)![3] as (a: unknown) => Promise<{
      content: { text: string }[]
      isError: boolean
    }>

  it('openDiff does not write if the file changed on disk during review', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'd.txt')
    await writeFile(file, 'old')
    const run = handlerOf(h, 'openDiff')({ filePath: file, newContents: 'new' })
    await flush()
    await writeFile(file, 'edited outside')
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    expect((await run).content[0].text).toContain('changed on disk')
    expect(await readFile(file, 'utf8')).toBe('edited outside')
    await h.conv.close()
  })

  it('openDiff ignores a line-ending-only difference', async () => {
    const h = setup()
    await h.conv.start()
    const file = join(dir.root, 'e.txt')
    await writeFile(file, 'a\nb')
    const run = handlerOf(h, 'openDiff')({ filePath: file, newContents: 'new' })
    await flush()
    await writeFile(file, 'a\r\nb')
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    expect((await run).content[0].text).toContain('accepted')
    expect(await readFile(file, 'utf8')).toBe('new')
    await h.conv.close()
  })
})
