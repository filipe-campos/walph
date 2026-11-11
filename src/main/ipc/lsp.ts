import { t } from '@shared/i18n'
import type { IpcInvoke } from '@shared/ipc'
import type { LspManager } from '../lsp/manager'
import { ensureLspManager, lspManagerOf, syncLspActivity } from '../lsp/registry'
import { requests } from '../lsp/requests'
import {
  isVersion,
  parseChanges,
  parseCommand,
  parseFormatOptions,
  parsePosition,
  parseRange,
  parseTrigger
} from '../lsp/validate'
import { onWindowRootChange, onWorkspaceEvent } from '../window/windows'
import { onWorkspaceFiles } from '../workspace/viewWatchers'
import { onSettingsChange } from '../settings/state'
import { handle, on } from './typed'
import { isAbsolutePathInput } from '../fs/validate'
import { UserError } from '../errors'
import { oneOf } from '../validate/args'
import type { LspHierarchyDirection, LspHierarchyKind } from '@shared/types'

const isPath = isAbsolutePathInput

const bad = (what: string): never => {
  throw new UserError(t().lsp.errors.invalidRequest(what))
}
const pathArg = (v: unknown): string => (isPath(v) ? v : bad(t().lsp.args.path))
const posArg = (v: unknown) => parsePosition(v) ?? bad(t().lsp.args.position)
const triggerArg = (v: unknown): string | undefined => {
  const trigger = parseTrigger(v)
  return trigger === null ? bad(t().lsp.args.trigger) : trigger
}
const itemArg = (v: unknown): number => (isVersion(v) ? v : bad(t().lsp.args.item))
const newNameArg = (v: unknown): string =>
  typeof v !== 'string' || v.trim() === '' || v.length > 1000 ? bad(t().lsp.args.newName) : v
const formatArg = (v: unknown) => parseFormatOptions(v) ?? bad(t().lsp.args.formatOptions)
const rangeArg = (v: unknown) => parseRange(v) ?? bad(t().lsp.args.range)
const commandArg = (v: unknown) => parseCommand(v) ?? bad(t().lsp.args.command)
const queryArg = (v: unknown): string => (typeof v !== 'string' || v.length > 256 ? bad(t().lsp.args.query) : v)
const HIERARCHY_KINDS: readonly LspHierarchyKind[] = ['call', 'type']
const HIERARCHY_DIRECTIONS: readonly LspHierarchyDirection[] = ['incoming', 'outgoing', 'supertypes', 'subtypes']
const hierarchyKindArg = (v: unknown): LspHierarchyKind =>
  oneOf(v, HIERARCHY_KINDS, t().lsp.errors.invalidRequest(t().lspNavigation.args.kind))
const directionArg = (v: unknown): LspHierarchyDirection =>
  oneOf(v, HIERARCHY_DIRECTIONS, t().lsp.errors.invalidRequest(t().lspNavigation.args.direction))

// `-?` keeps one parser per argument, the contract's optional ones included.
type Parsers<A extends unknown[]> = { [K in keyof A]-?: (value: unknown) => A[K] }
type RequestChannel = Extract<keyof IpcInvoke, `lsp:${string}`>

/**
 * Request to the view's manager: the arguments are validated BEFORE looking up the manager (an invalid request
 * rejects even with nothing open); without a manager (no file open) returns `missing()`.
 */
function request<C extends RequestChannel>(
  channel: C,
  parsers: Parsers<IpcInvoke[C]['args']>,
  call: (
    manager: LspManager,
    ...args: IpcInvoke[C]['args']
  ) => IpcInvoke[C]['result'] | Promise<IpcInvoke[C]['result']>,
  missing: () => IpcInvoke[C]['result']
): void {
  handle(channel, (e: { sender: Parameters<typeof lspManagerOf>[0] }, ...raw: unknown[]) => {
    const args = parsers.map((parse, i) => parse(raw[i])) as IpcInvoke[C]['args']
    const manager = lspManagerOf(e.sender)
    return manager ? call(manager, ...args) : missing()
  })
}

