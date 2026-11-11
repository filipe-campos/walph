// LSP navigation: definition, implementation, type, declaration, references (list or peek), symbols and back/forward.
// Every jump records where it came from.
import { t } from '@shared/i18n'
import type { LspDocumentSymbol, LspLocation, LspPosition, LspSymbol } from '@shared/types'
import { hasDocument } from './components/editor/documentState'
import { currentState, getView, shownTabId } from './components/editor/groupViews'
import { openPeek } from './components/editor/lspPeek'
import { offsetToLspPosition, rangeToReveal } from '@shared/lspPosition'
import { locateSymbolName } from './lib/lspSymbols'
import { locationToItem, type ReferenceItem } from './lib/lspReferences'
import { stepNavigation, recordNavigation } from './navigationState'
import { splitLines } from './lib/textFormat'
import { get, set } from './store'
import { attempt } from './attempt'
import type { ReferencesResult } from './types/lsp'
import { notify } from './toasts'
import { openFile } from './tabActions'
import { fileTabs } from './workspaceEditActions'

const api = window.api

export interface ActiveFile {
  tabId: string
  path: string
  view: NonNullable<ReturnType<typeof getView>>
}

/** File the editor shows now (the active tab and the displayed one must match), or `null`. */
export function activeFile(): ActiveFile | null {
  const view = getView()
  const tabId = shownTabId()
  const { activeTabId, tabs } = get()
  const tab = tabs.find((t) => t.id === tabId && t.kind === 'file')
  if (!view || !tab || tab.id !== activeTabId) return null
  return { tabId: tab.id, path: tab.path, view }
}

/** Shows the locations list in the panel References view (replaces the previous one). */
function setReferences(references: ReferencesResult): void {
  set({ references, panelView: 'references', terminalVisible: true })
}

function revealOf(location: LspLocation): { line: number; column: number; length: number } {
  return rangeToReveal(location.range)
}

/** Jumps to a location, storing where it came from (⌃- goes back). */
function jumpTo(location: LspLocation): void {
  recordNavigation()
  openFile(location.path, revealOf(location), { preview: true })
}

/** Jump coming from a list item (clicked reference). */
export function jumpToItem(item: Pick<ReferenceItem, 'path' | 'line' | 'column' | 'length'>): void {
  recordNavigation()
  openFile(item.path, { line: item.line, column: item.column, length: item.length }, { preview: true })
}

/** Opens a symbol from the search (`@`/`#`) with the cursor on the name, not at the start of the declaration. */
export async function revealSymbol(symbol: LspSymbol): Promise<void> {
  const { path, range } = symbol.location
  const lines = (await previewLines([symbol.location])).get(path)
  const lineText = lines?.[range.start.line]
  const column =
    lineText === undefined ? range.start.character : locateSymbolName(lineText, symbol.name, range.start.character)
  recordNavigation()
  openFile(path, { line: range.start.line + 1, column, length: 0 })
}

/** Moves the cursor to the name of a symbol in the file tree (Outline, breadcrumbs), recording the jump. */
export function revealDocumentSymbol(path: string, symbol: LspDocumentSymbol): void {
  const { start } = symbol.selectionRange
  recordNavigation()
  openFile(path, { line: start.line + 1, column: start.character, length: 0 })
}

export function navigate(direction: 'back' | 'forward'): void {
  const target = stepNavigation(direction)
  if (!target) return
  // Without recording: the step already moved the history.
  openFile(target.path, { line: target.line, column: target.column, length: 0 }, { preview: true })
}

/** File lines: from the loaded tab document, otherwise from disk; `null` if it could not be read. */
export async function fileLines(path: string): Promise<string[] | null> {
  const tab = fileTabs().find((t) => t.path === path && hasDocument(t.id))
  const state = tab ? currentState(tab.id) : undefined
  if (state) return state.doc.toString().split('\n')
  try {
    return splitLines(await api.fs.readFile(path))
  } catch {
    return null
  }
}

