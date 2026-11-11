// Tab EditorConfig: reads the `.editorconfig` files from the file's folder upwards (reading is free, through main's
// `fs`), caches per folder and per tab, and reapplies when one of them changes in the watcher. The properties beat the
// user and workspace settings for that file; the user's explicit choice in the tab (encoding, EOL) beats EditorConfig.
import type { TextEncoding, WorkspaceChange } from '@shared/types'
import {
  editorConfigIndent,
  editorConfigRulers,
  parseEditorConfig,
  resolveEditorConfig,
  type EditorConfigFile,
  type EditorConfigProps,
  type EditorConfigSource
} from './lib/editorConfig'
import { chosenEncoding } from './lib/encodings'
import { basename, dirname, sepOf } from './lib/path'
import { createReactionScope } from './lib/reactions'
import { resolveIndent, type Eol, type Indent } from './lib/textFormat'
import { setDocumentIndent, setDocumentRulers } from './components/editor/documentConfig'
import { defaultIndent, findFileTab, get, onRootChange, onTabsClosed, patchTab, useStore } from './store'
import type { FileTab } from './types/tabs'

const api = window.api

const CONFIG_NAME = '.editorconfig'
/** Maximum depth walking up folders (protection against a pathological path). */
const MAX_DEPTH = 64

const dirConfigs = new Map<string, Promise<EditorConfigFile | null>>()
const tabConfigs = new Map<string, { path: string; props: EditorConfigProps }>()

function readDirConfig(dir: string): Promise<EditorConfigFile | null> {
  let pending = dirConfigs.get(dir)
  if (!pending) {
    const sep = sepOf(dir)
    const path = dir.endsWith(sep) ? `${dir}${CONFIG_NAME}` : `${dir}${sep}${CONFIG_NAME}`
    // `exists` first: reading a missing file would reject in main for every folder without `.editorconfig`.
    pending = api.fs
      .exists(path)
      .then((found) => (found ? api.fs.readFile(path).then(parseEditorConfig) : null))
      .catch(() => null)
    dirConfigs.set(dir, pending)
  }
  return pending
}

function ancestors(path: string): string[] {
  const dirs: string[] = []
  let dir = dirname(path)
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    dirs.push(dir)
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return dirs
}

/** EditorConfig properties for `path` (empty without `.editorconfig` or if the read fails). */
export async function editorConfigFor(path: string): Promise<EditorConfigProps> {
  const dirs = ancestors(path)
  const files = await Promise.all(dirs.map(readDirConfig))
  const sources: EditorConfigSource[] = []
  for (const [i, file] of files.entries()) {
    const dir = dirs[i]
    if (!file || dir === undefined) continue
    sources.push({ dir, file })
    if (file.root) break
  }
  return resolveEditorConfig(path, sources)
}

/** Before loading the tab: stores the properties and the rulers, which go straight into the new document. */
export async function prepareTabEditorConfig(tabId: string, path: string): Promise<EditorConfigProps> {
  const props = await editorConfigFor(path)
  tabConfigs.set(tabId, { path, props })
  setDocumentRulers(tabId, editorConfigRulers(props))
  return props
}

export function tabEditorConfig(tabId: string): EditorConfigProps {
  return tabConfigs.get(tabId)?.props ?? {}
}

/** Indentation of the text read for the tab: the detected one (or the settings one), with EditorConfig's on top. */
export function resolveTabIndent(tabId: string, text: string): { indent: Indent; fallback: boolean } {
  const resolved = resolveIndent(text, defaultIndent())
  const indent = editorConfigIndent(resolved.indent, tabEditorConfig(tabId), get().settings['editor.tabSize'])
  return indent ? { indent, fallback: false } : resolved
}

/**
 * Encoding to force when reading: the one chosen by the user; otherwise `latin1` from EditorConfig (without a BOM there
 * is no way to detect it). Main already detects the others (`utf-8`, `utf-16`) by the BOM.
 */
export function readEncodingFor(tab: FileTab): TextEncoding | undefined {
  const encoding = tabEditorConfig(tab.id).encoding
  return chosenEncoding(tab) ?? (encoding === 'iso88591' ? encoding : undefined)
}

/**
 * EOL and encoding to write. `eolChosen`: the user changed the EOL in this tab (status bar) and the choice wins; the
 * encoding chosen by the user also wins.
 */
export function saveFormatFor(tab: FileTab, eolChosen: boolean): { eol: Eol; encoding: TextEncoding | undefined } {
  const props = tabEditorConfig(tab.id)
  const eol = (eolChosen ? undefined : props.endOfLine) ?? tab.eol ?? 'LF'
  const encoding = chosenEncoding(tab) ?? props.encoding ?? tab.encoding ?? undefined
  return { eol, encoding }
}

const sameIndent = (a: Indent, b: Indent): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Rereads the EditorConfig of an already prepared tab (`.editorconfig` changed, the tab was renamed) and applies rulers
 * and indent.
 */
async function refreshTab(tabId: string): Promise<void> {
  const tab = findFileTab(tabId)
  const known = tabConfigs.get(tabId)
  if (!tab || !known) return
  // The new path already counts as seen: other `tabs` changes during the read do not trigger another one.
  tabConfigs.set(tabId, { path: tab.path, props: known.props })
  const props = await editorConfigFor(tab.path)
  const now = findFileTab(tabId)
  if (!now || now.path !== tab.path || !tabConfigs.has(tabId)) return
  tabConfigs.set(tabId, { path: now.path, props })
  setDocumentRulers(tabId, editorConfigRulers(props))
  if (!now.indent) return
  const indent = editorConfigIndent(now.indent, props, get().settings['editor.tabSize'])
  if (!indent || sameIndent(indent, now.indent)) return
  patchTab(tabId, { indent, indentFallback: false })
  setDocumentIndent(tabId, indent)
}

function refreshAll(): void {
  for (const id of tabConfigs.keys()) void refreshTab(id)
}

function handleChange(change: WorkspaceChange): void {
  if (change.full) {
    dirConfigs.clear()
    return refreshAll()
  }
  const touched = change.files.filter((f) => basename(f.path) === CONFIG_NAME)
  if (touched.length === 0) return
  for (const file of touched) dirConfigs.delete(dirname(file.path))
  refreshAll()
}

export function startEditorConfigReactions(): () => void {
  const scope = createReactionScope()
  scope.add(api.workspace.onChange(handleChange))
  scope.add(onRootChange(() => dirConfigs.clear()))
  scope.add(
    onTabsClosed((ids) => {
      for (const id of ids) tabConfigs.delete(id)
    })
  )
  // Renaming/moving an open file: the EditorConfig of the new path may differ.
  scope.add(
    useStore.subscribe(
      (s) => s.tabs,
      (tabs) => {
        for (const tab of tabs) {
          const known = tabConfigs.get(tab.id)
          if (tab.kind === 'file' && known && known.path !== tab.path) void refreshTab(tab.id)
        }
      }
    )
  )
  return scope.stop
}
