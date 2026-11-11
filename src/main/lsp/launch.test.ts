import { describe, expect, it } from 'vitest'
import { findWorkspaceTsserver, spawnErrorMessage } from './launch'

describe('findWorkspaceTsserver', () => {
  const has = (set: string[]) => (p: string) => set.includes(p.replaceAll('\\', '/'))
  it('finds the folder one, walks up the ancestors and returns null without any', () => {
    expect(findWorkspaceTsserver('/w/app', has(['/w/app/node_modules/typescript/lib/tsserver.js']))).toContain('app')
    expect(findWorkspaceTsserver('/w/app', has(['/w/node_modules/typescript/lib/tsserver.js']))).toContain(
      'node_modules'
    )
    expect(findWorkspaceTsserver('/w/app', () => false)).toBeNull()
  })
})

describe('spawnErrorMessage', () => {
  it('explains .cmd on Windows', () => {
    expect(spawnErrorMessage('C:\\x\\pylsp.cmd', new Error('spawn EINVAL'), 'win32')).toContain('executável real')
    expect(spawnErrorMessage('pylsp', new Error('spawn pylsp ENOENT'), 'linux')).not.toContain('.cmd')
  })
})
