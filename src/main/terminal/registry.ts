import type { WebContents } from 'electron'
import type * as pty from 'node-pty'
import { killPtysSyncAndSweep } from '../process/ptySession'
import { createViewRegistry } from '../window/viewResources'
import { isActiveView } from '../workspace/isActiveView'
import type { TerminalOutput } from './outputBuffer'
import { isShellProcess } from './shellName'

export interface Terminal {
  term: pty.IPty
  /** Initial directory: fallback when the current one of the shell cannot be read. */
  initialCwd: string
  cwdCache?: { at: number; cwd: Promise<string> }
  titleTimer?: NodeJS.Timeout | undefined
  /** Batches the output and controls the flow (renderer ack). */
  output?: TerminalOutput
  /** pty listeners: after it ends, late output cannot rearm timers nor emit `terminal:data`. */
  listeners: pty.IDisposable[]
}

export function disposeTerminal(t: Terminal): void {
  clearTimeout(t.titleTimer)
  t.titleTimer = undefined
  t.output?.dispose()
  for (const listener of t.listeners.splice(0)) listener.dispose()
}

// From the view registry: only that view writes to, resizes or ends the shell (a message from another view about a
// foreign id is ignored). Reloading the page or the renderer dying kills the xterms without firing `destroyed`: the
// shells would be orphaned (and the restored session opens a new one on every reload). The reset is a plain `kill()`:
// no session sweep (only on quit), to preserve nohup/disown jobs, like VS Code.
export const terminals: ReturnType<typeof createViewRegistry<Terminal>> = createViewRegistry<Terminal>({
  key: 'terminal',
  dispose: (t) => {
    disposeTerminal(t)
    t.term.kill()
  },
  disposeSync: (all) => {
    for (const t of all) disposeTerminal(t)
    killPtysSyncAndSweep(all.map((t) => t.term))
  }
})

export function killAllTerminals(): void {
  terminals.disposeAllSync()
}

export function ownedTerminal(sender: WebContents, id: unknown): Terminal | undefined {
  return typeof id === 'string' ? terminals.get(sender, id) : undefined
}

/** Hibernating kills the view's ptys: only with all of them at the prompt (foreground process = the shell itself). */
export function terminalEvictionReason(wc: WebContents): 'terminalProcess' | null {
  for (const t of terminals.values(wc)) {
    // On Windows node-pty always reports the launched shell (not the foreground process): any live pty
    // protects the view, otherwise `npm run dev` would die.
    if (process.platform === 'win32' || !isShellProcess(t.term.process)) return 'terminalProcess'
  }
  return null
}

/** View that stops being the active one: a paused pty runs again (the hidden renderer may take long to ack). */
export function resumeInactiveOutput(): void {
  for (const [wc, t] of terminals.entries()) if (!wc.isDestroyed() && !isActiveView(wc)) t.output?.reset()
}
