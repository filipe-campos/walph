import { describe, expect, it } from 'vitest'
import { isShellProcess } from './shellName'

describe('isShellProcess', () => {
  it('recognizes shells, including login ones and with a path', () => {
    for (const n of ['zsh', '-zsh', '/bin/bash', 'C:\\Windows\\System32\\cmd.exe', 'pwsh.exe']) {
      expect(isShellProcess(n)).toBe(true)
    }
  })
  it('any other process (or a missing name) counts as busy', () => {
    for (const n of ['node', 'vim', 'docker', '', undefined, null]) expect(isShellProcess(n)).toBe(false)
  })
})
