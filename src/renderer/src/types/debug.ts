import type {
  DebugBreakpointStatus,
  DebugConfigList,
  DebugScope,
  DebugSessionInfo,
  DebugStackFrame,
  DebugThread,
  DebugVariable
} from '@shared/types'
import type { Breakpoint } from '../lib/debugBreakpoints'
import type { ConsoleEntry } from '../lib/debugConsole'

/** Frame in focus: what Variables, Watch, the console and the editor highlight use. */
export interface DebugFocus {
  sessionId: string
  threadId: number | null
  frameId: number | null
}

interface WatchResult {
  value: string
  /** The adapter rejected the expression (`value` is the message). */
  error: boolean
  variablesReference: number
}

export interface DebugState {
  /** Last read of `launch.json` (`null` = not read yet in this folder). */
  debugConfigs: DebugConfigList | null
  /** Name of the configuration chosen in the picker (`null` = the first one). */
  debugSelectedConfig: string | null
  /** Live sessions, as main reports them; empty = not debugging. */
  debugSessions: DebugSessionInfo[]
  debugFocus: DebugFocus | null
  /** Threads per session (requested on each stop). */
  debugThreads: Record<string, DebugThread[]>
  /** Stack per `sessionId:threadId` (only for stopped threads). */
  debugFrames: Record<string, DebugStackFrame[]>
  /** Scopes of the frame in focus. */
  debugScopes: DebugScope[]
  /** Children already read by `variablesReference` (valid only until the program continues). */
  debugVariables: Record<number, DebugVariable[]>
  /** Open nodes of the variable trees, by name path (survives steps, as in VS Code). */
  debugExpanded: Record<string, boolean>
  debugConsole: ConsoleEntry[]
  /** Expressions of the Watch section, in order (they go to the folder session). */
  debugWatches: string[]
  debugWatchResults: Record<string, WatchResult>
  /** Breakpoints by absolute path (they go to the folder session). */
  breakpoints: Record<string, Breakpoint[]>
  /** Status reported by the adapter, in the order of the active ones sent; goes away when there is no session. */
  breakpointStatus: Record<string, DebugBreakpointStatus[]>
}
