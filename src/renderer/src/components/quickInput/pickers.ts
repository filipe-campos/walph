import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { findActiveTab } from '../../lib/findActiveTab'
import { useStore } from '../../store'
import type { QuickPicker } from '../../types/quickInput'
import { quickInputMode } from '../../lib/quickOpenQuery'
import { toRel } from '../../lib/quickOpenFiles'
import { serverForPath } from '../../lib/lspServer'
import {
  buildCommandList,
  buildEncodingList,
  buildFileList,
  buildLanguageList,
  buildLineList,
  buildRecentList,
  buildSymbolList,
  buildTerminalProfileList,
  buildThemeList,
  buildWorkspaceSymbolList,
  type QuickList
} from './buildItems'
import {
  buildBranchList,
  buildCloneUrlList,
  buildCreateBranchList,
  buildStashList,
  buildStashMessageList
} from './buildGitItems'
import { buildUnifiedList } from './buildUnifiedItems'
import {
  buildConfigureSnippetsList,
  buildEmmetWrapList,
  buildInsertSnippetList,
  buildSnippetFileNameList
} from './buildSnippetItems'
import { buildDebugConfigList } from './buildDebugItems'
import { useCloneUrlCheck } from './useCloneUrlCheck'
import { useProjectFiles } from './useProjectFiles'
import { useDocumentSymbols, useWorkspaceSymbols } from './useSymbols'
import { compareActiveWith } from '../../compareActions'

export interface PickerQuery {
  picker: QuickPicker | undefined
  /** The modes that need async data only fetch it while active. */
  mode: string
  /** Deferred query: the async searches follow the list, not each keystroke. */
  deferred: string
}

/**
 * Data of all pickers and modes. Each hook runs on every render (fixed order); whoever is not the active mode
 * stays off (`enabled`) or cheap. Keeps the selectors narrow: only subscribes to what the active mode reads.
 */
export function usePickerData({ picker, mode, deferred }: PickerQuery) {
  const platform = window.api.platform
  const root = useStore((s) => s.root)
  const currentTheme = useStore((s) => s.settings['workbench.theme'])
  const gitBranches = useStore((s) => s.gitBranches)
  const currentBranch = useStore((s) => s.git?.branch ?? null)
  const stashes = useStore((s) => s.stashes)
  const stashAction = useStore((s) => s.quickInput?.stashAction)
  const terminalProfiles = useStore((s) => s.settings['terminal.profiles'])
  const defaultProfile = useStore((s) => s.settings['terminal.defaultProfile'])
  const unified = useStore((s) => !!s.quickInput?.unified)
  const debugConfigs = useStore((s) => s.debugConfigs)
  const debugSelectedConfig = useStore((s) => s.debugSelectedConfig)
  const openPaths = useStore(useShallow((s) => s.tabs.flatMap((t) => (t.kind === 'file' ? [t.path] : []))))
  const recentFiles = useStore((s) => s.recentFiles)
  const recentFolders = useStore((s) => s.recentFolders)
  const excludeMatcher = useStore((s) => s.excludeMatcher)
  const activeFilePath = useStore((s) => {
    const tab = findActiveTab(s)
    return tab?.kind === 'file' ? tab.path : null
  })
  const tabLanguage = useStore((s) => {
    const tab = findActiveTab(s)
    return tab?.kind === 'file' ? tab.language : null
  })
  const tabEncoding = useStore((s) => {
    const tab = findActiveTab(s)
    return tab?.kind === 'file' ? tab.encoding : null
  })
  const tabDirty = useStore((s) => {
    const tab = findActiveTab(s)
    return tab?.kind === 'file' && tab.dirty
  })
  const cursorLine = useStore((s) => s.cursor?.line)
  const cursorColumn = useStore((s) => s.cursor?.column)
  const lspStatuses = useStore((s) => s.lspStatuses)
  // The shown shortcuts come from the registry; subscribing here redoes the list if keybindings.json changes with the
  // palette open.
  const keybindings = useStore((s) => s.keybindings)
  const locale = useStore((s) => s.locale)
  // Only in unified mode: outside it every `workspaces:changed` would redo the fuzzy over thousands of files for
  // nothing.
  const workspaces = useStore((s) => (s.quickInput?.unified ? s.workspaces : null))
  const snippets = useStore((s) => s.snippets)

  const cloneCheck = useCloneUrlCheck(picker === 'cloneUrl', deferred)
  const loaded = useProjectFiles(mode === 'files' || mode === 'unified' || mode === 'compareFile', root)
  const fileReady = serverForPath(lspStatuses, activeFilePath)?.state === 'ready'
  const anyReady = lspStatuses.some((l) => l.state === 'ready')
  const documentSymbols = useDocumentSymbols(mode === 'symbols' && fileReady, activeFilePath)
  const workspaceQuery = mode === 'workspaceSymbols' ? deferred.slice(1).trim() : ''
  const workspaceSymbols = useWorkspaceSymbols(mode === 'workspaceSymbols' && anyReady, workspaceQuery)

  // `files.exclude` applies here too; the filtered list is stable (the sort cache uses the array identity).
  const files = useMemo(() => {
    if (!loaded || 'error' in loaded || excludeMatcher.empty) return loaded
    const kept = loaded.list.files.filter((rel) => !excludeMatcher.matches(rel))
    return { ...loaded, list: { ...loaded.list, files: kept } }
  }, [loaded, excludeMatcher])
  // Recents inside hidden folders also go away; those outside the folder (toRel returns an absolute path) stay.
  const visibleRecent = useMemo(
    () =>
      root && !excludeMatcher.empty ? recentFiles.filter((p) => !excludeMatcher.matches(toRel(root, p))) : recentFiles,
    [root, recentFiles, excludeMatcher]
  )

  return useMemo(
    () => ({
      platform,
      picker,
      unified,
      root,
      files,
      openPaths,
      visibleRecent,
      activeFilePath,
      cursorLine,
      cursorColumn,
      tabLanguage,
      tabEncoding,
      tabDirty,
      currentTheme,
      recentFolders,
      terminalProfiles,
      defaultProfile,
      gitBranches,
      currentBranch,
      stashes,
      stashAction,
      cloneCheck,
      debugConfigs,
      debugSelectedConfig,
      workspaces,
      snippets,
      fileReady,
      anyReady,
      documentSymbols,
      workspaceSymbols,
      // They are not read by the builders, but they change what the lists show: they enter to invalidate them.
      keybindings,
      locale
    }),
    [
      platform,
      picker,
      unified,
      root,
      files,
      openPaths,
      visibleRecent,
      activeFilePath,
      cursorLine,
      cursorColumn,
      tabLanguage,
      tabEncoding,
      tabDirty,
      currentTheme,
      recentFolders,
      terminalProfiles,
      defaultProfile,
      gitBranches,
      currentBranch,
      stashes,
      stashAction,
      cloneCheck,
      debugConfigs,
      debugSelectedConfig,
      workspaces,
      snippets,
      fileReady,
      anyReady,
      documentSymbols,
      workspaceSymbols,
      keybindings,
      locale
    ]
  )
}

