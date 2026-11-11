// Live reconfiguration of the loaded tabs: theme, language, editor settings, language mode, indent, git base,
// diagnostics and the LSP lightbulb gutter. Each effect applies to every copy of the tab state (owner, mirror, stored).
import type { Extension, StateEffect } from '@codemirror/state'
import type { LanguageSupport } from '@codemirror/language'
import type { Diagnostic } from '@shared/types'
import { editorConfigExtension, editorPhrases, phrasesCompartment, themeCompartment } from './setup'
import {
  bulbOn,
  getEditorConfig,
  indentation,
  indentExtension,
  indents,
  language,
  lensOn,
  states,
  storeEditorConfig,
  storeEditorTheme,
  tabOptions,
  tabOptionsExtension,
  tabRulers,
  viewSettings,
  type EditorConfig
} from './documentState'
import { currentState, dispatchEffects, dispatchToEmptyViews, ownerView, viewsOfTab } from './groupViews'
import { setBaseline } from './gitGutter'
import {
  blameInlineExtension,
  blameInlineSlot,
  setBlame,
  setBlameGutter,
  storeBlameInline,
  type BlameInput
} from './gitBlame'
import { setDiagnosticsOn } from './diagnostics'
import { lightbulbOn, lightbulbSlot } from './lspCodeActions'
import { codeLensOn, codeLensSlot } from './lspCodeLens'
import { lspHost } from './lspHost'
import { lspDocPath, lspReconcilePaths } from './lspSync'
import type { Indent } from '../../lib/textFormat'

/** `null` = no language (plain text). */
export function applyLanguage(tabId: string, support: LanguageSupport | null): void {
  dispatchEffects(tabId, [language.reconfigure(support ?? [])])
}

/** Sets the base line (index content, in lines) of a loaded tab's gutter; `null` clears the marks. */
export function setDocumentBaseline(tabId: string, lines: string[] | null): void {
  dispatchEffects(tabId, [setBaseline.of(lines)])
}

/** Hands the blame (and the annotated text) to a loaded tab; `null` clears it. */
export function setDocumentBlame(tabId: string, input: BlameInput | null): void {
  dispatchEffects(tabId, [setBlame.of(input)])
}

/** Turns the whole-file blame gutter on/off in a loaded tab. */
export function setDocumentBlameGutter(tabId: string, on: boolean): void {
  dispatchEffects(tabId, [setBlameGutter.of(on)])
}

/** `git.blame.inline`: the annotation at the end of the cursor line, in every loaded tab. */
export function setBlameInline(on: boolean): void {
  storeBlameInline(on)
  reconfigureAll(() => [blameInlineSlot.reconfigure(blameInlineExtension(on))])
}

/** Shows the LSP diagnostics in a loaded tab (visible or stored); positions follow the current document. */
export function setDocumentDiagnostics(tabId: string, diagnostics: Diagnostic[]): void {
  for (const view of viewsOfTab(tabId)) {
    setDiagnosticsOn(view.state, diagnostics, (spec) => view.dispatch(spec))
  }
  if (ownerView(tabId)) return
  const stored = states.get(tabId)
  if (stored) setDiagnosticsOn(stored, diagnostics, (spec) => states.set(tabId, stored.update(spec).state))
}

/** The path of open tabs changed (rename): the LSP moves the document. */
export function syncLspPaths(): void {
  lspReconcilePaths((id) => currentState(id)?.doc.toString())
  refreshLspGutters()
}

export function wantsBulb(tabId: string): boolean {
  const path = lspDocPath(tabId)
  return !!path && !!lspHost().serverFor(path)?.ready
}

export function wantsCodeLens(tabId: string): boolean {
  return getEditorConfig().codeLens && wantsBulb(tabId)
}

/**
 * The server status (or a tab path, or `editor.codeLens`) changed: turns the lightbulb gutter and the
 * code lenses on/off where the answer changed.
 */
export function refreshLspGutters(): void {
  reconfigureAll((id) => {
    const effects: StateEffect<unknown>[] = []
    const bulb = wantsBulb(id)
    if (bulb !== (bulbOn.get(id) ?? false)) {
      bulbOn.set(id, bulb)
      effects.push(lightbulbSlot.reconfigure(bulb ? lightbulbOn : []))
    }
    const lens = wantsCodeLens(id)
    if (lens !== (lensOn.get(id) ?? false)) {
      lensOn.set(id, lens)
      effects.push(codeLensSlot.reconfigure(lens ? codeLensOn : []))
    }
    return effects
  })
}

/** Applies the effects (computed once per tab) to every copy of the state of each loaded tab. */
function reconfigureAll(effectsFor: (tabId: string) => StateEffect<unknown>[]): void {
  for (const id of [...states.keys()]) {
    const effects = effectsFor(id)
    if (effects.length) dispatchEffects(id, effects)
  }
}

export function setEditorTheme(next: Extension): void {
  storeEditorTheme(next)
  reconfigureAll(() => [themeCompartment.reconfigure(next)])
  dispatchToEmptyViews([themeCompartment.reconfigure(next)])
}

/** The language changed: CodeMirror's built-in texts (and the widgets that observe them) switch to the new one. */
export function setEditorPhrases(): void {
  const next = editorPhrases()
  reconfigureAll(() => [phrasesCompartment.reconfigure(next)])
  dispatchToEmptyViews([phrasesCompartment.reconfigure(next)])
}

export function setEditorConfig(next: EditorConfig): void {
  const prev = getEditorConfig()
  storeEditorConfig(next)
  const viewChanged =
    prev.wordWrap !== next.wordWrap ||
    prev.lineNumbers !== next.lineNumbers ||
    prev.minimap !== next.minimap ||
    prev.renderWhitespace !== next.renderWhitespace ||
    prev.stickyScroll !== next.stickyScroll
  const tabChanged = prev.tabSize !== next.tabSize
  const rulersChanged = prev.rulers.join() !== next.rulers.join()
  if (prev.codeLens !== next.codeLens) refreshLspGutters()
  if (!viewChanged && !tabChanged && !rulersChanged) return
  reconfigureAll((id) => {
    const effects: StateEffect<unknown>[] = []
    if (viewChanged) effects.push(viewSettings.reconfigure(editorConfigExtension(next)))
    if (rulersChanged) effects.push(tabOptions.reconfigure(tabOptionsExtension(id)))
    const indent = indents.get(id)
    if (tabChanged && indent) effects.push(indentation.reconfigure(indentExtension(indent, next.tabSize)))
    return effects
  })
}

/** The tab's own rulers (EditorConfig), added to those of `editor.rulers`. Applies before the document loads too. */
export function setDocumentRulers(tabId: string, columns: number[]): void {
  const prev = tabRulers.get(tabId) ?? []
  if (columns.length === 0) tabRulers.delete(tabId)
  else tabRulers.set(tabId, columns)
  if (prev.join() === columns.join() || !states.has(tabId)) return
  dispatchEffects(tabId, [tabOptions.reconfigure(tabOptionsExtension(tabId))])
}

/** Changes a tab indent (tabs in fallback follow `editor.tabSize`/`insertSpaces`). */
export function setDocumentIndent(tabId: string, indent: Indent, tabSize: number = getEditorConfig().tabSize): void {
  if (!states.has(tabId)) return
  indents.set(tabId, indent)
  dispatchEffects(tabId, [indentation.reconfigure(indentExtension(indent, tabSize))])
}
