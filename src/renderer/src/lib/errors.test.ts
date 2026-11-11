import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('returns the message of a plain Error', () => {
    expect(errorMessage(new Error('falhou'))).toBe('falhou')
  })

  it('removes the Electron prefix with "Error: "', () => {
    expect(errorMessage(new Error("Error invoking remote method 'git:commit': Error: no changes"))).toBe('no changes')
  })

  it('removes the Electron prefix without "Error: "', () => {
    expect(errorMessage(new Error("Error invoking remote method 'fs:read': ENOENT"))).toBe('ENOENT')
  })

  it('only removes the prefix at the start of the message', () => {
    expect(errorMessage(new Error("before Error invoking remote method 'x': Error: y"))).toBe(
      "before Error invoking remote method 'x': Error: y"
    )
  })

  it('converts values that are not an Error', () => {
    expect(errorMessage('text')).toBe('text')
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
    expect(errorMessage(undefined)).toBe('undefined')
  })
})