export function registerLspHandlers(): void {
  // Changing the window folder shuts down its servers.
  onWindowRootChange((wc) => void lspManagerOf(wc)?.shutdown())
  onSettingsChange((wc) => lspManagerOf(wc)?.applySettings())
  // A workspace hidden for a long time shuts down its servers; becoming the active one again reopens them.
  onWorkspaceEvent((event) => {
    if (event.type === 'activated' || event.type === 'changed') syncLspActivity()
  })
  // The watcher batch (already grouped in 150 ms) reaches the servers that registered watchers.
  onWorkspaceFiles((wc, files) => lspManagerOf(wc)?.fileChanges(files))

  // Document notifications: `send` (no reply), handled in arrival order. An invalid argument is ignored.
  on('lsp:open', (e, path: unknown, text: unknown, version: unknown) => {
    if (isPath(path) && typeof text === 'string' && isVersion(version)) {
      ensureLspManager(e.sender).open(path, text, version)
    }
  })
  on('lsp:change', (e, path: unknown, version: unknown, changes: unknown) => {
    const parsed = parseChanges(changes)
    if (isPath(path) && isVersion(version) && parsed) lspManagerOf(e.sender)?.change(path, version, parsed)
  })
  on('lsp:save', (e, path: unknown) => {
    if (isPath(path)) lspManagerOf(e.sender)?.save(path)
  })
  on('lsp:close', (e, path: unknown) => {
    if (isPath(path)) lspManagerOf(e.sender)?.close(path)
  })

  handle('lsp:restart', async (e, id: unknown) => {
    if (id !== undefined && id !== null && typeof id !== 'string') throw new UserError(t().lsp.errors.invalidServer)
    await lspManagerOf(e.sender)?.restart(id ?? undefined)
  })
  handle('lsp:status', (e) => lspManagerOf(e.sender)?.status() ?? [])
  handle('lsp:log', (e) => lspManagerOf(e.sender)?.log() ?? [])

  // ---- Requests: an invalid argument rejects; without a manager returns empty ----
  request(
    'lsp:completion',
    [pathArg, posArg, triggerArg],
    (m, ...a) => m.completion(...a),
    () => requests.completion.empty
  )
  request(
    'lsp:resolveCompletion',
    [itemArg, itemArg],
    (m, ...a) => m.resolveCompletion(...a),
    () => null
  )
  request(
    'lsp:triggerCharacters',
    [pathArg],
    (m, ...a) => m.triggerCharacters(...a),
    () => ({ completion: [], signature: [], signatureRetrigger: [] })
  )
  request(
    'lsp:hover',
    [pathArg, posArg],
    (m, ...a) => m.hover(...a),
    () => requests.hover.empty
  )
  request(
    'lsp:signatureHelp',
    [pathArg, posArg, triggerArg],
    (m, ...a) => m.signatureHelp(...a),
    () => requests.signatureHelp.empty
  )
  request(
    'lsp:definition',
    [pathArg, posArg],
    (m, ...a) => m.definition(...a),
    () => requests.definition.empty
  )
  request(
    'lsp:references',
    [pathArg, posArg],
    (m, ...a) => m.references(...a),
    () => requests.references.empty
  )
  request(
    'lsp:prepareRename',
    [pathArg, posArg],
    (m, ...a) => m.prepareRename(...a),
    () => requests.prepareRename.empty
  )
  request(
    'lsp:rename',
    [pathArg, posArg, newNameArg],
    (m, ...a) => m.rename(...a),
    () => requests.rename.empty
  )
  request(
    'lsp:format',
    [pathArg, formatArg],
    (m, ...a) => m.format(...a),
    () => requests.format.empty
  )
  request(
    'lsp:codeActions',
    [pathArg, rangeArg],
    (m, ...a) => m.codeActions(...a),
    () => requests.codeActions.empty
  )
  request(
    'lsp:executeCommand',
    [pathArg, commandArg],
    (m, ...a) => m.executeCommand(...a),
    () => {
      throw new UserError(t().lsp.errors.noServer)
    }
  )
  request(
    'lsp:documentSymbols',
    [pathArg],
    (m, ...a) => m.documentSymbols(...a),
    () => requests.documentSymbols.empty
  )
  request(
    'lsp:workspaceSymbols',
    [queryArg],
    (m, ...a) => m.workspaceSymbols(...a),
    () => []
  )
  request(
    'lsp:implementation',
    [pathArg, posArg],
    (m, ...a) => m.implementation(...a),
    () => requests.implementation.empty
  )
  request(
    'lsp:typeDefinition',
    [pathArg, posArg],
    (m, ...a) => m.typeDefinition(...a),
    () => requests.typeDefinition.empty
  )
  request(
    'lsp:declaration',
    [pathArg, posArg],
    (m, ...a) => m.declaration(...a),
    () => requests.declaration.empty
  )
  request(
    'lsp:codeLens',
    [pathArg],
    (m, ...a) => m.codeLens(...a),
    () => requests.codeLens.empty
  )
  request(
    'lsp:resolveCodeLens',
    [pathArg, itemArg, itemArg],
    (m, ...a) => m.resolveCodeLens(...a),
    () => null
  )
  request(
    'lsp:prepareHierarchy',
    [hierarchyKindArg, pathArg, posArg],
    (m, ...a) => m.prepareHierarchy(...a),
    () => []
  )
  request(
    'lsp:hierarchyRelated',
    [itemArg, directionArg],
    (m, ...a) => m.hierarchyRelated(...a),
    () => []
  )

  request(
    'lsp:inlayHints',
    [pathArg, rangeArg],
    (m, ...a) => m.inlayHints(...a),
    () => requests.inlayHints.empty
  )
  request(
    'lsp:documentHighlights',
    [pathArg, posArg],
    (m, ...a) => m.documentHighlights(...a),
    () => requests.documentHighlights.empty
  )
  request(
    'lsp:semanticTokens',
    [pathArg],
    (m, ...a) => m.semanticTokens(...a),
    () => requests.semanticTokens.empty
  )

  // The renderer answers `lsp:applyEdit`; the manager belongs to the `sender`, so another window cannot resolve someone
  // else's request.
  on('lsp:applyEditResult', (e, id: unknown, applied: unknown, reason: unknown) => {
    if (!isVersion(id) || typeof applied !== 'boolean') return
    lspManagerOf(e.sender)?.resolveApplyEdit(
      id,
      applied,
      typeof reason === 'string' ? reason.slice(0, 2000) : undefined
    )
  })
}
