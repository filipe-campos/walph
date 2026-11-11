import { mkdir, mkdtemp, realpath, rm, symlink, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CommandFileReader,
  commandNameFor,
  mergeCommands,
  parseCommandFile,
  parseFrontmatter,
  sanitizeText
} from './commandFiles'

describe('parseFrontmatter', () => {
  it('reads description and argument-hint, with and without quotes', () => {
    const { data, body } = parseFrontmatter('---\ndescription: "Reviews the code"\nargument-hint: [file]\n---\nBody\n')
    expect(data).toEqual({ description: 'Reviews the code', 'argument-hint': '[file]' })
    expect(body).toBe('Body\n')
  })

  it('accepts CRLF, BOM and a multiline block', () => {
    const { data } = parseFrontmatter('﻿---\r\ndescription: >\r\n  line one\r\n  line two\r\n---\r\nbody')
    expect(data.description).toBe('line one line two')
  })

  it('without frontmatter (or without closing) everything is body', () => {
    expect(parseFrontmatter('# Title\ntext')).toEqual({ data: {}, body: '# Title\ntext' })
    expect(parseFrontmatter('---\ndescription: x\nunclosed').data).toEqual({})
  })
})

describe('commandNameFor', () => {
  it('subfolders become folder:name', () => {
    expect(commandNameFor('review.md')).toBe('review')
    expect(commandNameFor('git/commit.md')).toBe('git:commit')
    expect(commandNameFor('a\\b\\c.md')).toBe('a:b:c')
  })
  it('rejects what cannot be typed', () => {
    expect(commandNameFor('my command.md')).toBeNull()
    expect(commandNameFor('x.txt')).toBeNull()
    expect(commandNameFor('a\u0007b.md')).toBeNull()
  })
})

describe('parseCommandFile / sanitizeText', () => {
  it('without description uses the first body line, without the #', () => {
    expect(parseCommandFile('r.md', '\n\n# Review PR\nmore', 'project')).toEqual({
      name: 'r',
      description: 'Review PR',
      argumentHint: '',
      scope: 'project'
    })
  })
  it('cleans controls and cuts the length', () => {
    expect(sanitizeText('a\u001b[31m\nb\tc', 50)).toBe('a [31m b c')
    expect(sanitizeText('x'.repeat(400), 300)).toHaveLength(300)
    const c = parseCommandFile('r.md', `---\ndescription: ${'y'.repeat(1000)}\n---\n`, 'user')
    expect(c?.description.length).toBe(300)
  })
})

describe('mergeCommands', () => {
  const init = [
    { name: 'compact', description: 'Compacts', argumentHint: '' },
    { name: 'review', description: 'from the CLI (project)', argumentHint: '' }
  ]
  it('a file gives the scope; the rest of init is builtin; a file outside init appears', () => {
    const merged = mergeCommands(init, [
      { name: 'review', description: 'Reviews', argumentHint: '[file]', scope: 'project' },
      { name: 'zeta', description: 'Z', argumentHint: '', scope: 'user' },
      { name: 'alfa', description: 'A', argumentHint: '', scope: 'user' }
    ])
    expect(merged).toEqual([
      { name: 'compact', description: 'Compacts', argumentHint: '', scope: 'builtin' },
      { name: 'review', description: 'Reviews', argumentHint: '[file]', scope: 'project' },
      { name: 'alfa', description: 'A', argumentHint: '', scope: 'user' },
      { name: 'zeta', description: 'Z', argumentHint: '', scope: 'user' }
    ])
  })
  it('project beats user (first in the list) and with an empty init only the files', () => {
    const merged = mergeCommands(
      [],
      [
        { name: 'x', description: 'p', argumentHint: '', scope: 'project' },
        { name: 'x', description: 'u', argumentHint: '', scope: 'user' }
      ]
    )
    expect(merged).toEqual([{ name: 'x', description: 'p', argumentHint: '', scope: 'project' }])
  })
})

