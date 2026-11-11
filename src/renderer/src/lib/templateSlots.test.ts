import { describe, expect, it } from 'vitest'
import { splitTemplate } from './templateSlots'

describe('splitTemplate', () => {
  it('splits text and slots in the order they appear', () => {
    expect(splitTemplate('Create {file} in {dir}.')).toEqual([
      'Create ',
      { slot: 'file' },
      ' in ',
      { slot: 'dir' },
      '.'
    ])
  })

  it('accepts slots at the ends and text without slots', () => {
    expect(splitTemplate('{a}{b}')).toEqual([{ slot: 'a' }, { slot: 'b' }])
    expect(splitTemplate('text')).toEqual(['text'])
    expect(splitTemplate('')).toEqual([])
  })
})
