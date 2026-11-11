import type { WebContents } from 'electron'
import { app } from 'electron'
import { lstat, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import { isLanguageId } from '@shared/languageId'
import type { SnippetFile, SnippetFileKind, SnippetSnapshot, SnippetSource, UserSnippet } from '@shared/types'
import { comparePaths } from '@shared/pathCompare'
import { hasControl } from '@shared/controlChars'
import { createFileExclusive } from '../fs/atomicWrite'
import { AlreadyExistsError } from '../fs/moveNoOverwrite'
import { resolveInsideRoot } from '../fs/paths'
import { UserError } from '../errors'
import { watchNestedFile, type DirWatch } from '../settings/dirWatch'
import { oneOf } from '../validate/args'
import { requireViewRoot } from '../window/ownRoot'
import { send } from '../window/send'
import { onViewDestroyed } from '../window/viewLifecycle'
import { parseSnippetFile } from './parseSnippetFile'
import { snippetFileTemplate } from './templates'

const USER_FOLDER = 'snippets'
const WORKSPACE_FOLDER = '.vscode'
const LANGUAGE_EXT = '.json'
const GLOBAL_EXT = '.code-snippets'
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES = 200
const RELOAD_DEBOUNCE_MS = 150
const FILE_KINDS = ['language', 'global', 'workspace'] as const satisfies readonly SnippetFileKind[]

interface Layer {
  snippets: UserSnippet[]
  files: SnippetFile[]
  errors: string[]
}

interface Watched {
  layer: Promise<Layer>
  watch: DirWatch
  timer?: NodeJS.Timeout
}

const EMPTY: Layer = { snippets: [], files: [], errors: [] }

let user: Watched | null = null
const roots = new Map<string, Watched & { refs: number }>()
/** Views that requested the list, with the folder whose `.vscode/` they get the snippets from. */
const views = new Map<WebContents, string | null>()

const userFolder = (): string => join(app.getPath('userData'), USER_FOLDER)

function kindOf(source: SnippetSource, name: string): { kind: SnippetFileKind; base: string } | null {
  if (name.endsWith(GLOBAL_EXT)) {
    const base = name.slice(0, -GLOBAL_EXT.length)
    return base ? { kind: source === 'user' ? 'global' : 'workspace', base } : null
  }
  if (source === 'user' && name.endsWith(LANGUAGE_EXT)) {
    const base = name.slice(0, -LANGUAGE_EXT.length)
    return isLanguageId(base) ? { kind: 'language', base } : null
  }
  return null
}

const isSnippetFileName =
  (source: SnippetSource) =>
  (name: string): boolean =>
    kindOf(source, name) !== null

async function readLayer(dir: string, source: SnippetSource): Promise<Layer> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return EMPTY
  }
  const layer: Layer = { snippets: [], files: [], errors: [] }
  const entries = names
    .flatMap((name) => {
      const kind = kindOf(source, name)
      return kind ? [{ name, ...kind }] : []
    })
    .sort((a, b) => comparePaths(a.name, b.name))
    .slice(0, MAX_FILES)
  for (const { name, kind, base } of entries) {
    const path = join(dir, name)
    const label = `${source === 'user' ? USER_FOLDER : WORKSPACE_FOLDER}/${name}`
    try {
      const info = await stat(path)
      if (!info.isFile()) continue
      if (info.size > MAX_FILE_BYTES) {
        layer.errors.push(t().snippets.errors.tooLarge(label))
        continue
      }
      const text = await readFile(path, 'utf8')
      const parsed = parseSnippetFile(text, {
        path,
        label,
        source,
        ...(kind === 'language' && { languageId: base })
      })
      layer.snippets.push(...parsed.snippets)
      layer.errors.push(...parsed.warnings)
      layer.files.push({ kind, name: base, path })
    } catch (err) {
      layer.errors.push(t().snippets.errors.readFailed(label, (err as Error).message))
    }
  }
  return layer
}

async function snapshotFor(wc: WebContents): Promise<SnippetSnapshot> {
  const root = views.get(wc) ?? null
  const [own, workspace] = await Promise.all([user?.layer ?? EMPTY, (root ? roots.get(root)?.layer : null) ?? EMPTY])
  return {
    snippets: [...own.snippets, ...workspace.snippets],
    files: [...own.files, ...workspace.files],
    errors: [...own.errors, ...workspace.errors]
  }
}

async function push(wc: WebContents): Promise<void> {
  const root = views.get(wc)
  const snapshot = await snapshotFor(wc)
  // The view may have closed or switched folders during the read: the next reread reaches it.
  if (views.get(wc) === root) send(wc, 'snippets:changed', snapshot)
}

