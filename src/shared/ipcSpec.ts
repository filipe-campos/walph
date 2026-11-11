// Single IPC specification: each `WalphApi` method that crosses the process boundary declares its kind here (`invoke`,
// `send` or `event`) and its channel. From it come the typed channel map (`ipc.ts`), the channel list of the tests and
// the preload bridge (`buildApi`). Signatures come only from the `<Domain>Api`s in `types/`; this file retypes nothing
// and does not import electron.
import type { WalphApi } from './types'

export type IpcKind = 'invoke' | 'send' | 'event'
export type ChannelName = `${string}:${string}`

export interface IpcEntry<K extends IpcKind = IpcKind, C extends ChannelName = ChannelName> {
  readonly kind: K
  readonly channel: C
}

/** Renderer → main with a reply (`ipcRenderer.invoke` / `ipcMain.handle`). */
export const invoke = <C extends ChannelName>(channel: C): IpcEntry<'invoke', C> => ({ kind: 'invoke', channel })
/** Renderer → main without a reply (`ipcRenderer.send` / `ipcMain.on`). */
export const send = <C extends ChannelName>(channel: C): IpcEntry<'send', C> => ({ kind: 'send', channel })
/** Main → renderer: the contract method is `onXxx(cb)` and returns the unsubscribe. */
export const event = <C extends ChannelName>(channel: C): IpcEntry<'event', C> => ({ kind: 'event', channel })

/** `WalphApi` members the preload builds by itself (`process.argv`/`process.platform` and `webUtils`). */
type PreloadOnly = 'platform' | 'isPackaged' | 'homeDir' | 'locale' | 'pathForFile'

type Fn = (...args: never[]) => unknown

type MethodEntry<F> = F extends (cb: never) => () => void
  ? IpcEntry<'event'>
  : F extends (...args: never[]) => Promise<unknown>
    ? IpcEntry<'invoke'>
    : F extends (...args: never[]) => void
      ? IpcEntry<'send'>
      : never

type WithoutPreloadOnly<A> = {
  [K in keyof A as K extends PreloadOnly ? never : K]: A[K] extends Fn ? A[K] : WithoutPreloadOnly<A[K]>
}

/** `WalphApi` without what the preload builds by hand: what `buildApi` returns. */
export type BridgedApi = WithoutPreloadOnly<WalphApi>

/**
 * Required shape of the spec: one member per `WalphApi` method, of the right kind for the signature (`on…(cb)` is
 * `event`, what returns a `Promise` is `invoke`, what returns `void` is `send`). A missing or extra method fails the
 * typecheck.
 */
export type IpcSpec<A = BridgedApi> = { [K in keyof A]: A[K] extends Fn ? MethodEntry<A[K]> : IpcSpec<A[K]> }

