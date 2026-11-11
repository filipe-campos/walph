// Debugger (Debug Adapter Protocol). Lines and columns are 1-based (the client announces `linesStartAt1`/
// `columnsStartAt1`), paths are absolute and native. Everything that comes from the adapter is normalized in main.

/** Summary of a `.vscode/launch.json` configuration (or of a default one, when the file does not exist). */
export interface DebugConfigSummary {
  name: string
  type: string
  request: 'launch' | 'attach'
  /** `true` = Walph default configuration (not in `launch.json`). */
  builtin: boolean
}

export interface DebugConfigList {
  configurations: DebugConfigSummary[]
  /** Absolute path of the folder's `.vscode/launch.json` (may not exist). */
  file: string
  /** The file exists. */
  exists: boolean
  /** Problem reading the file (translated message); `null` if it read fine or does not exist. */
  error: string | null
}

/** Breakpoint requested by the user on a line of a file. */
export interface DebugSourceBreakpoint {
  line: number
  /** Expression: stops only when true (if the adapter supports it). */
  condition?: string
  /** Pauses only from the Nth hit on (adapter text, e.g. `3` or `>= 3`). */
  hitCondition?: string
  /** Logpoint: writes the message instead of stopping (`{expr}` interpolated by the adapter). */
  logMessage?: string
}

/** State of a breakpoint reported by the adapter, in the order of the file's `setBreakpoints` requests. */
export interface DebugBreakpointStatus {
  /** Requested line. */
  line: number
  verified: boolean
  /** Line where the adapter actually placed it, when it differs from the requested one. */
  actualLine: number | null
  /** Reason it is not verified (adapter text). */
  message: string | null
}

export type DebugSessionState = 'starting' | 'running' | 'stopped'

/** What the adapter announced in `initialize` and the UI needs to know. */
export interface DebugCapabilities {
  conditionalBreakpoints: boolean
  hitConditionalBreakpoints: boolean
  logPoints: boolean
  restart: boolean
  terminate: boolean
}

export interface DebugSessionInfo {
  id: string
  /** Configuration name (or the one given by the adapter in a child session). */
  name: string
  type: string
  /** Session that created it (`startDebugging`); `null` at the root. */
  parentId: string | null
  state: DebugSessionState
  /** Stopped thread (the one of the last `stopped`), when `state` is `stopped`. */
  stoppedThreadId: number | null
  capabilities: DebugCapabilities
  /** Running without debugging (`noDebug`). */
  noDebug: boolean
}

export interface DebugThread {
  id: number
  name: string
}

export interface DebugStackFrame {
  id: number
  name: string
  /** Absolute file path; `null` when the code has no file (internal, generated). */
  path: string | null
  /** Display name of the source (basename or the name given by the adapter). */
  sourceName: string | null
  line: number
  column: number
  /** `subtle` = library/internal frame (the UI dims it); `label` = separator without code. */
  hint: 'normal' | 'label' | 'subtle'
}

export interface DebugScope {
  name: string
  variablesReference: number
  /** Expensive to read: the UI only fetches it on expand. */
  expensive: boolean
}

export interface DebugVariable {
  name: string
  value: string
  type: string | null
  /** > 0 = has children (requested with `variables`); valid only while the program is stopped. */
  variablesReference: number
}

export interface DebugEvaluateResult {
  result: string
  type: string | null
  variablesReference: number
}

export type DebugOutputCategory = 'console' | 'stdout' | 'stderr' | 'important'

export interface DebugOutputEntry {
  sessionId: string
  category: DebugOutputCategory
  /** Text already without control codes (line breaks preserved). */
  text: string
}

export type DebugControl = 'continue' | 'pause' | 'next' | 'stepIn' | 'stepOut'

export type DebugEvaluateContext = 'repl' | 'watch' | 'hover'

export interface DebugStartOptions {
  /** Run without debugging (the adapter ignores breakpoints). */
  noDebug?: boolean
  /** Active file in the editor (`${file}` and derived); absent = none. */
  file?: string
  /** Cursor line in the active file (`${lineNumber}`). */
  line?: number
  /** Text selected in the editor (`${selectedText}`). */
  selectedText?: string
}

export type DebugEvent =
  /** Full list of the live sessions on every change (an ended session drops from the list). */
  | { kind: 'sessions'; sessions: DebugSessionInfo[] }
  | {
      kind: 'stopped'
      sessionId: string
      threadId: number | null
      /** Adapter reason (`breakpoint`, `step`, `exception`, `pause`…). */
      reason: string
      /** Adapter text (e.g. the exception message). */
      description: string | null
      allThreadsStopped: boolean
    }
  | { kind: 'continued'; sessionId: string; threadId: number | null; allThreadsContinued: boolean }
  /** A thread started or ended: whoever shows the list requests `threads` again. */
  | { kind: 'threads'; sessionId: string }
  /** Program and adapter output, batched (up to ~50 ms). */
  | { kind: 'output'; entries: DebugOutputEntry[] }
  | { kind: 'breakpoints'; path: string; breakpoints: DebugBreakpointStatus[] }
  /**
   * The adapter asked to run the program in a terminal (`runInTerminal`): the renderer opens a terminal with
   * `terminal.create({ debugRun: ticket })`. Without an answer in 15 s the request fails.
   */
  | { kind: 'runInTerminal'; ticket: string; title: string }
  /** Failure outside a request (adapter crashed, did not start…), translated message. */
  | { kind: 'error'; sessionId: string | null; message: string }

export interface DebugApi {
  /** Configurations of the view folder (`.vscode/launch.json`, JSONC; Walph defaults if absent or empty). */
  configurations(): Promise<DebugConfigList>
  /** Creates `.vscode/launch.json` from a template if it does not exist; returns the absolute path. */
  createLaunchFile(): Promise<string>
  /**
   * Starts configuration `name` (`debug:start`) and returns the session id after `configurationDone`. Configuration
   * error, missing adapter or `launch`/`attach` refusal → error with a translated message.
   */
  start(name: string, options: DebugStartOptions): Promise<string>
  /** Ends the session and its children (`terminate`/`disconnect`; the adapter process dies with it). */
  stop(sessionId: string): Promise<void>
  /** Restarts (adapter `restart` if it supports it, otherwise ends and starts the same configuration). */
  restart(sessionId: string): Promise<void>
  /** Continue, pause and steps. `threadId` `null` = the session's stopped thread (or the first). */
  control(sessionId: string, action: DebugControl, threadId: number | null): Promise<void>
  threads(sessionId: string): Promise<DebugThread[]>
  stackTrace(sessionId: string, threadId: number): Promise<DebugStackFrame[]>
  scopes(sessionId: string, frameId: number): Promise<DebugScope[]>
  variables(sessionId: string, variablesReference: number): Promise<DebugVariable[]>
  /** Evaluates in frame `frameId` (`null` = global context). Adapter error → error with its message. */
  evaluate(
    sessionId: string,
    expression: string,
    frameId: number | null,
    context: DebugEvaluateContext
  ): Promise<DebugEvaluateResult>
  /**
   * Breakpoints of a file (full list, empty removes all). Main stores them and sends them to every live session and to
   * the ones born later; the state comes back through the `breakpoints` event.
   */
  setBreakpoints(path: string, breakpoints: DebugSourceBreakpoint[]): void
  onEvent(cb: (event: DebugEvent) => void): () => void
}
