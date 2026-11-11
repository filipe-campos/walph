// Bridge between the editor breakpoint gutter and the store (injected by `debugActions.ts`), like `lspHost.ts`: the
// extensions are born in `documentStore.ts`/`groupViews.ts`, which do not import the store.
import type { BreakpointFields, BreakpointMark } from '../../lib/debugBreakpoints'

export interface DebugHost {
  /** Current marks of the tab (a new state is already born with them). */
  marksFor(tabId: string): BreakpointMark[]
  /** Stopped line of the focused frame, if it is this tab's file. */
  stoppedLineFor(tabId: string): number | null
  toggle(tabId: string, line: number): void
  /** Current fields of the line (the condition field opens with them). */
  fieldsAt(tabId: string, line: number): BreakpointFields
  setFields(tabId: string, line: number, fields: BreakpointFields): void
  /** An edit shifted lines with breakpoints (only the document owner copy reports). */
  moved(tabId: string, moves: { from: number; to: number }[]): void
}

const idle: DebugHost = {
  marksFor: () => [],
  stoppedLineFor: () => null,
  toggle: () => {},
  fieldsAt: () => ({}),
  setFields: () => {},
  moved: () => {}
}

let host: DebugHost = idle

export function bindDebugHost(next: DebugHost): void {
  host = next
}

export function unbindDebugHost(): void {
  host = idle
}

export function debugHost(): DebugHost {
  return host
}
