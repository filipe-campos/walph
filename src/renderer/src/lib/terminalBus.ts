// The shell starts writing (prompt) before the xterm component mounts.
// This bus buffers each terminal's output until someone connects and acks to main (`terminal.ack`) what was already
// delivered to xterm: it is the flow control that lets main pause the pty when the renderer cannot keep up.
// The ack units are characters (`string.length`), the same ones main adds up when sending.

/** `done` must be called when xterm finished processing `data` (`term.write` callback). */
type AckedListener = (data: string, done: () => void) => void

const listeners = new Map<string, AckedListener>()
const buffers = new Map<string, string[]>()
const bufferedChars = new Map<string, number>()
/** Cap of what stays buffered with nobody listening; past it, the oldest is dropped. */
const MAX_BUFFER_CHARS = 5 * 1024 * 1024
const ACK_BATCH_MS = 16

const pendingAcks = new Map<string, number>()
let ackTimer: ReturnType<typeof setTimeout> | undefined

function flushAcks(): void {
  ackTimer = undefined
  for (const [id, chars] of pendingAcks) window.api.terminal.ack(id, chars)
  pendingAcks.clear()
}

/** Accumulates acks and sends one message per terminal per window, instead of one per chunk. */
function ack(id: string, chars: number): void {
  if (chars <= 0) return
  pendingAcks.set(id, (pendingAcks.get(id) ?? 0) + chars)
  ackTimer ??= setTimeout(flushAcks, ACK_BATCH_MS)
}

function buffer(id: string, data: string): void {
  let chunks = buffers.get(id)
  if (!chunks) buffers.set(id, (chunks = []))
  chunks.push(data)
  let total = (bufferedChars.get(id) ?? 0) + data.length
  while (total > MAX_BUFFER_CHARS && chunks.length > 1) total -= chunks.shift()!.length
  bufferedChars.set(id, total)
  // Buffering counts as "consuming" for flow control: else a terminal without a mounted xterm would stall the pty
  // forever.
  ack(id, data.length)
}

const enterListeners = new Set<(id: string) => void>()

/** Notifies that the user sent Enter to terminal `id` (the shell may have changed directory). */
export function onTerminalEnter(cb: (id: string) => void): () => void {
  enterListeners.add(cb)
  return () => enterListeners.delete(cb)
}

export function notifyTerminalInput(id: string, data: string): void {
  if (data.includes('\r')) enterListeners.forEach((cb) => cb(id))
}

window.api.terminal.onData((id, data) => {
  const listener = listeners.get(id)
  if (listener) listener(data, () => ack(id, data.length))
  else buffer(id, data)
})

/**
 * Connects xterm to terminal `id`, acking the flow through the `write` callback:
 * `attachTerminalAcked(id, (data, done) => term.write(data, done))`.
 */
export function attachTerminalAcked(id: string, listener: AckedListener): () => void {
  listeners.set(id, listener)
  const pending = buffers.get(id)
  buffers.delete(id)
  bufferedChars.delete(id)
  // What was buffered was already acked when it was buffered.
  pending?.forEach((data) => listener(data, () => undefined))
  return () => {
    if (listeners.get(id) === listener) listeners.delete(id)
  }
}

/** Simple variant: acks as soon as `listener` returns (without following xterm's internal queue). */
export function attachTerminal(id: string, listener: (data: string) => void): () => void {
  return attachTerminalAcked(id, (data, done) => {
    listener(data)
    done()
  })
}

export function forgetTerminal(id: string): void {
  listeners.delete(id)
  buffers.delete(id)
  bufferedChars.delete(id)
  pendingAcks.delete(id)
}
