import { startWorkspaceReactions } from './workspaceLifecycle'
import { startSessionReactions } from './sessionActions'
import { startLspReactions } from './lspActions'
import { startDebugReactions } from './debugActions'
import { startDebugBreakpointReactions } from './debugBreakpointActions'
import { startTabReactions } from './tabActions'
import { startDiskSyncReactions } from './diskSync'
import { startSaveReactions } from './saveActions'
import { startGitReactions } from './gitActions'
import { startGitHunkReactions } from './gitHunkActions'
import { startGitMergeReactions } from './gitMergeActions'
import { startSearchReactions } from './searchActions'
import { startExplorerReactions } from './explorerActions'
import { startFileViewReactions } from './fileViewActions'
import { startProjectFilesReactions } from './projectFiles'
import { startSettingsReactions } from './settingsActions'
import { startOverlayReactions } from './overlayActions'
import { startEditorConfigReactions } from './editorConfigActions'
import { createReactionScope, type ReactionScope } from './lib/reactions'

let current: ReactionScope | null = null

/** Wires the non-UI reactions (store subscriptions, editor bridge, beforeunload); `bootstrap` calls it once. */
export function startStoreReactions(): () => void {
  current?.stop()
  const scope = createReactionScope()
  current = scope
  scope.add(startWorkspaceReactions())
  scope.add(startTabReactions())
  scope.add(startDiskSyncReactions())
  scope.add(startGitReactions())
  scope.add(startGitHunkReactions())
  scope.add(startGitMergeReactions())
  scope.add(startLspReactions())
  scope.add(startDebugReactions())
  scope.add(startDebugBreakpointReactions())
  scope.add(startSaveReactions())
  scope.add(startSessionReactions())
  scope.add(startSearchReactions())
  scope.add(startExplorerReactions())
  scope.add(startProjectFilesReactions())
  scope.add(startFileViewReactions())
  scope.add(startSettingsReactions())
  scope.add(startOverlayReactions())
  scope.add(startEditorConfigReactions())
  return () => {
    scope.stop()
    if (current === scope) current = null
  }
}
