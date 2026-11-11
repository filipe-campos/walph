import type { DebugState } from '../types/debug'

/**
 * Everything in the debugger belongs to the folder: main ends the sessions on folder switch and the session
 * restores breakpoints/inspection.
 */
export function scopedDebugState(): DebugState {
  return {
    debugConfigs: null,
    debugSelectedConfig: null,
    debugSessions: [],
    debugFocus: null,
    debugThreads: {},
    debugFrames: {},
    debugScopes: [],
    debugVariables: {},
    debugExpanded: {},
    debugConsole: [],
    debugWatches: [],
    debugWatchResults: {},
    breakpoints: {},
    breakpointStatus: {}
  }
}