export type PickerData = ReturnType<typeof usePickerData>

export const PICKERS: Record<QuickPicker, (q: string, d: PickerData) => QuickList> = {
  theme: (q, d) => buildThemeList(q, d.currentTheme),
  recent: (q, d) => buildRecentList(q, d.recentFolders, d.root),
  terminalProfile: (q, d) => buildTerminalProfileList(q, d.terminalProfiles, d.defaultProfile),
  language: (q, d) => buildLanguageList(q, { path: d.activeFilePath, chosen: d.tabLanguage }),
  encoding: (q, d) => buildEncodingList(q, { current: d.tabEncoding, dirty: d.tabDirty }),
  branch: (q, d) => buildBranchList(q, d.gitBranches),
  createBranch: (q, d) => buildCreateBranchList(q, d.currentBranch),
  cloneUrl: (q, d) => buildCloneUrlList(q, d.cloneCheck),
  compareFile: (q, d) => buildFileList(q, { ...filesContext(d), onPick: compareActiveWith }),
  stashMessage: (q) => buildStashMessageList(q),
  stashPick: (q, d) => buildStashList(q, d.stashes, d.stashAction ?? 'apply'),
  insertSnippet: (q, d) =>
    buildInsertSnippetList(q, { path: d.activeFilePath, chosen: d.tabLanguage, snippets: d.snippets.snippets }),
  configureSnippets: (q, d) =>
    buildConfigureSnippetsList(q, {
      files: d.snippets.files,
      root: d.root,
      path: d.activeFilePath,
      chosen: d.tabLanguage
    }),
  snippetFileGlobal: (q) => buildSnippetFileNameList(q, 'global'),
  snippetFileWorkspace: (q) => buildSnippetFileNameList(q, 'workspace'),
  emmetWrap: (q) => buildEmmetWrapList(q),
  debugConfig: (q, d) => buildDebugConfigList(q, d.debugConfigs, d.debugSelectedConfig)
}

/** Modes without a picker, chosen by the query prefix (`>`, `:`, `@`, `#`). */
const MODES = {
  commands: (q, d) => buildCommandList(q.slice(1), d.platform),
  line: (q, d) =>
    buildLineList(q, {
      path: d.activeFilePath,
      cursor: d.cursorLine ? { line: d.cursorLine, column: d.cursorColumn ?? 1 } : null
    }),
  symbols: (q, d) =>
    buildSymbolList(q.slice(1), {
      path: d.activeFilePath,
      ready: d.fileReady,
      loaded: d.documentSymbols,
      root: d.root
    }),
  workspaceSymbols: (q, d) =>
    buildWorkspaceSymbolList(q.slice(1).trim(), {
      path: d.activeFilePath,
      ready: d.anyReady,
      loaded: d.workspaceSymbols,
      root: d.root
    }),
  files: (q, d) => buildFileList(q, filesContext(d))
} satisfies Record<ReturnType<typeof quickInputMode>, (q: string, d: PickerData) => QuickList>

function filesContext(d: PickerData) {
  return { root: d.root, files: d.files, openPaths: d.openPaths, recent: d.visibleRecent }
}

export function buildPickerList(q: string, d: PickerData): QuickList {
  if (d.picker) return PICKERS[d.picker](q, d)
  const mode = quickInputMode(q)
  if (d.unified && mode === 'files') {
    return buildUnifiedList(q, {
      platform: d.platform,
      workspaces: d.workspaces?.workspaces ?? null,
      selfId: d.workspaces?.selfId ?? null,
      files: filesContext(d)
    })
  }
  return MODES[mode](q, d)
}
