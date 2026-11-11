import { describe, expect, it } from 'vitest'
import type { LspServerStatus } from '@shared/types'
import { fileExtension, serverForPath } from './lspServer'

const ts: LspServerStatus = { id: 'typescript', name: 'TypeScript', state: 'ready', extensions: ['.ts', '.tsx', '.js'] }
const py: LspServerStatus = { id: 'python', name: 'Python', state: 'starting', extensions: ['.py'] }

describe('fileExtension', () => {
  it('returns the extension in lowercase, with a dot', () => {
    expect(fileExtension('/r/src/App.TSX')).toBe('.tsx')
    expect(fileExtension('C:\\r\\a.test.ts')).toBe('.ts')
  })

  it('a file without an extension or with only a leading dot', () => {
    expect(fileExtension('/r/Makefile')).toBe('')
    expect(fileExtension('/r/.gitignore')).toBe('')
  })
})

describe('serverForPath', () => {
  it('finds the server by extension', () => {
    expect(serverForPath([ts, py], '/r/a.py')).toBe(py)
    expect(serverForPath([ts, py], '/r/a.TS')).toBe(ts)
  })

  it('without a server for the extension, without a path or without an extension', () => {
    expect(serverForPath([ts, py], '/r/a.rs')).toBeNull()
    expect(serverForPath([ts, py], null)).toBeNull()
    expect(serverForPath([ts], '/r/Makefile')).toBeNull()
    expect(serverForPath([], '/r/a.ts')).toBeNull()
  })
})
