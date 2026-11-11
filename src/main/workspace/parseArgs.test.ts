import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { folderFromArgv } from './parseArgs'

const cwd = resolve('/work/cwd')

describe('folderFromArgv', () => {
  it('reads the folder in the packaged app [exe, folder]', () => {
    expect(folderFromArgv(['/Applications/Walph', resolve('/proj')], cwd, true)).toBe(resolve('/proj'))
  })

  it('in the packaged app does not treat the 2nd argument as the app path', () => {
    expect(folderFromArgv(['/Applications/Walph'], cwd, true)).toBeNull()
  })

  it('reads the folder in dev after `electron .` ignoring flags', () => {
    const argv = ['/e/electron', '.', resolve('/proj'), '--remote-debugging-port=9333']
    expect(folderFromArgv(argv, cwd, false)).toBe(resolve('/proj'))
  })

  it('ignores --user-data-dir when using electron out/main/index.js', () => {
    const argv = ['/e/electron', 'out/main/index.js', '--user-data-dir=/x', resolve('/proj')]
    expect(folderFromArgv(argv, cwd, false)).toBe(resolve('/proj'))
  })

  it('not packaged: Chromium flags injected before the script do not become the folder', () => {
    const argv = ['/e/electron', '--user-data-dir=/x', '--allow-file-access-from-files', '/o/out/main/index.js', 'xyz']
    expect(folderFromArgv(argv, cwd, false)).toBe(resolve(cwd, 'xyz'))
    expect(folderFromArgv(argv.slice(0, 4), cwd, false)).toBeNull()
  })

  it('resolves a relative path against the cwd', () => {
    expect(folderFromArgv(['/e/electron', '.', 'sub/folder'], cwd, false)).toBe(resolve(cwd, 'sub/folder'))
    expect(folderFromArgv(['/Applications/Walph', '../sibling'], cwd, true)).toBe(resolve(cwd, '../sibling'))
  })

  it('returns null without a folder', () => {
    expect(folderFromArgv(['/e/electron', '.'], cwd, false)).toBeNull()
    expect(folderFromArgv(['/e/electron', '.', '--inspect=9334'], cwd, false)).toBeNull()
    expect(folderFromArgv(['/e/electron'], cwd, false)).toBeNull()
  })

  it('ignores empty arguments', () => {
    expect(folderFromArgv(['/e/electron', '.', '', resolve('/proj')], cwd, false)).toBe(resolve('/proj'))
  })

  it('normalizes the absolute path', () => {
    expect(folderFromArgv(['/App', resolve('/a/b/../c')], cwd, true)).toBe(resolve('/a/c'))
  })
})