describe('CommandFileReader', () => {
  let root: string
  let home: string
  let outside: string
  beforeEach(async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'walph-cmd-')))
    root = join(base, 'proj')
    home = join(base, 'home')
    outside = join(base, 'outside')
    await Promise.all([root, home, outside].map((d) => mkdir(d, { recursive: true })))
  })
  afterEach(() => rm(join(root, '..'), { recursive: true, force: true }))

  it('reads project and user, subfolders, and the project wins on the same name', async () => {
    await mkdir(join(root, '.claude', 'commands', 'git'), { recursive: true })
    await mkdir(join(home, '.claude', 'commands'), { recursive: true })
    await writeFile(
      join(root, '.claude', 'commands', 'review.md'),
      '---\ndescription: Reviews\nargument-hint: [file]\n---\nbody'
    )
    await writeFile(join(root, '.claude', 'commands', 'git', 'commit.md'), 'Commits')
    await writeFile(join(root, '.claude', 'commands', 'note.txt'), 'ignored')
    await writeFile(join(home, '.claude', 'commands', 'review.md'), 'from the user')
    await writeFile(join(home, '.claude', 'commands', 'personal.md'), 'My command')
    const files = await new CommandFileReader(() => home).read(root)
    expect(files.map((f) => [f.name, f.scope, f.description, f.argumentHint])).toEqual([
      ['git:commit', 'project', 'Commits', ''],
      ['review', 'project', 'Reviews', '[file]'],
      ['personal', 'user', 'My command', '']
    ])
  })

  // symlink requires developer mode/admin on Windows
  it.skipIf(process.platform === 'win32')(
    'does not follow a symlink that leaves commands (file, folder or commands itself)',
    async () => {
      const commands = join(root, '.claude', 'commands')
      await mkdir(commands, { recursive: true })
      await writeFile(join(outside, 'secret.md'), 'outside')
      await mkdir(join(outside, 'dir'))
      await writeFile(join(outside, 'dir', 'x.md'), 'outside')
      await symlink(join(outside, 'secret.md'), join(commands, 'link.md'))
      await symlink(join(outside, 'dir'), join(commands, 'linkdir'))
      await writeFile(join(commands, 'ok.md'), 'inside')
      const reader = new CommandFileReader(() => home)
      expect((await reader.read(root)).map((f) => f.name)).toEqual(['ok'])

      await rm(join(root, '.claude'), { recursive: true })
      await mkdir(join(root, '.claude'))
      await symlink(outside, commands)
      await writeFile(join(outside, 'loose.md'), 'outside')
      expect(await reader.read(root)).toEqual([])
    }
  )

  it.skipIf(process.platform === 'win32')('follows a symlink that stays inside commands', async () => {
    const commands = join(root, '.claude', 'commands')
    await mkdir(join(commands, 'real'), { recursive: true })
    await writeFile(join(commands, 'real', 'a.md'), 'A')
    await symlink(join(commands, 'real', 'a.md'), join(commands, 'link.md'))
    const names = (await new CommandFileReader(() => home).read(root)).map((f) => f.name)
    expect(names).toEqual(['link', 'real:a'])
  })

  it('rereads when the mtime changes and uses the cache when it does not', async () => {
    const commands = join(root, '.claude', 'commands')
    await mkdir(commands, { recursive: true })
    const file = join(commands, 'a.md')
    await writeFile(file, 'one')
    const reader = new CommandFileReader(() => home)
    expect((await reader.read(root))[0].description).toBe('one')
    await writeFile(file, 'two')
    await utimes(file, new Date(), new Date(Date.now() + 5000))
    expect((await reader.read(root))[0].description).toBe('two')
  })

  it('without an open folder or without directories returns empty', async () => {
    const reader = new CommandFileReader(() => home)
    expect(await reader.read(null)).toEqual([])
    expect(await reader.read(root)).toEqual([])
  })
})
