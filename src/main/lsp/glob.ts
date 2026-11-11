const escapeChar = (c: string): string => c.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

/** Limit of the accepted pattern: a server cannot hand us a giant expression. */
const MAX_PATTERN = 512

/**
 * Compiles an LSP glob (`**`, `*`, `?`, `{a,b}`, `[a-z]`, `[!a-z]`) into a regex anchored on a relative path with
 * `/`. `*` and `?` do not cross `/`; `**` crosses zero or more segments. Invalid (or too large) pattern → `null`.
 */
export function globToRegExp(glob: string, ignoreCase = false): RegExp | null {
  if (glob.length === 0 || glob.length > MAX_PATTERN) return null
  let out = ''
  let depth = 0
  let i = 0
  while (i < glob.length) {
    const c = glob.charAt(i)
    if (c === '*') {
      if (glob[i + 1] === '*') {
        let end = i + 2
        while (glob[end] === '*') end++
        const atStart = i === 0 || glob[i - 1] === '/' || glob[i - 1] === '{' || glob[i - 1] === ','
        if (atStart && glob[end] === '/') {
          out += '(?:[^/]+/)*'
          i = end + 1
        } else {
          out += atStart && end === glob.length ? '.*' : '[^/]*'
          i = end
        }
      } else {
        out += '[^/]*'
        i++
      }
    } else if (c === '?') {
      out += '[^/]'
      i++
    } else if (c === '{') {
      depth++
      out += '(?:'
      i++
    } else if (c === '}' && depth > 0) {
      depth--
      out += ')'
      i++
    } else if (c === ',' && depth > 0) {
      out += '|'
      i++
    } else if (c === '[') {
      const close = glob.indexOf(']', i + 2)
      if (close < 0) {
        out += '\\['
        i++
        continue
      }
      let body = glob.slice(i + 1, close)
      const negated = body[0] === '!' || body[0] === '^'
      if (negated) body = body.slice(1)
      body = body.replace(/[\\\]^]/g, '\\$&')
      out += negated ? `[^/${body}]` : `[${body}]`
      i = close + 1
    } else if (c === '\\' && i + 1 < glob.length) {
      out += escapeChar(glob.charAt(i + 1))
      i += 2
    } else {
      out += escapeChar(c)
      i++
    }
  }
  if (depth > 0) return null
  try {
    return new RegExp(`^${out}$`, ignoreCase ? 'i' : '')
  } catch {
    return null
  }
}
