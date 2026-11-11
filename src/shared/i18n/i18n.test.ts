import { describe, expect, it } from 'vitest'
import { CATALOGS } from './catalog'
import { LOCALES, matchSystemLocale, resolveLocale } from './locale'

describe('matchSystemLocale', () => {
  it('uses the first supported language and groups the regional variants', () => {
    expect(matchSystemLocale(['pt-PT'])).toBe('pt-BR')
    expect(matchSystemLocale(['es-419', 'en-US'])).toBe('es')
    expect(matchSystemLocale(['de-DE', 'en-GB'])).toBe('en')
    expect(matchSystemLocale(['zh_CN'])).toBe('en')
    expect(matchSystemLocale([])).toBe('en')
  })

  it('a fixed language ignores the system', () => {
    expect(resolveLocale('es', ['pt-BR'])).toBe('es')
    expect(resolveLocale('system', ['pt-BR'])).toBe('pt-BR')
  })
})

interface Leaf {
  path: string
  value: unknown
}

function leaves(tree: unknown, prefix = ''): Leaf[] {
  return Object.entries(tree as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? leaves(v, `${prefix}${k}/`) : [{ path: `${prefix}${k}`, value: v }]
  )
}

describe('catalogs', () => {
  it('every language has the same keys and no empty text', () => {
    const shape = (locale: (typeof LOCALES)[number]): string[] =>
      leaves(CATALOGS[locale])
        .map((leaf) => `${leaf.path}:${typeof leaf.value}`)
        .sort()
    const reference = shape('pt-BR')
    for (const locale of LOCALES) {
      expect(shape(locale)).toEqual(reference)
      for (const leaf of leaves(CATALOGS[locale])) expect(leaf.value, `${locale} ${leaf.path}`).not.toBe('')
    }
  })
})
