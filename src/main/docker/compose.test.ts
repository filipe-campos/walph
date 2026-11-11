import { describe, expect, it } from 'vitest'
import { COMPOSE_FILE_NAMES, composeProjectArgs, isComposeAction } from './compose'

describe('isComposeAction', () => {
  it('accepts only up, restart and stop', () => {
    for (const ok of ['up', 'restart', 'stop']) expect(isComposeAction(ok)).toBe(true)
    for (const bad of ['down', 'rm', '', 'UP', null, undefined, 1]) expect(isComposeAction(bad)).toBe(false)
  })
})

describe('composeProjectArgs', () => {
  it('up runs detached, with folder, files and project before the verb', () => {
    expect(composeProjectArgs('shop', '/srv/shop', ['/srv/shop/compose.yaml'], 'up')).toEqual([
      'compose',
      '--project-directory',
      '/srv/shop',
      '-f',
      '/srv/shop/compose.yaml',
      '-p',
      'shop',
      'up',
      '-d'
    ])
  })
  it('one -f per file, in order', () => {
    const args = composeProjectArgs('p', '/d', ['/d/a.yml', '/d/b.yml'], 'restart')
    expect(args).toEqual([
      'compose',
      '--project-directory',
      '/d',
      '-f',
      '/d/a.yml',
      '-f',
      '/d/b.yml',
      '-p',
      'p',
      'restart'
    ])
  })
  it('without files sends no -f; stop does not take -d', () => {
    expect(composeProjectArgs('p', '/d', [], 'stop')).toEqual([
      'compose',
      '--project-directory',
      '/d',
      '-p',
      'p',
      'stop'
    ])
  })
  it('path with spaces and backslash stays a single argument', () => {
    const args = composeProjectArgs('p', 'C:\\My Projects\\app', ['C:\\My Projects\\app\\compose.yaml'], 'up')
    expect(args).toContain('C:\\My Projects\\app')
    expect(args).toContain('C:\\My Projects\\app\\compose.yaml')
  })
})

describe('COMPOSE_FILE_NAMES', () => {
  it('compose.yaml takes precedence over docker-compose.yml', () => {
    expect(COMPOSE_FILE_NAMES[0]).toBe('compose.yaml')
    expect(COMPOSE_FILE_NAMES.indexOf('compose.yml')).toBeLessThan(COMPOSE_FILE_NAMES.indexOf('docker-compose.yml'))
  })
})
