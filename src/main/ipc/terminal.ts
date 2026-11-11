import { registerEvictionGuard } from '../window/evictionGuards'
import { onWorkspaceEvent } from '../window/windows'
import { createTerminal } from '../terminal/create'
import { resolveLinkFile, currentCwd } from '../terminal/links'
import { ownedTerminal, resumeInactiveOutput, terminalEvictionReason, terminals } from '../terminal/registry'
import { parseAckChars, parseLinkPath, parseResize, parseWriteData } from '../terminal/validate'
import { handle, on } from './typed'

export function registerTerminalHandlers(): void {
  onWorkspaceEvent((event) => {
    if (event.type === 'activated' || event.type === 'changed') resumeInactiveOutput()
  })
  registerEvictionGuard('terminal', terminalEvictionReason)
  handle('terminal:create', (e, options: unknown) => createTerminal(e.sender, options))

  handle('terminal:resolveLink', async (e, id: unknown, rawPath: unknown) => {
    const t = ownedTerminal(e.sender, id)
    const path = parseLinkPath(rawPath)
    return t && path !== null ? resolveLinkFile(e.sender, t, path) : null
  })

  handle('terminal:cwd', async (e, id: unknown) => {
    const t = ownedTerminal(e.sender, id)
    return t ? currentCwd(e.sender, t) : null
  })

  on('terminal:write', (e, id: unknown, data: unknown) => {
    const text = parseWriteData(data)
    if (text !== null) ownedTerminal(e.sender, id)?.term.write(text)
  })
  on('terminal:ack', (e, id: unknown, chars: unknown) => {
    const count = parseAckChars(chars)
    if (count !== null) ownedTerminal(e.sender, id)?.output?.ack(count)
  })
  on('terminal:resize', (e, id: unknown, cols: unknown, rows: unknown) => {
    const size = parseResize(cols, rows)
    if (size) ownedTerminal(e.sender, id)?.term.resize(size.cols, size.rows)
  })
  on('terminal:kill', (e, id: unknown) => {
    if (typeof id === 'string') void terminals.dispose(e.sender, id)
  })
}
