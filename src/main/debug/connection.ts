import type { Readable, Writable } from 'node:stream'
import { isFiniteNumber, isNonEmptyString, isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { UserError } from '../errors'
import { createLog } from '../log'
import { rejectAfter } from '../util/deadline'
import { createDapParser, DapFramingError, encodeDapMessage } from './framing'
import { responseErrorMessage } from './normalize'

const log = createLog('debug')

/** A DAP channel: the adapter's stdio or a TCP socket. `close` tears down the channel (not the adapter process). */
export interface DapStreams {
  input: Readable
  output: Writable
  close(): void
}

/** The adapter refused the request (`success: false`): the message is its own, already with the translated prefix. */
class DapResponseError extends UserError {
  constructor(readonly adapterMessage: string) {
    super(t().debug.errors.adapter(adapterMessage))
  }
}

export interface ConnectionHandlers {
  onEvent(event: string, body: unknown): void
  /** Adapter reverse request (`runInTerminal`, `startDebugging`): resolves the response body; reject = refuse. */
  onRequest(command: string, args: unknown): Promise<unknown>
  /** The channel closed (end of stream, protocol error or `close`). Called once. */
  onClose(protocolError: string | null): void
}

interface Pending {
  command: string
  resolve(body: unknown): void
  reject(err: Error): void
}

/** DAP client over two streams: requests with `seq` and deadline, events, reverse requests. Knows no processes. */
export class DapConnection {
  private seq = 1
  private readonly pending = new Map<number, Pending>()
  private closed = false

  constructor(
    private readonly streams: DapStreams,
    private readonly handlers: ConnectionHandlers
  ) {
    const parser = createDapParser()
    streams.input.on('data', (chunk: Buffer | string) => {
      if (this.closed) return
      let messages: unknown[]
      try {
        messages = parser.feed(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      } catch (err) {
        this.close(err instanceof DapFramingError ? err.message : String(err))
        return
      }
      for (const message of messages) {
        // A listener that throws must not tear down the stream nor leave the following messages undelivered.
        try {
          this.dispatch(message)
        } catch (err) {
          log.error('debug: adapter message', err)
        }
      }
    })
    streams.input.on('error', () => this.close(null))
    streams.input.on('close', () => this.close(null))
    streams.input.on('end', () => this.close(null))
    streams.output.on('error', () => this.close(null))
  }

  get isClosed(): boolean {
    return this.closed
  }

  /** Request with a deadline: resolves the response `body`; rejects translated (timeout, refusal, closed channel). */
  request(command: string, args: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new UserError(t().debug.errors.communication(command)))
    const seq = this.seq++
    const answer = new Promise<unknown>((resolve, reject) => {
      this.pending.set(seq, { command, resolve, reject })
    })
    if (!this.write({ seq, type: 'request', command, ...(args === undefined ? {} : { arguments: args }) })) {
      this.pending.delete(seq)
      return Promise.reject(new UserError(t().debug.errors.communication(command)))
    }
    return rejectAfter(answer, timeoutMs, () => {
      this.pending.delete(seq)
      return new UserError(t().debug.errors.timeout(command))
    })
  }

  close(protocolError: string | null = null): void {
    if (this.closed) return
    this.closed = true
    for (const p of this.pending.values()) p.reject(new UserError(t().debug.errors.communication(p.command)))
    this.pending.clear()
    try {
      this.streams.close()
    } catch {
      // already closed
    }
    this.handlers.onClose(protocolError)
  }

  private write(message: Record<string, unknown>): boolean {
    if (this.closed) return false
    try {
      this.streams.output.write(encodeDapMessage(message))
      return true
    } catch {
      return false
    }
  }

  private dispatch(message: unknown): void {
    if (!isRecord(message)) return
    if (message.type === 'response') this.onResponse(message)
    else if (message.type === 'event' && isNonEmptyString(message.event))
      this.handlers.onEvent(message.event, message.body)
    else if (message.type === 'request' && isNonEmptyString(message.command) && isFiniteNumber(message.seq))
      this.onReverseRequest(message.seq, message.command, message.arguments)
  }

  private onResponse(message: Record<string, unknown>): void {
    const seq = message.request_seq
    if (!isFiniteNumber(seq)) return
    const pending = this.pending.get(seq)
    if (!pending) return
    this.pending.delete(seq)
    if (message.success === true) pending.resolve(message.body)
    else pending.reject(new DapResponseError(responseErrorMessage(message, pending.command)))
  }

  private onReverseRequest(seq: number, command: string, args: unknown): void {
    const reply = (success: boolean, extra: Record<string, unknown>): void => {
      this.write({ seq: this.seq++, type: 'response', request_seq: seq, command, success, ...extra })
    }
    this.handlers.onRequest(command, args).then(
      (body) => reply(true, body === undefined ? {} : { body }),
      // The text goes to the adapter, not to the user: English.
      (err: unknown) => reply(false, { message: err instanceof Error ? err.message : String(err) })
    )
  }
}
