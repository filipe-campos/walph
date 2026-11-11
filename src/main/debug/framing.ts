// Debug Adapter Protocol framing: header `Content-Length: N\r\n\r\n` + N bytes of JSON (UTF-8), as in LSP. LSP uses
// `vscode-jsonrpc`, which requires JSON-RPC messages; DAP has its own format (`seq`/`type`), so the reader is this one,
// pure and bounded: the adapter output is untrusted.

/** Cap of one message (a huge `variables` fits; an endless stream does not blow the memory). */
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024
const MAX_HEADER_BYTES = 8 * 1024
const SEPARATOR = Buffer.from('\r\n\r\n')

export interface DapParser {
  /** Appends bytes and returns the complete messages (JSON already parsed; the content is still `unknown`). */
  feed(chunk: Buffer): unknown[]
}

/** Unrecoverable protocol error (invalid header, message too large, broken JSON). */
export class DapFramingError extends Error {}

export function createDapParser(maxMessage = MAX_MESSAGE_BYTES): DapParser {
  let buffer: Buffer = Buffer.alloc(0)
  let pending: Buffer[] = []
  let size = 0
  let expected: number | null = null

  const readHeader = (): boolean => {
    const end = buffer.indexOf(SEPARATOR)
    if (end < 0) {
      if (buffer.length > MAX_HEADER_BYTES) throw new DapFramingError('header too long')
      return false
    }
    const header = buffer.subarray(0, end).toString('ascii')
    buffer = buffer.subarray(end + SEPARATOR.length)
    let length: number | null = null
    for (const line of header.split('\r\n')) {
      const match = /^content-length:\s*(\d+)\s*$/i.exec(line)
      if (match) length = Number(match[1])
    }
    if (length === null) throw new DapFramingError('missing Content-Length')
    if (length > maxMessage) throw new DapFramingError('message too large')
    expected = length
    return true
  }

  return {
    feed(chunk) {
      // Large body in many chunks: concatenates once, when it has fully arrived (on every chunk it would be quadratic).
      pending.push(chunk)
      size += chunk.length
      if (expected !== null && size < expected) return []
      buffer = pending.length === 1 ? chunk : Buffer.concat(pending)
      const messages: unknown[] = []
      for (;;) {
        if (expected === null && !readHeader()) break
        if (expected === null || buffer.length < expected) break
        const body = buffer.subarray(0, expected).toString('utf8')
        buffer = buffer.subarray(expected)
        expected = null
        try {
          messages.push(JSON.parse(body) as unknown)
        } catch {
          throw new DapFramingError('invalid JSON')
        }
      }
      pending = buffer.length > 0 ? [buffer] : []
      size = buffer.length
      return messages
    }
  }
}

export function encodeDapMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
}
