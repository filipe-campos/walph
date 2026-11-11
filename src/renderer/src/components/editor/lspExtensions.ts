// All the CodeMirror extensions that talk to the LSP, per tab (each EditorState has its own, hidden or not).
import { Prec, type Extension } from '@codemirror/state'
import { lspTabId } from './lspHost'
import { lspCodeActions } from './lspCodeActions'
import { lspCodeLens } from './lspCodeLens'
import { lspCompletion } from './lspCompletion'
import { lspDocumentHighlights } from './lspDocumentHighlights'
import { lspHover } from './lspHover'
import { lspInlayHints } from './lspInlayHints'
import { lspLinks } from './lspLinks'
import { lspPeek } from './lspPeek'
import { lspRename } from './lspRename'
import { lspSemanticTokens } from './lspSemanticTokens'
import { lspSignatureHelp } from './lspSignatureHelp'

/**
 * They must come before `baseSetup`: the lightbulb gutter sits left of the line numbers, the menu and
 * signature help shortcuts (Esc) need precedence over the default keymap and the semantic marks sit inside the
 * syntax highlighting ones (their color wins).
 */
export function lspExtensions(tabId: string): Extension {
  return [
    lspTabId.of(tabId),
    lspCodeActions(tabId),
    Prec.high(lspSignatureHelp(tabId)),
    lspCompletion(tabId),
    lspHover(tabId),
    lspLinks(tabId),
    lspRename,
    lspInlayHints(tabId),
    lspDocumentHighlights(tabId),
    lspSemanticTokens(tabId),
    lspPeek(),
    lspCodeLens()
  ]
}
