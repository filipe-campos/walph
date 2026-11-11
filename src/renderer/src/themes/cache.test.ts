import { beforeEach, describe, expect, it } from 'vitest'
import { saveCachedTheme } from './cache'
import { walphLight } from './walphLight'
import script from '../../public/themeBoot.js?raw'

const boot = (): void => void new Function(script)()

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
})

describe('cache.ts <-> themeBoot.js contract', () => {
  it('applies the colors and the color-scheme of the saved theme', () => {
    saveCachedTheme(walphLight)
    boot()
    const root = document.documentElement
    expect(root.style.getPropertyValue('--bg-000')).toBe(walphLight.colors['bg-000'])
    expect(root.style.colorScheme).toBe('light')
  })

  it('a missing or corrupted cache does not throw', () => {
    expect(boot).not.toThrow()
    localStorage.setItem('walph.themeColors.v2', '{not json')
    expect(boot).not.toThrow()
    localStorage.setItem('walph.themeColors.v2', JSON.stringify({ kind: 'light', colors: null }))
    expect(boot).not.toThrow()
    expect(document.documentElement.style.getPropertyValue('--bg-000')).toBe('')
  })
})
