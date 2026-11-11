// User snippets, snippet choices and Emmet, per tab (the canonical and the mirror copy carry the same).
import type { Extension } from '@codemirror/state'
import { emmetExtension } from './emmet'
import { snippetChoices } from './snippetChoices'
import { snippetCompletion } from './snippetCompletion'

export function snippetExtensions(tabId: string): Extension {
  return [snippetChoices, snippetCompletion(tabId), emmetExtension]
}
