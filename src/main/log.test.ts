import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLog } from './log'

describe('createLog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prefixes the scope and passes on the details in warn and error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const err = new Error('x')
    const log = createLog('recent')
    log.warn('warning', 1)
    log.error('failure', err)
    expect(warn).toHaveBeenCalledWith('[recent]', 'warning', 1)
    expect(error).toHaveBeenCalledWith('[recent]', 'failure', err)
  })
})
