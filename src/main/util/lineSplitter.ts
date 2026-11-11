// Splits a text stream into complete lines, without letting an endless "line" grow without bound.

export interface LineSplitter {
  /** Lines completed by this chunk (without `\r?\n`). The rest waits for the next `feed`. */
  feed(chunk: string): string[]
  /** Delivers the final chunk without a line break, if any. */
  flush(): string[]
}

const DEFAULT_MAX_LINE = 64 * 1024

/** When the pending chunk exceeds `maxLine`, it is emitted as a (whole) line instead of accumulating further. */
export function createLineSplitter(maxLine = DEFAULT_MAX_LINE): LineSplitter {
  let tail = ''
  return {
    feed(chunk) {
      const lines = (tail + chunk).split(/\r?\n/)
      tail = lines.pop() ?? ''
      if (tail.length > maxLine) {
        lines.push(tail)
        tail = ''
      }
      return lines
    },
    flush() {
      const rest = tail
      tail = ''
      return rest === '' ? [] : [rest]
    }
  }
}