async function previewLines(locations: LspLocation[]): Promise<Map<string, string[] | null>> {
  const lines = new Map<string, string[] | null>()
  const paths = [...new Set(locations.map((l) => l.path))].slice(0, 200)
  await Promise.all(paths.map(async (path) => lines.set(path, await fileLines(path))))
  return lines
}

/** Shows locations in the References view (with each one's line as a preview). */
async function showLocations(title: string, locations: LspLocation[]): Promise<void> {
  const root = get().root
  const lines = await previewLines(locations)
  if (get().root !== root) return
  const items = locations.map((l) => locationToItem(l, lines.get(l.path)?.[l.range.start.line]))
  setReferences({ title, items })
}

/** "Go to…" requests that return locations. */
export type LocationKind = 'definition' | 'implementation' | 'typeDefinition' | 'declaration' | 'references'

const FETCH: Record<LocationKind, (path: string, position: LspPosition) => Promise<LspLocation[]>> = {
  definition: (path, position) => api.lsp.definition(path, position),
  implementation: (path, position) => api.lsp.implementation(path, position),
  typeDefinition: (path, position) => api.lsp.typeDefinition(path, position),
  declaration: (path, position) => api.lsp.declaration(path, position),
  references: (path, position) => api.lsp.references(path, position)
}

interface LocationMessages {
  none: string
  noneFor(name: string): string
  title: string
  titleOf(name: string): string
}

function locationMessages(kind: LocationKind): LocationMessages {
  const n = t().lsp.navigation
  switch (kind) {
    case 'definition':
      return { none: n.noDefinition, noneFor: n.noDefinitionFor, title: n.definitions, titleOf: n.definitionsOf }
    case 'references':
      return { none: n.noReference, noneFor: n.noReferenceFor, title: n.references, titleOf: n.referencesOf }
    default:
      return t().lspNavigation.locations[kind]
  }
}

interface LocationQuery {
  file: ActiveFile
  /** Offset the request started from. */
  pos: number
  title: string
  locations: LspLocation[]
}

/**
 * Locations of `kind` at the cursor (or at `offset`) of the active file. `null` if there is no file, the request failed
 * (already notified), the tab changed while the server answered (the result would surprise) or there is no location
 * (notifies).
 */
async function queryLocations(kind: LocationKind, offset?: number): Promise<LocationQuery | null> {
  const file = activeFile()
  if (!file) return null
  const { view, tabId, path } = file
  const doc = view.state.doc
  const pos = offset ?? view.state.selection.main.head
  const word = view.state.wordAt(pos)
  const locations = await attempt(() => FETCH[kind](path, offsetToLspPosition(doc, pos)), { fallback: null })
  if (!locations || shownTabId() !== tabId || getView() !== view) return null
  const name = word ? doc.sliceString(word.from, word.to) : ''
  const messages = locationMessages(kind)
  if (locations.length === 0) {
    notify(name ? messages.noneFor(name) : messages.none, 'info')
    return null
  }
  return { file, pos, title: name ? messages.titleOf(name) : messages.title, locations }
}

/** "Go to…": a single target jumps directly; several (or references) go to the References view. */
export async function goToLocations(kind: LocationKind, offset?: number): Promise<void> {
  const query = await queryLocations(kind, offset)
  if (!query) return
  const [only] = query.locations
  if (kind !== 'references' && query.locations.length === 1 && only) return jumpTo(only)
  await showLocations(query.title, query.locations)
}

export function goToDefinition(offset?: number): Promise<void> {
  return goToLocations('definition', offset)
}

export function goToReferences(): Promise<void> {
  return goToLocations('references')
}

/** "Peek…": the locations appear in the peek below the cursor line, without leaving the file. */
export async function peekLocations(kind: LocationKind): Promise<void> {
  const query = await queryLocations(kind)
  if (query) openPeek(query.file.view, query)
}

/** Opens a location chosen in the peek or in a code lens, storing where it came from. */
export function openLocation(location: LspLocation): void {
  jumpTo(location)
}
