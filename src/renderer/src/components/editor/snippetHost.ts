// Bridge between the CodeMirror snippet/Emmet extensions and the rest of the app (like `lspHost`): the store injects,
// in
// `snippetActions.ts`, the loaded snippets, the settings and the path of each tab.
import type { Settings, UserSnippet } from '@shared/types'

export interface SnippetHost {
  /** VS Code `languageId` of the tab (`plaintext` without a language). */
  languageId(tabId: string): string
  /** Absolute path of the tab (`null` = not a file). */
  filePath(tabId: string): string | null
  /** Folder of the view. */
  root(): string | null
  /** User and workspace snippets that apply to the language. */
  snippetsFor(languageId: string): readonly UserSnippet[]
  settings(): Pick<
    Settings,
    'editor.snippetSuggestions' | 'emmet.enabled' | 'emmet.triggerExpansionOnTab' | 'emmet.includeLanguages'
  >
}

let host: SnippetHost = {
  languageId: () => 'plaintext',
  filePath: () => null,
  root: () => null,
  snippetsFor: () => [],
  settings: () => ({
    'editor.snippetSuggestions': 'none',
    'emmet.enabled': false,
    'emmet.triggerExpansionOnTab': false,
    'emmet.includeLanguages': {}
  })
}

export function bindSnippetHost(next: SnippetHost): void {
  host = next
}

export function snippetHost(): SnippetHost {
  return host
}
