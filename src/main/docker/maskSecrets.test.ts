import { describe, expect, it } from 'vitest'
import { maskCommandArgs } from './maskSecrets'

describe('maskCommandArgs', () => {
  it('flags with = and with a separate value', () => {
    expect(
      maskCommandArgs(['app', '--password=abc', '--token', 'xyz', '--port', '80', '--api-key', '--verbose'])
    ).toEqual(['app', '--password=***', '--token', '***', '--port', '80', '--api-key', '--verbose'])
  })
  it('environment assignments and URLs with credentials', () => {
    expect(maskCommandArgs(['sh', '-c', 'AWS_SECRET_KEY=abc node x.js'])).toEqual([
      'sh',
      '-c',
      'AWS_SECRET_KEY=*** node x.js'
    ])
    expect(maskCommandArgs(['--db', 'postgres://u:secret@host/db'])).toEqual(['--db', 'postgres://u:***@host/db'])
  })
  it('leaves the rest alone', () => {
    expect(maskCommandArgs(['nginx', '-g', 'daemon off;'])).toEqual(['nginx', '-g', 'daemon off;'])
  })
})
