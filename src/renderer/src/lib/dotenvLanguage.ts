import { LanguageDescription, LanguageSupport, StreamLanguage, type StreamParser } from '@codemirror/language'

type DotenvState = { value: boolean; quote: string | null }

const INTERPOLATION = /^(\$\{[^}\n]*\}?|\$[A-Za-z_]\w*)/

/** `KEY=value` key, `export KEY=value`, `#` comments, quoted values (including over several lines) and `${VAR}`. */
const dotenv: StreamParser<DotenvState> = {
  name: 'dotenv',
  startState: () => ({ value: false, quote: null }),
  token(stream, state) {
    if (state.quote) return quoted(stream, state)
    if (stream.sol()) state.value = false
    if (stream.eatSpace()) return null

    if (!state.value) {
      if (stream.match('#')) {
        stream.skipToEnd()
        return 'comment'
      }
      if (stream.match(/^export(?=\s)/)) return 'keyword'
      if (stream.match(/^[^\s=#]+/)) return 'property'
      if (stream.eat('=')) {
        state.value = true
        return 'operator'
      }
      stream.next()
      return null
    }

    if (stream.match('#')) {
      stream.skipToEnd()
      return 'comment'
    }
    const ch = stream.peek()
    if (ch === '"' || ch === "'") {
      state.quote = ch
      stream.next()
      return quoted(stream, state)
    }
    if (ch === '$' && stream.match(INTERPOLATION)) return 'variable-2'
    // Unquoted: runs up to an interpolation or a comment (`#` after a space).
    do {
      stream.next()
    } while (!stream.eol() && !stream.match(/^(\s+#|\$[{A-Za-z_])/, false))
    return 'string'
  }
}

function quoted(stream: Parameters<NonNullable<StreamParser<DotenvState>['token']>>[0], state: DotenvState): string {
  const quote = state.quote
  let consumed = false
  while (!stream.eol()) {
    const ch = stream.peek()
    if (ch === quote) {
      stream.next()
      state.quote = null
      return 'string'
    }
    if (quote === '"') {
      if (ch === '\\') {
        stream.next()
        stream.next()
        consumed = true
        continue
      }
      if (ch === '$' && stream.match(/^(\$\{|\$[A-Za-z_])/, false)) {
        if (consumed) return 'string'
        stream.match(INTERPOLATION)
        return 'variable-2'
      }
    }
    stream.next()
    consumed = true
  }
  return 'string'
}

/** `.env`, `.env.local`, `.env.example`, `production.env`: language-data has no mode for them. */
export const dotenvLanguage = LanguageDescription.of({
  name: 'Dotenv',
  alias: ['env', 'dotenv'],
  extensions: ['env'],
  filename: /^\.env\..+$/,
  load: () => Promise.resolve(new LanguageSupport(StreamLanguage.define(dotenv)))
})