/** Rereads the layer (debounced) and notifies only the views it reaches, after the most recent read finishes. */
function scheduleReload(entry: Watched, read: () => Promise<Layer>, targets: () => WebContents[]): void {
  clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    const layer = read()
    entry.layer = layer
    void layer.then(() => {
      if (entry.layer === layer) for (const wc of targets()) void push(wc)
    })
  }, RELOAD_DEBOUNCE_MS)
}

function ensureUser(): void {
  if (user) return
  const dir = userFolder()
  const read = (): Promise<Layer> => readLayer(dir, 'user')
  const entry: Watched = {
    layer: read(),
    watch: watchNestedFile(app.getPath('userData'), USER_FOLDER, isSnippetFileName('user'), () =>
      scheduleReload(entry, read, () => [...views.keys()])
    )
  }
  user = entry
}

function acquireRoot(root: string): void {
  const existing = roots.get(root)
  if (existing) {
    existing.refs++
    return
  }
  const read = (): Promise<Layer> => readLayer(join(root, WORKSPACE_FOLDER), 'workspace')
  const entry: Watched & { refs: number } = {
    refs: 1,
    layer: read(),
    watch: watchNestedFile(root, WORKSPACE_FOLDER, isSnippetFileName('workspace'), () =>
      scheduleReload(entry, read, () => [...views].filter(([, r]) => r === root).map(([wc]) => wc))
    )
  }
  roots.set(root, entry)
}

function releaseRoot(root: string | null): void {
  const entry = root ? roots.get(root) : undefined
  if (!root || !entry || --entry.refs > 0) return
  clearTimeout(entry.timer)
  entry.watch.close()
  roots.delete(root)
}

function bind(wc: WebContents, root: string | null): void {
  if (views.has(wc) && views.get(wc) === root) return
  if (!views.has(wc)) {
    onViewDestroyed(wc, 'snippets', () => {
      releaseRoot(views.get(wc) ?? null)
      views.delete(wc)
    })
  }
  const previous = views.get(wc) ?? null
  if (root) acquireRoot(root)
  views.set(wc, root)
  releaseRoot(previous)
}

/** Snippets of the view (user + its folder's `.vscode/`); from here on it receives `snippets:changed`. */
export function listSnippets(wc: WebContents, root: string | null): Promise<SnippetSnapshot> {
  ensureUser()
  bind(wc, root)
  return snapshotFor(wc)
}

/** The view folder changed: only views that already requested the list switch layers (and get the new snapshot). */
export function rebindSnippets(wc: WebContents, root: string | null): void {
  if (!views.has(wc) || views.get(wc) === root) return
  bind(wc, root)
  void push(wc)
}

function validBase(kind: SnippetFileKind, raw: unknown): string {
  const m = t().snippets.errors
  if (kind === 'language') {
    if (!isLanguageId(raw)) throw new UserError(m.invalidName(String(raw)))
    return raw
  }
  const name = typeof raw === 'string' ? raw.trim().replace(/\.code-snippets$/i, '') : ''
  // Becomes a file name: no separators, `.`/`..`, control characters or Windows reserved characters.
  if (!name || name.length > 100 || name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name) || hasControl(name)) {
    throw new UserError(m.invalidName(String(raw)))
  }
  return name
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false
  )
}

/** Path of the requested file, created (exclusively) with the commented template if it does not exist yet. */
export async function openSnippetFile(wc: WebContents, rawKind: unknown, rawName: unknown): Promise<string> {
  const m = t().snippets.errors
  const kind = oneOf(rawKind, FILE_KINDS, m.invalidFileKind)
  const base = validBase(kind, rawName)
  const fileName = `${base}${kind === 'language' ? LANGUAGE_EXT : GLOBAL_EXT}`
  const path =
    kind === 'workspace'
      ? await resolveInsideRoot(requireViewRoot(wc, m.openFolder), join(WORKSPACE_FOLDER, fileName))
      : join(userFolder(), fileName)
  // Anything at the path (including a dangling link) belongs to the user: creates nothing.
  if (await exists(path)) return path
  try {
    await createFileExclusive(path, snippetFileTemplate(kind, base))
  } catch (err) {
    if (!(err instanceof AlreadyExistsError)) throw new UserError(m.createFailed(fileName, (err as Error).message))
  }
  return path
}

/** Closes the watchers (`will-quit`). */
export function stopSnippets(): void {
  for (const entry of [user, ...roots.values()]) {
    if (!entry) continue
    clearTimeout(entry.timer)
    entry.watch.close()
  }
  user = null
  roots.clear()
  views.clear()
}
