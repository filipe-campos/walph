import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_BYTES,
  MAX_TEXT_BYTES,
  classifyAttachment,
  collectAttachments,
  loadAttachments,
  looksBinary
} from './attachments'

let base: string
let root: string
let outside: string
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'walph-att-')))
  root = join(base, 'proj')
  outside = join(base, 'outside')
  await mkdir(root)
  await mkdir(outside)
})
afterEach(() => rm(base, { recursive: true, force: true }))

describe('loadAttachments', () => {
  it('reads a file with a line range', async () => {
    await writeFile(join(root, 'a.ts'), 'l1\nl2\nl3\nl4')
    const [a] = await loadAttachments(root, [{ path: join(root, 'a.ts'), startLine: 2, endLine: 3 }])
    expect(a).toMatchObject({ kind: 'file', startLine: 2, endLine: 3, text: 'l2\nl3' })
  })

  it('lists a folder (folders with /, without .git)', async () => {
    await mkdir(join(root, 'd', 'sub'), { recursive: true })
    await mkdir(join(root, 'd', '.git'))
    await writeFile(join(root, 'd', 'f.ts'), '')
    const [a] = await loadAttachments(root, [{ path: join(root, 'd') }])
    expect(a).toMatchObject({ kind: 'directory', entries: ['f.ts', 'sub/'] })
  })

  it('a missing or binary file becomes unreadable; outside the folder throws', async () => {
    await writeFile(join(root, 'b.bin'), Buffer.from([0, 1]))
    const list = await loadAttachments(root, [{ path: join(root, 'missing.ts') }, { path: join(root, 'b.bin') }])
    expect(list.map((x) => x.kind)).toEqual(['unreadable', 'unreadable'])
    await expect(loadAttachments(root, [{ path: '/etc/passwd' }])).rejects.toThrow('fora da pasta')
  })

  it('ignores invalid lines and limits the count', async () => {
    await writeFile(join(root, 'a.ts'), 'x\ny')
    const [a] = await loadAttachments(root, [{ path: join(root, 'a.ts'), startLine: 0, endLine: -1 }])
    expect(a).toMatchObject({ kind: 'file', text: 'x\ny' })
    const many = Array.from({ length: 31 }, () => ({ path: join(root, 'a.ts') }))
    await expect(loadAttachments(root, many)).rejects.toThrow('No máximo')
  })
})

describe('loadAttachments with an outside file', () => {
  it('only reads the outside file if allowed; an outside folder throws even when allowed', async () => {
    const file = join(outside, 'notes.txt')
    await writeFile(file, 'hello')
    await expect(loadAttachments(root, [{ path: file }])).rejects.toThrow('fora da pasta')
    await expect(loadAttachments(root, [{ path: file }], () => Promise.resolve('unknown'))).rejects.toThrow(
      'fora da pasta'
    )
    const [a] = await loadAttachments(root, [{ path: file }], () => Promise.resolve('ok'))
    expect(a).toMatchObject({ kind: 'file', path: file, text: 'hello' })
    await expect(loadAttachments(root, [{ path: outside }], () => Promise.resolve('ok'))).rejects.toThrow(
      'Pastas de fora'
    )
    await expect(loadAttachments(root, [{ path: file }], () => Promise.resolve('expired'))).rejects.toThrow(
      'A liberação do anexo notes.txt expirou; anexe de novo.'
    )
    await expect(loadAttachments(root, [{ path: file }], () => Promise.resolve('changed'))).rejects.toThrow(
      'notes.txt mudou depois de liberado'
    )
  })

  it('an outside file that is too large or binary becomes unreadable', async () => {
    const big = join(outside, 'big.txt')
    await writeFile(big, Buffer.alloc(MAX_TEXT_BYTES + 1, 97))
    const bin = join(outside, 'x.dat')
    await writeFile(bin, Buffer.from([1, 0, 2]))
    const list = await loadAttachments(root, [{ path: big }, { path: bin }], () => Promise.resolve('ok'))
    expect(list.map((x) => x.kind)).toEqual(['unreadable', 'unreadable'])
  })
})

