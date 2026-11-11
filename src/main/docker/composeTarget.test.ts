import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findComposeFile } from './compose'
import { resolveComposeTarget } from './composeTarget'
import type { PsContainer } from './parsePs'

const member = (extra: Partial<PsContainer>): PsContainer =>
  ({ workingDir: null, configFiles: [], ...extra }) as PsContainer

describe('compose on disk', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'walph-compose-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('resolves folder and files from the first member that has them', async () => {
    const file = join(dir, 'compose.yaml')
    writeFileSync(file, 'services: {}\n')
    const target = await resolveComposeTarget('shop', [member({}), member({ workingDir: dir, configFiles: [file] })])
    expect(target).toEqual({ workingDir: dir, files: [file] })
  })

  it('rejects a project without folder, a missing folder and a missing file', async () => {
    await expect(resolveComposeTarget('shop', [member({})])).rejects.toThrow('shop')
    await expect(resolveComposeTarget('shop', [member({ workingDir: join(dir, 'nope') })])).rejects.toThrow('nope')
    await expect(resolveComposeTarget('shop', [member({ workingDir: 'relative' })])).rejects.toThrow('shop')
    const missing = join(dir, 'missing.yml')
    await expect(resolveComposeTarget('shop', [member({ workingDir: dir, configFiles: [missing] })])).rejects.toThrow(
      'missing.yml'
    )
  })

  it('a file that is actually a folder does not count', async () => {
    mkdirSync(join(dir, 'compose.yaml'))
    expect(await findComposeFile(dir)).toBeNull()
  })

  it('findComposeFile prefers compose.yaml and returns null without root', async () => {
    writeFileSync(join(dir, 'docker-compose.yml'), '')
    writeFileSync(join(dir, 'compose.yaml'), '')
    expect(await findComposeFile(dir)).toBe(join(dir, 'compose.yaml'))
    expect(await findComposeFile(null)).toBeNull()
  })
})
