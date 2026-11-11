import { describe, expect, it } from 'vitest'
import { chosenEncoding } from './encodings'

describe('chosenEncoding', () => {
  it('only the encoding the user chose counts', () => {
    expect(chosenEncoding({ encodingChosen: true, encoding: 'windows1252' })).toBe('windows1252')
    expect(chosenEncoding({ encodingChosen: false, encoding: 'utf8bom' })).toBeUndefined()
    expect(chosenEncoding({ encodingChosen: true, encoding: null })).toBeUndefined()
  })

  it('without a tab there is no encoding', () => {
    expect(chosenEncoding(undefined)).toBeUndefined()
  })
})
