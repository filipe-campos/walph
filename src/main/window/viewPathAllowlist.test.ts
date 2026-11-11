import { describe, expect, it } from 'vitest'
import { fakeWebContents } from '../testing/fakeIpc'
import { createViewPathAllowlist } from './viewPathAllowlist'

const asWc = (
  wc: ReturnType<typeof fakeWebContents>
): Parameters<ReturnType<typeof createViewPathAllowlist>['allow']>[0] => wc as never

describe('createViewPathAllowlist', () => {
  it('isolates per view and forgets on reset', async () => {
    const lists = createViewPathAllowlist('test:a')
    const a = fakeWebContents()
    const b = fakeWebContents()
    await lists.allow(asWc(a), '/tmp/x')
    expect(await lists.verify(asWc(a), '/tmp/x')).toBe('ok')
    expect(await lists.verify(asWc(b), '/tmp/x')).toBe('unknown')
    a.emit('did-navigate')
    expect(await lists.verify(asWc(a), '/tmp/x')).toBe('unknown')
  })

  it('a destroyed view neither records nor is retained', async () => {
    const lists = createViewPathAllowlist('test:b')
    const wc = fakeWebContents()
    wc.isDestroyed.mockReturnValue(true)
    await lists.allow(asWc(wc), '/tmp/x')
    expect(wc.on).not.toHaveBeenCalled()
    expect(await lists.verify(asWc(wc), '/tmp/x')).toBe('unknown')
  })

  it('a read that ends after the reload does not land in the new list', async () => {
    const lists = createViewPathAllowlist('test:c')
    const wc = fakeWebContents()
    const pending = lists.allow(asWc(wc), '/tmp/x')
    wc.emit('did-navigate')
    await pending
    expect(await lists.verify(asWc(wc), '/tmp/x')).toBe('unknown')
  })
})