export const ipcSpec = {
  onCommand: event('app:command'),
  window: {
    run: send('window:action'),
    setContext: send('window:setContext'),
    setDirty: send('window:setDirty'),
    onCloseRequested: event('window:closeRequested'),
    onCloseAborted: event('window:closeAborted'),
    confirmClose: send('window:confirmClose'),
    cancelClose: send('window:cancelClose'),
    openExternal: send('window:openExternal')
  },
  dialog: {
    confirmUnsaved: invoke('dialog:confirmUnsaved'),
    confirm: invoke('dialog:confirm')
  },
  settings: {
    setWorkspace: invoke('settings:setWorkspace'),
    openFile: invoke('settings:openFile'),
    setValue: invoke('settings:setValue'),
    resetValue: invoke('settings:resetValue'),
    onChange: event('settings:changed')
  },
  snippets: {
    list: invoke('snippets:list'),
    openFile: invoke('snippets:openFile'),
    onChange: event('snippets:changed')
  },
  tabs: {
    showContextMenu: invoke('tabs:contextMenu')
  },
  workspace: {
    current: invoke('workspace:current'),
    openFolder: invoke('workspace:openFolder'),
    focusIfOpen: invoke('workspace:focusIfOpen'),
    open: invoke('workspace:open'),
    onOpenRequested: event('workspace:openRequested'),
    onChange: event('workspace:changed')
  },
  workspaces: {
    list: invoke('workspaces:list'),
    add: invoke('workspaces:add'),
    openMany: invoke('workspaces:openMany'),
    openWithPrompt: invoke('workspaces:openWithPrompt'),
    activate: send('workspaces:activate'),
    close: invoke('workspaces:close'),
    move: send('workspaces:move'),
    setMuted: send('workspaces:setMuted'),
    showContextMenu: invoke('workspaces:contextMenu'),
    reportBranch: send('workspaces:reportBranch'),
    onChange: event('workspaces:changed')
  },
  notifications: {
    onShow: event('notifications:show'),
    onDismiss: event('notifications:dismiss'),
    requestSound: send('notifications:requestSound'),
    onPlaySound: event('notifications:playSound')
  },
  recent: {
    list: invoke('recent:list'),
    remove: invoke('recent:remove'),
    clear: invoke('recent:clear'),
    onChange: event('recent:changed')
  },
  session: {
    load: invoke('session:load'),
    save: send('session:save')
  },
  fs: {
    readDir: invoke('fs:readDir'),
    readFile: invoke('fs:readFile'),
    readText: invoke('fs:readText'),
    readImage: invoke('fs:readImage'),
    writeFile: invoke('fs:writeFile'),
    createFile: invoke('fs:createFile'),
    createDir: invoke('fs:createDir'),
    move: invoke('fs:move'),
    rename: invoke('fs:rename'),
    trash: invoke('fs:trash'),
    exists: invoke('fs:exists'),
    copy: invoke('fs:copy'),
    clipboardFiles: invoke('fs:clipboardFiles'),
    writeClipboardFiles: invoke('fs:writeClipboardFiles'),
    showContextMenu: invoke('fs:contextMenu'),
    copyPath: send('fs:copyPath'),
    reveal: send('fs:reveal')
  },
  files: {
    list: invoke('files:list')
  },
  search: {
    find: invoke('search:find'),
    replace: invoke('search:replace')
  },
  git: {
    status: invoke('git:status'),
    init: invoke('git:init'),
    stage: invoke('git:stage'),
    unstage: invoke('git:unstage'),
    commit: invoke('git:commit'),
    lastCommitMessage: invoke('git:lastCommitMessage'),
    undoLastCommit: invoke('git:undoLastCommit'),
    discard: invoke('git:discard'),
    branches: invoke('git:branches'),
    checkout: invoke('git:checkout'),
    createBranch: invoke('git:createBranch'),
    log: invoke('git:log'),
    commitFiles: invoke('git:commitFiles'),
    commitDiff: invoke('git:commitDiff'),
    stashList: invoke('git:stashList'),
    stashSave: invoke('git:stashSave'),
    stashApply: invoke('git:stashApply'),
    stashPop: invoke('git:stashPop'),
    stashDrop: invoke('git:stashDrop'),
    pull: invoke('git:pull'),
    push: invoke('git:push'),
    sync: invoke('git:sync'),
    show: invoke('git:show'),
    baseline: invoke('git:baseline'),
    stageRanges: invoke('git:stageRanges'),
    unstageRanges: invoke('git:unstageRanges'),
    blame: invoke('git:blame'),
    abortOperation: invoke('git:abortOperation'),
    checkCloneUrl: invoke('git:checkCloneUrl'),
    clone: invoke('git:clone'),
    cancelClone: send('git:cancelClone'),
    onCloneProgress: event('git:cloneProgress')
  },
  lsp: {
    open: send('lsp:open'),
    change: send('lsp:change'),
    save: send('lsp:save'),
    close: send('lsp:close'),
    restart: invoke('lsp:restart'),
    status: invoke('lsp:status'),
    log: invoke('lsp:log'),
    onDiagnostics: event('lsp:diagnostics'),
    onStatus: event('lsp:statusChanged'),
    onLog: event('lsp:logAppended'),
    completion: invoke('lsp:completion'),
    resolveCompletion: invoke('lsp:resolveCompletion'),
    triggerCharacters: invoke('lsp:triggerCharacters'),
    hover: invoke('lsp:hover'),
    signatureHelp: invoke('lsp:signatureHelp'),
    definition: invoke('lsp:definition'),
    references: invoke('lsp:references'),
    prepareRename: invoke('lsp:prepareRename'),
    rename: invoke('lsp:rename'),
    format: invoke('lsp:format'),
    codeActions: invoke('lsp:codeActions'),
    executeCommand: invoke('lsp:executeCommand'),
    documentSymbols: invoke('lsp:documentSymbols'),
    workspaceSymbols: invoke('lsp:workspaceSymbols'),
    inlayHints: invoke('lsp:inlayHints'),
    documentHighlights: invoke('lsp:documentHighlights'),
    semanticTokens: invoke('lsp:semanticTokens'),
    onRefresh: event('lsp:refresh'),
    implementation: invoke('lsp:implementation'),
    typeDefinition: invoke('lsp:typeDefinition'),
    declaration: invoke('lsp:declaration'),
    codeLens: invoke('lsp:codeLens'),
    resolveCodeLens: invoke('lsp:resolveCodeLens'),
    prepareHierarchy: invoke('lsp:prepareHierarchy'),
    hierarchyRelated: invoke('lsp:hierarchyRelated'),
    onApplyEdit: event('lsp:applyEdit'),
    onApplyEditCancelled: event('lsp:applyEditCancelled'),
    applyEditResult: send('lsp:applyEditResult')
  },
  debug: {
    configurations: invoke('debug:configurations'),
    createLaunchFile: invoke('debug:createLaunchFile'),
    start: invoke('debug:start'),
    stop: invoke('debug:stop'),
    restart: invoke('debug:restart'),
    control: invoke('debug:control'),
    threads: invoke('debug:threads'),
    stackTrace: invoke('debug:stackTrace'),
    scopes: invoke('debug:scopes'),
    variables: invoke('debug:variables'),
    evaluate: invoke('debug:evaluate'),
    setBreakpoints: send('debug:setBreakpoints'),
    onEvent: event('debug:event')
  },
  claude: {
    start: invoke('claude:start'),
    send: invoke('claude:send'),
    interrupt: invoke('claude:interrupt'),
    stopTask: invoke('claude:stopTask'),
    close: invoke('claude:close'),
    respond: invoke('claude:respond'),
    setPermissionMode: invoke('claude:setPermissionMode'),
    setModel: invoke('claude:setModel'),
    setEffort: invoke('claude:setEffort'),
    commands: invoke('claude:commands'),
    pickAttachments: invoke('claude:pickAttachments'),
    authorizeAttachments: invoke('claude:authorizeAttachments'),
    contextUsage: invoke('claude:contextUsage'),
    usage: invoke('claude:usage'),
    authStatus: invoke('claude:authStatus'),
    logout: invoke('claude:logout'),
    restartAll: invoke('claude:restartAll'),
    mcpStatus: invoke('claude:mcpStatus'),
    mcpToggle: invoke('claude:mcpToggle'),
    mcpReconnect: invoke('claude:mcpReconnect'),
    mcpAuthenticate: invoke('claude:mcpAuthenticate'),
    mcpSubmitCallback: invoke('claude:mcpSubmitCallback'),
    mcpClearAuth: invoke('claude:mcpClearAuth'),
    mcpAdd: invoke('claude:mcpAdd'),
    mcpRemove: invoke('claude:mcpRemove'),
    rewind: invoke('claude:rewind'),
    sessions: invoke('claude:sessions'),
    setSessionMeta: invoke('claude:setSessionMeta'),
    favoriteCommands: invoke('claude:favoriteCommands'),
    setFavoriteCommands: invoke('claude:setFavoriteCommands'),
    fork: invoke('claude:fork'),
    exportMarkdown: invoke('claude:exportMarkdown'),
    setEditorContext: send('claude:setEditorContext'),
    markRead: send('claude:markRead'),
    onEvent: event('claude:event'),
    onStartRequested: event('claude:startRequested')
  },
  docker: {
    info: invoke('docker:info'),
    list: invoke('docker:list'),
    startStats: send('docker:startStats'),
    stopStats: send('docker:stopStats'),
    onStats: event('docker:stats'),
    followLogs: invoke('docker:followLogs'),
    stopLogs: send('docker:stopLogs'),
    onLogs: event('docker:logs'),
    onLogsEnd: event('docker:logsEnd'),
    action: invoke('docker:action'),
    composeAction: invoke('docker:composeAction'),
    composeUpWorkspace: invoke('docker:composeUpWorkspace'),
    inspect: invoke('docker:inspect'),
    investigationPrompt: invoke('docker:investigationPrompt')
  },
  terminal: {
    create: invoke('terminal:create'),
    write: send('terminal:write'),
    resize: send('terminal:resize'),
    kill: send('terminal:kill'),
    ack: send('terminal:ack'),
    onData: event('terminal:data'),
    onExit: event('terminal:exit'),
    onTitle: event('terminal:title'),
    resolveLink: invoke('terminal:resolveLink'),
    cwd: invoke('terminal:cwd')
  },
  update: {
    check: invoke('update:check'),
    install: send('update:install'),
    onNotice: event('update:notice')
  },
  cli: {
    install: invoke('cli:install'),
    uninstall: invoke('cli:uninstall')
  }
} satisfies IpcSpec

export function isIpcEntry(node: unknown): node is IpcEntry {
  const n = node as Record<string, unknown>
  return typeof n.kind === 'string' && typeof n.channel === 'string'
}

/** Spec channels by kind, in declaration order. */
export function listChannels(spec: object): Record<IpcKind, string[]> {
  const out: Record<IpcKind, string[]> = { invoke: [], send: [], event: [] }
  const walk = (node: object): void => {
    for (const child of Object.values(node)) {
      if (isIpcEntry(child)) out[child.kind].push(child.channel)
      else walk(child as object)
    }
  }
  walk(spec)
  return out
}
