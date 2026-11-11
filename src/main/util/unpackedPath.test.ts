import { describe, expect, it } from 'vitest'
import { unpackedPath } from './unpackedPath'

describe('unpackedPath', () => {
  it('rewrites only the app.asar segment', () => {
    expect(unpackedPath('/x/app.asar/node_modules/a.js')).toBe('/x/app.asar.unpacked/node_modules/a.js')
    expect(unpackedPath('C:\\x\\app.asar\\node_modules\\a.js')).toBe('C:\\x\\app.asar.unpacked\\node_modules\\a.js')
  })
  it('does not touch names that merely end in app.asar', () => {
    expect(unpackedPath('/x/my-app.asar/node_modules/a.js')).toBe('/x/my-app.asar/node_modules/a.js')
    expect(unpackedPath('/x/proj/node_modules/a.js')).toBe('/x/proj/node_modules/a.js')
  })
})
