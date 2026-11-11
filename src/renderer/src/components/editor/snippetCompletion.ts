// User/workspace snippets in the completion, added to the language and LSP sources through `languageData`.
import type { Completion, CompletionSource } from '@codemirror/autocomplete'
import { EditorState, type Extension } from '@codemirror/state'
import { t } from '@shared/i18n'
import type { Settings, UserSnippet } from '@shared/types'
import { parseSnippet, resolveVariables, snippetPlainText } from '../../lib/snippetSyntax'
import { choiceAt } from './snippetChoices'
import { expandSnippet } from './snippetExpand'
import { snippetHost } from './snippetHost'

const PREFIX = /[\p{L}\p{N}_$@#!-]+/u
const PREFIX_ONLY = /^[\p{L}\p{N}_$@#!-]*$/u

const BOOST: Record<Settings['editor.snippetSuggestions'], number> = { top: 99, bottom: -99, inline: 0, none: 0 }

/** Body text as the user would see it (variables by name): preview in the info panel. */
export function snippetPreview(body: string): string {
  return snippetPlainText(resolveVariables(parseSnippet(body), () => undefined))
}

function snippetInfo(snippet: UserSnippet): () => Node {
  return () => {
    const dom = document.createElement('div')
    dom.className = 'snippet-completion-info'
    if (snippet.description) {
      const description = document.createElement('div')
      description.className = 'lsp-info-detail'
      description.textContent = snippet.description
      dom.append(description)
    }
    const pre = document.createElement('pre')
    pre.className = 'snippet-preview'
    pre.textContent = snippetPreview(snippet.body)
    dom.append(pre)
    return dom
  }
}

/** One item per prefix; `apply` expands the snippet in place of what was typed. */
function snippetOptions(snippets: readonly UserSnippet[], boost: number): Completion[] {
  const tag = t().snippets.pick
  return snippets.flatMap((snippet) =>
    snippet.prefixes.map((prefix): Completion => ({
      label: prefix,
      detail: snippet.source === 'workspace' ? `${snippet.name} (${tag.workspace})` : snippet.name,
      info: snippetInfo(snippet),
      type: 'snippet',
      boost,
      apply: (view, completion, from, to) => void expandSnippet(view, snippet.body, from, to, { completion })
    }))
  )
}

function userSnippetSource(tabId: string): CompletionSource {
  return (ctx) => {
    const host = snippetHost()
    const mode = host.settings()['editor.snippetSuggestions']
    if (mode === 'none' || choiceAt(ctx.state)) return null
    const word = ctx.matchBefore(PREFIX)
    if (!word && !ctx.explicit) return null
    const snippets = host.snippetsFor(host.languageId(tabId))
    if (snippets.length === 0) return null
    return { from: word?.from ?? ctx.pos, options: snippetOptions(snippets, BOOST[mode]), validFor: PREFIX_ONLY }
  }
}

export function snippetCompletion(tabId: string): Extension {
  const source = userSnippetSource(tabId)
  return EditorState.languageData.of(() => [{ autocomplete: source }])
}
