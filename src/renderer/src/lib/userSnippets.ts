import type { UserSnippet } from '@shared/types'

/** Snippets that apply to the language: those without a scope and those that cite it. */
export function snippetsForLanguage(snippets: readonly UserSnippet[], languageId: string): UserSnippet[] {
  return snippets.filter((s) => !s.scopes || s.scopes.includes(languageId))
}
