const isContinuation = (byte: number): boolean => (byte & 0xc0) === 0x80

function sequenceLength(lead: number): number {
  if (lead >= 0xf0) return 4
  if (lead >= 0xe0) return 3
  if (lead >= 0xc0) return 2
  return 1
}

/** Removes a UTF-8 sequence cut in half (byte cut) from the end, so the text does not end in U+FFFD. */
export function trimPartialTail(buf: Buffer): Buffer {
  for (let i = buf.length - 1; i >= 0 && i >= buf.length - 4; i--) {
    const byte = buf[i] ?? 0
    if (isContinuation(byte)) continue
    return i + sequenceLength(byte) > buf.length ? buf.subarray(0, i) : buf
  }
  return buf
}

/** Removes orphan continuation bytes from the start (byte cut at the end of a text), so it does not start in U+FFFD. */
export function dropPartialHead(buf: Buffer): Buffer {
  let start = 0
  while (start < buf.length && start < 3 && isContinuation(buf[start] ?? 0)) start++
  return start === 0 ? buf : buf.subarray(start)
}
