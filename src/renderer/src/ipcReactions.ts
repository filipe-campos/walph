import { executeCommand } from './commands/registry'
import { startClaudeReactions } from './claudeReactions'
import { watchClone } from './cloneActions'
import { watchDebug } from './debugActions'
import { startDockerReactions } from './dockerActions'
import { watchLsp } from './lspActions'
import { watchLspEdits } from './workspaceEditActions'
import { createReactionScope } from './lib/reactions'
import { watchRecents } from './recentActions'
import { handleCloseAborted, handleCloseRequested } from './saveActions'
import { watchSettings } from './settingsActions'
import { watchSnippets } from './snippetActions'
import { removeTerminal, setTerminalTitle } from './terminalActions'
import { watchUpdates } from './updateActions'
import { startWorkspaceBarReactions } from './workspaceActions'
import { handleWorkspaceChange, openWorkspace } from './workspaceLifecycle'

/** Binds every event main pushes to this view; `bootstrap` calls it once, before restoring the folder. */
export function startIpcListeners(): () => void {
  const api = window.api
  const scope = createReactionScope()
  scope.add(api.onCommand((id) => void executeCommand(id)))
  scope.add(api.workspace.onChange(handleWorkspaceChange))
  scope.add(api.workspace.onOpenRequested((root) => void openWorkspace(root)))
  scope.add(watchRecents())
  scope.add(watchClone())
  scope.add(api.window.onCloseRequested(() => void handleCloseRequested()))
  scope.add(api.window.onCloseAborted(handleCloseAborted))
  scope.add(api.terminal.onExit((id) => removeTerminal(id)))
  scope.add(api.terminal.onTitle(setTerminalTitle))
  scope.add(watchSettings())
  scope.add(watchSnippets())
  scope.add(watchLsp())
  scope.add(watchLspEdits())
  scope.add(watchDebug())
  scope.add(startClaudeReactions())
  scope.add(startWorkspaceBarReactions())
  scope.add(watchUpdates())
  scope.add(startDockerReactions())
  return scope.stop
}
