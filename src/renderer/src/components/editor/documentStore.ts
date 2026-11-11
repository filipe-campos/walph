// Loading, saving and editing the tab content, outside the component (and without importing the store) so the store and
// the commands save/reload tabs without an import cycle.
import { EditorSelection, EditorState, Transaction, type Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { EditorView, keymap } from '@codemirror/view'
import { omitUndefined } from '@shared/omitUndefined'
import type { TextEdit } from '@shared/searchReplace'
import type { TextEncoding } from '@shared/types'
import { changedRange } from '../../lib/textDiff'
import { positionToOffset } from '../../lib/session'
import { serializeDoc, type Eol, type Indent } from '../../lib/textFormat'
import {
  bulbOn,
  getEditorConfig,
  getEditorTheme,
  handlers,
  indentation,
  indentExtension,
  indents,
  language,
  lensOn,
  normalizedDoc,
  notifyDocChanged,
  notifyEdit,
  pendingViews,
  savedDocs,
  states,
  tabOptions,
  tabOptionsExtension,
  tabRulers,
  topLines,
  viewSettings
} from './documentState'
import {
  baseSetup,
  editorBase,
  editorConfigExtension,
  editorPhrases,
  phrasesCompartment,
  themeCompartment
} from './setup'
import { cursorListener, currentState, dispatchEffects, dropOwner, ownerView } from './groupViews'
import { wantsBulb, wantsCodeLens } from './documentConfig'
import { gitGutter } from './gitGutter'
import { gitBlame } from './gitBlame'
import { mergeConflicts } from './mergeConflicts'
import { breakpointGutter } from './breakpointGutter'
import { overviewRuler } from './overviewRuler'
import { lspExtensions } from './lspExtensions'
import { snippetExtensions } from './snippetExtensions'
import { lightbulbOn, lightbulbSlot } from './lspCodeActions'
import { codeLensOn, codeLensSlot } from './lspCodeLens'
import { lspChange, lspClose, lspOpen, lspSave } from './lspSync'

function extensionsFor(tabId: string, indent: Indent): Extension[] {
  const config = getEditorConfig()
  return [
    lspExtensions(tabId),
    snippetExtensions(tabId),
    gitBlame(),
    breakpointGutter(true),
    baseSetup,
    gitGutter(),
    mergeConflicts(),
    overviewRuler,
    keymap.of([indentWithTab]),
    editorBase,
    themeCompartment.of(getEditorTheme()),
    phrasesCompartment.of(editorPhrases()),
    viewSettings.of(editorConfigExtension(config)),
    language.of([]),
    indentation.of(indentExtension(indent, config.tabSize)),
    tabOptions.of(tabOptionsExtension(tabId)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        lspChange(tabId, update.startState.doc, update.changes)
        const saved = savedDocs.get(tabId)
        handlers.setDirty(tabId, !saved || !update.state.doc.eq(saved))
        // Reloading from disk does not enter the history (`addToHistory: false`) and does not count as an edit.
        if (update.transactions.some((tr) => tr.annotation(Transaction.addToHistory) !== false)) notifyEdit(tabId)
        notifyDocChanged(tabId)
      }
    }),
    cursorListener()
  ]
}

export function loadDocument(tabId: string, text: string, indent: Indent): EditorState {
  const doc = normalizedDoc(text)
  const pending = pendingViews.get(tabId)
  lspOpen(tabId, doc.toString())
  let state = EditorState.create({
    doc,
    ...omitUndefined({
      selection: pending ? EditorSelection.cursor(positionToOffset(doc, pending.cursor)) : undefined
    }),
    extensions: extensionsFor(tabId, indent)
  })
  // The lightbulb gutter is born on if the file server is ready (the path only exists after `lspOpen`).
  const bulb = wantsBulb(tabId)
  bulbOn.set(tabId, bulb)
  if (bulb) state = state.update({ effects: lightbulbSlot.reconfigure(lightbulbOn) }).state
  const lens = wantsCodeLens(tabId)
  lensOn.set(tabId, lens)
  if (lens) state = state.update({ effects: codeLensSlot.reconfigure(codeLensOn) }).state
  if (pending) {
    topLines.set(tabId, pending.topLine)
    pendingViews.delete(tabId)
  }
  states.set(tabId, state)
  indents.set(tabId, indent)
  savedDocs.set(tabId, state.doc)
  notifyDocChanged(tabId)
  return state
}