describe('classifyAttachment', () => {
  it('images up to 5 MB, text up to 2 MB', () => {
    expect(classifyAttachment('a.PNG', 10)).toEqual({ kind: 'image', mediaType: 'image/png' })
    expect(classifyAttachment('a.jpg', 10)).toEqual({ kind: 'image', mediaType: 'image/jpeg' })
    expect(classifyAttachment('a.webp', 10)).toEqual({ kind: 'image', mediaType: 'image/webp' })
    expect(classifyAttachment('a.png', MAX_IMAGE_BYTES)).toMatchObject({ kind: 'image' })
    expect(classifyAttachment('a.png', MAX_IMAGE_BYTES + 1)).toMatchObject({ kind: 'rejected' })
    expect(classifyAttachment('a.ts', MAX_TEXT_BYTES)).toEqual({ kind: 'text' })
    expect(classifyAttachment('a.ts', MAX_TEXT_BYTES + 1)).toEqual({ kind: 'rejected', reason: 'passa de 2 MB' })
    // a 3 MB image is valid; a 3 MB text is not
    expect(classifyAttachment('a.gif', 3 * 1024 * 1024).kind).toBe('image')
    expect(classifyAttachment('a.txt', 3 * 1024 * 1024).kind).toBe('rejected')
  })
  it('known binaries are refused; no extension is text', () => {
    expect(classifyAttachment('a.pdf', 1)).toMatchObject({ kind: 'rejected' })
    expect(classifyAttachment('a.zip', 1)).toMatchObject({ kind: 'rejected' })
    expect(classifyAttachment('Makefile', 1)).toEqual({ kind: 'text' })
    expect(classifyAttachment('.env', 1)).toEqual({ kind: 'text' })
  })
  it('looksBinary looks for a NUL at the start', () => {
    expect(looksBinary(Buffer.from('text'))).toBe(false)
    expect(looksBinary(Buffer.from([65, 0]))).toBe(true)
  })
})

describe('collectAttachments', () => {
  const never = (): Promise<boolean> => Promise.reject(new Error('should not ask'))

  it('inside the folder goes straight through: text, read image and folder', async () => {
    await writeFile(join(root, 'a.ts'), 'x')
    await writeFile(join(root, 'p.png'), Buffer.from([137, 80, 78, 71]))
    await mkdir(join(root, 'sub'))
    const { files, rejected } = await collectAttachments(
      root,
      [join(root, 'a.ts'), join(root, 'p.png'), join(root, 'sub')],
      never,
      never as never
    )
    expect(rejected).toEqual([])
    expect(files.map((f) => [f.name, f.size, f.image?.mediaType])).toEqual([
      ['a.ts', 1, undefined],
      ['p.png', 4, 'image/png'],
      ['sub/', 0, undefined]
    ])
    expect(files[1].image?.data).toBe(Buffer.from([137, 80, 78, 71]).toString('base64'))
  })

  it('outside: ONE question with the full paths; accepting allows, refusing rejects all', async () => {
    await writeFile(join(outside, 'a.txt'), 'a')
    await writeFile(join(outside, 'b.png'), Buffer.from([1]))
    await writeFile(join(root, 'inside.ts'), 'd')
    const paths = [join(outside, 'a.txt'), join(root, 'inside.ts'), join(outside, 'b.png')]

    const asked: string[][] = []
    const allowed: string[] = []
    const yes = await collectAttachments(
      root,
      paths,
      (n) => (asked.push(n), Promise.resolve(true)),
      (p) => void allowed.push(p)
    )
    expect(asked).toEqual([[join(outside, 'a.txt'), join(outside, 'b.png')]])
    expect(allowed).toEqual([join(outside, 'a.txt'), join(outside, 'b.png')])
    expect(yes.files.map((f) => f.name)).toEqual(['a.txt', 'inside.ts', 'b.png'])

    const allowedNo: string[] = []
    const no = await collectAttachments(
      root,
      paths,
      () => Promise.resolve(false),
      (p) => void allowedNo.push(p)
    )
    expect(allowedNo).toEqual([])
    expect(no.files.map((f) => f.name)).toEqual(['inside.ts'])
    expect(no.rejected.map((r) => r.name)).toEqual(['a.txt', 'b.png'])
  })

  it('an outside folder, binary, large and missing file are refused without asking', async () => {
    await mkdir(join(outside, 'dir'))
    await writeFile(join(outside, 'x.pdf'), 'x')
    await writeFile(join(outside, 'big.log'), Buffer.alloc(MAX_TEXT_BYTES + 1, 97))
    await writeFile(join(outside, 'nul.dat'), Buffer.from([0]))
    const { files, rejected } = await collectAttachments(
      root,
      [
        join(outside, 'dir'),
        join(outside, 'x.pdf'),
        join(outside, 'big.log'),
        join(outside, 'nul.dat'),
        join(outside, 'missing')
      ],
      never,
      never as never
    )
    expect(files).toEqual([])
    expect(rejected.map((r) => r.reason)).toEqual([
      'pastas de fora do workspace não podem ser anexadas',
      'arquivo binário não pode ser anexado',
      'passa de 2 MB',
      'arquivo binário não pode ser anexado',
      'arquivo não encontrado'
    ])
  })

  it('an empty/relative path and excess items become rejected', async () => {
    await writeFile(join(root, 'a.ts'), 'x')
    const many = Array.from({ length: 32 }, () => join(root, 'a.ts'))
    const { files, rejected } = await collectAttachments(root, ['', 'rel.ts', ...many], never, never as never)
    expect(files).toHaveLength(28)
    expect(rejected).toHaveLength(6)
    expect(rejected[0].reason).toContain('no máximo')
  })
})
