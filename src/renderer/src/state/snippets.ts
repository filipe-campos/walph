import type { SnippetsState } from '../types/snippets'

export function globalSnippetsState(): SnippetsState {
  return { snippets: { snippets: [], files: [], errors: [] } }
}