export function forgetDocument(tabId: string): void {
  lspClose(tabId)
  bulbOn.delete(tabId)
  lensOn.delete(tabId)
  states.delete(tabId)
  savedDocs.delete(tabId)
  indents.delete(tabId)
  tabRulers.delete(tabId)
  topLines.delete(tabId)
  pendingViews.delete(tabId)
  dropOwner(tabId)
}

/**
 * Saves the document with the original EOL and takes it as the base line. The base is updated before the write (and
 * reverted if it fails) so the watcher event of the save itself does not look like an external change.
 * Returns whether there are still edits made during the write (the tab stays dirty).
 */
export async function saveDocument(
  tabId: string,
  path: string,
  eol: Eol,
  encoding?: TextEncoding
): Promise<boolean | null> {
  const state = currentState(tabId)
  if (!state) return null
  const doc = state.doc
  const previous = savedDocs.get(tabId)
  savedDocs.set(tabId, doc)
  try {
    await window.api.fs.writeFile(path, serializeDoc(doc, eol), encoding)
    lspSave(tabId)
  } catch (err) {
    if (previous && savedDocs.get(tabId) === doc) savedDocs.set(tabId, previous)
    throw err
  }
  const latest = currentState(tabId)
  return !!latest && !latest.doc.eq(doc)
}

/**
 * Replaces the content with the disk one touching only the differing range (cursor and scroll are kept) and adopts the
 * text as the new base line. `false` if the tab is not loaded (it will be read from disk when shown).
 */
export function replaceDocument(tabId: string, text: string, indent: Indent): boolean {
  const state = currentState(tabId)
  if (!state) return false
  const next = normalizedDoc(text)
  savedDocs.set(tabId, next)
  indents.set(tabId, indent)
  const change = changedRange(state.doc.toString(), next.toString())
  const effects = indentation.reconfigure(indentExtension(indent, getEditorConfig().tabSize))
  // Reloading from disk is not a user edit: it does not enter undo.
  const annotations = Transaction.addToHistory.of(false)
  const owner = ownerView(tabId)
  if (owner) {
    // The text reaches the sibling view through the resend; the indent is an effect and applies to both.
    owner.dispatch({ ...omitUndefined({ changes: change ?? undefined }), annotations })
    dispatchEffects(tabId, [effects])
  } else {
    // A hidden tab does not go through the updateListener: notifies the LSP by hand.
    const tr = state.update({ ...omitUndefined({ changes: change ?? undefined }), effects, annotations })
    states.set(tabId, tr.state)
    lspChange(tabId, state.doc, tr.changes)
    notifyDocChanged(tabId)
  }
  return true
}

/**
 * Applies edits (offsets of the current document, non-overlapping) in a single transaction, so a single undo. Works
 * with
 * the tab visible or stored. `false` if the tab is not loaded.
 */
export function applyTabEdits(tabId: string, edits: TextEdit[]): boolean {
  const state = currentState(tabId)
  if (!state) return false
  if (edits.length === 0) return true
  const changes = edits.map(({ from, to, insert }) => ({ from, to, insert }))
  const owner = ownerView(tabId)
  if (owner) {
    // The owner view updateListener handles dirty and auto save; the sibling view gets the text through the resend.
    owner.dispatch({ changes, userEvent: 'input.replace' })
    return true
  }
  const tr = state.update({ changes, userEvent: 'input.replace' })
  const next = tr.state
  states.set(tabId, next)
  lspChange(tabId, state.doc, tr.changes)
  // A hidden tab does not go through the updateListener: notifies by hand.
  const saved = savedDocs.get(tabId)
  handlers.setDirty(tabId, !saved || !next.doc.eq(saved))
  notifyEdit(tabId)
  notifyDocChanged(tabId)
  return true
}
