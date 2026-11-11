import { describe, expect, it } from 'vitest'
import {
  FAVORITE_COMMAND_ICONS,
  FAVORITE_COMMAND_ICON_LABELS,
  MAX_FAVORITE_COMMANDS,
  parseFavoriteCommands,
  sanitizeFavoriteCommands
} from './favoriteCommands'

describe('sanitizeFavoriteCommands', () => {
  it('drops malformed items, icons outside the grid and repeated names', () => {
    expect(
      sanitizeFavoriteCommands([
        { name: 'review', icon: 'check' },
        { name: 'review', icon: 'bolt' },
        { name: 'folder:deploy', icon: 'rocket' },
        { name: 'revisão+lint', icon: 'bolt' },
        { name: 'line\nbreak', icon: 'bolt' },
        { name: '', icon: 'bolt' },
        { name: 'x'.repeat(101), icon: 'bolt' },
        { name: 'x', icon: 'does-not-exist' },
        { name: 'with space', icon: 'bolt' },
        null,
        'text'
      ])
    ).toEqual([
      { name: 'review', icon: 'check' },
      { name: 'folder:deploy', icon: 'rocket' },
      { name: 'revisão+lint', icon: 'bolt' }
    ])
  })
  it('accepts nothing but a list and cuts at the cap', () => {
    expect(sanitizeFavoriteCommands({ name: 'a', icon: 'bolt' })).toEqual([])
    const many = Array.from({ length: MAX_FAVORITE_COMMANDS + 5 }, (_, i) => ({ name: `c${i}`, icon: 'bolt' }))
    expect(sanitizeFavoriteCommands(many)).toHaveLength(MAX_FAVORITE_COMMANDS)
  })
  it('ignores extra fields', () => {
    expect(sanitizeFavoriteCommands([{ name: 'a', icon: 'bolt', __proto__: { x: 1 }, extra: 1 }])).toEqual([
      { name: 'a', icon: 'bolt' }
    ])
  })
})

describe('parseFavoriteCommands', () => {
  it('accepts a valid list', () => {
    expect(parseFavoriteCommands([{ name: 'test-e2e', icon: 'flask' }])).toEqual([{ name: 'test-e2e', icon: 'flask' }])
    expect(parseFavoriteCommands([])).toEqual([])
  })
  it('rejects the whole list with an invalid, repeated or over-the-cap item', () => {
    expect(() =>
      parseFavoriteCommands([
        { name: 'a', icon: 'bolt' },
        { name: 'b', icon: 'x' }
      ])
    ).toThrow('commands favoritos')
    expect(() =>
      parseFavoriteCommands([
        { name: 'a', icon: 'bolt' },
        { name: 'a', icon: 'play' }
      ])
    ).toThrow()
    expect(() => parseFavoriteCommands('a')).toThrow()
    const many = Array.from({ length: MAX_FAVORITE_COMMANDS + 1 }, (_, i) => ({ name: `c${i}`, icon: 'bolt' }))
    expect(() => parseFavoriteCommands(many)).toThrow()
  })
})

describe('icons', () => {
  it('does not repeat an icon and every one has a pt-BR label', () => {
    expect(new Set(FAVORITE_COMMAND_ICONS).size).toBe(FAVORITE_COMMAND_ICONS.length)
    for (const name of FAVORITE_COMMAND_ICONS) expect(FAVORITE_COMMAND_ICON_LABELS[name]).toBeTruthy()
    expect(Object.keys(FAVORITE_COMMAND_ICON_LABELS)).toHaveLength(FAVORITE_COMMAND_ICONS.length)
  })
  it('accepts a new icon in the list', () => {
    expect(sanitizeFavoriteCommands([{ name: 'a', icon: 'agent' }])).toEqual([{ name: 'a', icon: 'agent' }])
  })
})
