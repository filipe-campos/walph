import type { WebContents } from 'electron'
import { isNonEmptyString } from '@shared/guards'
import { t } from '@shared/i18n'
import { debugManagerOf, debugRunCommand, ensureDebugManager } from '../debug/registry'
import type { DebugManager } from '../debug/manager'
import { parseSourceBreakpoints, parseStartOptions } from '../debug/validate'
import { UserError } from '../errors'
import { createLog } from '../log'
import { isAbsolutePathInput } from '../fs/validate'
import { registerTerminalSource } from '../terminal/launchSources'
import { int, oneOf } from '../validate/args'
import { onWindowRootChange } from '../window/windows'
import { handle, on } from './typed'

const log = createLog('debug')
const MAX_ID = 2 ** 31 - 1
const MAX_EXPRESSION = 10_000

const bad = (what: string): never => {
  throw new UserError(t().debug.errors.invalidRequest(what))
}
const sessionArg = (v: unknown): string => (isNonEmptyString(v) && v.length <= 64 ? v : bad(t().debug.args.session))
const idArg = (v: unknown, what: () => string): number =>
  int(v, { min: 0, max: MAX_ID }, t().debug.errors.invalidRequest(what()))
const expressionArg = (v: unknown): string =>
  typeof v === 'string' && v.trim() !== '' && v.length <= MAX_EXPRESSION ? v : bad(t().debug.args.expression)

/** Session requests: without a manager there is no session (the renderer is behind its end). */
function managerOf(wc: WebContents): DebugManager {
  return debugManagerOf(wc) ?? bad(t().debug.args.session)
}

export function registerDebugHandlers(): void {
  registerTerminalSource('debugRun', debugRunCommand)
  // Changing the folder ends the sessions and forgets the breakpoints (they belonged to the previous folder).
  onWindowRootChange((wc) => {
    debugManagerOf(wc)
      ?.resetForFolder()
      .catch((err: unknown) => log.error('debug: folder change', err))
  })

  handle('debug:configurations', (e) => ensureDebugManager(e.sender).configurations())
  handle('debug:createLaunchFile', (e) => ensureDebugManager(e.sender).createLaunchFile())
  handle('debug:start', (e, name: unknown, options: unknown) => {
    const config = isNonEmptyString(name) && name.length <= 500 ? name : bad(t().debug.args.name)
    return ensureDebugManager(e.sender).start(config, parseStartOptions(options))
  })
  handle('debug:stop', (e, id: unknown) => managerOf(e.sender).stop(sessionArg(id)))
  handle('debug:restart', (e, id: unknown) => managerOf(e.sender).restart(sessionArg(id)))
  handle('debug:control', (e, id: unknown, action: unknown, threadId: unknown) => {
    const session = sessionArg(id)
    const what = oneOf(
      action,
      ['continue', 'pause', 'next', 'stepIn', 'stepOut'] as const,
      t().debug.errors.invalidRequest(t().debug.args.action)
    )
    const thread = threadId === null ? null : idArg(threadId, () => t().debug.args.thread)
    return managerOf(e.sender).control(session, what, thread)
  })
  handle('debug:threads', (e, id: unknown) => managerOf(e.sender).threads(sessionArg(id)))
  handle('debug:stackTrace', (e, id: unknown, threadId: unknown) =>
    managerOf(e.sender).stackTrace(
      sessionArg(id),
      idArg(threadId, () => t().debug.args.thread)
    )
  )
  handle('debug:scopes', (e, id: unknown, frameId: unknown) =>
    managerOf(e.sender).scopes(
      sessionArg(id),
      idArg(frameId, () => t().debug.args.frame)
    )
  )
  handle('debug:variables', (e, id: unknown, ref: unknown) =>
    managerOf(e.sender).variables(
      sessionArg(id),
      idArg(ref, () => t().debug.args.reference)
    )
  )
  handle('debug:evaluate', (e, id: unknown, expression: unknown, frameId: unknown, context: unknown) => {
    const session = sessionArg(id)
    const expr = expressionArg(expression)
    const frame = frameId === null ? null : idArg(frameId, () => t().debug.args.frame)
    const ctx = oneOf(
      context,
      ['repl', 'watch', 'hover'] as const,
      t().debug.errors.invalidRequest(t().debug.args.context)
    )
    return managerOf(e.sender).evaluate(session, expr, frame, ctx)
  })

  // Fire-and-forget: invalid input is ignored.
  on('debug:setBreakpoints', (e, path: unknown, breakpoints: unknown) => {
    const list = parseSourceBreakpoints(breakpoints)
    if (!isAbsolutePathInput(path) || !list) return
    ensureDebugManager(e.sender).setBreakpoints(path, list)
  })
}
