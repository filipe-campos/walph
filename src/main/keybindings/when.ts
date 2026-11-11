import { t as i18n } from '@shared/i18n'
import { CONTEXT_KEYS, FOCUS_CONTEXT_KEYS, type ContextKey } from '@shared/commands'

// Shortcut `when` clauses: identifiers from `CONTEXT_KEYS`, `!`, `&&`, `||` (precedence ! > && > ||) and
// parentheses. Pure module: main compiles the text once when building the tables and evaluates it on every key.

export type WhenExpr =
  | { type: 'key'; key: ContextKey }
  | { type: 'not'; operand: WhenExpr }
  | { type: 'and'; left: WhenExpr; right: WhenExpr }
  | { type: 'or'; left: WhenExpr; right: WhenExpr }

/** Current context values of a window; a missing key is `false`. */
export type WhenContext = Partial<Record<ContextKey, boolean>>

type Token = { type: 'ident'; text: string } | { type: 'op'; text: '!' | '&&' | '||' | '(' | ')' }

function tokenize(text: string): Token[] | { error: string } {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i] ?? ''
    if (/\s/.test(c)) {
      i++
    } else if (c === '!' || c === '(' || c === ')') {
      tokens.push({ type: 'op', text: c })
      i++
    } else if (text.startsWith('&&', i) || text.startsWith('||', i)) {
      tokens.push({ type: 'op', text: text.slice(i, i + 2) as '&&' | '||' })
      i += 2
    } else if (/[A-Za-z_]/.test(c)) {
      const start = i
      while (i < text.length && /[\w.]/.test(text.charAt(i))) i++
      tokens.push({ type: 'ident', text: text.slice(start, i) })
    } else {
      return { error: i18n().commands.when.unexpectedChar(c, i + 1) }
    }
  }
  return tokens
}

class WhenSyntaxError extends Error {}

export const isContextKey = (key: unknown): key is ContextKey =>
  typeof key === 'string' && (CONTEXT_KEYS as readonly string[]).includes(key)

/**
 * Reads a `when` clause. Returns the error message (in the current language) if there is an unknown identifier or a
 * syntax error.
 */
export function parseWhen(text: string): { expr: WhenExpr } | { error: string } {
  const tokens = tokenize(text)
  if ('error' in tokens) return tokens
  if (tokens.length === 0) return { error: i18n().commands.when.empty }

  let pos = 0
  const fail = (message: string): never => {
    throw new WhenSyntaxError(message)
  }
  const isOp = (op: string): boolean => {
    const t = tokens[pos]
    return t?.type === 'op' && t.text === op
  }

  const parseOr = (): WhenExpr => {
    let left = parseAnd()
    while (isOp('||')) {
      pos++
      left = { type: 'or', left, right: parseAnd() }
    }
    return left
  }
  const parseAnd = (): WhenExpr => {
    let left = parseNot()
    while (isOp('&&')) {
      pos++
      left = { type: 'and', left, right: parseNot() }
    }
    return left
  }
  const parseNot = (): WhenExpr => {
    if (isOp('!')) {
      pos++
      return { type: 'not', operand: parseNot() }
    }
    return parsePrimary()
  }
  const parsePrimary = (): WhenExpr => {
    const t = tokens[pos]
    if (!t) return fail(i18n().commands.when.endsEarly)
    if (t.type === 'ident') {
      if (!isContextKey(t.text)) {
        return fail(i18n().commands.when.unknownIdentifier(t.text, CONTEXT_KEYS.join(', ')))
      }
      pos++
      return { type: 'key', key: t.text }
    }
    if (t.text === '(') {
      pos++
      const inner = parseOr()
      if (!isOp(')')) return fail(i18n().commands.when.unclosedParen)
      pos++
      return inner
    }
    return fail(i18n().commands.when.unexpectedSymbol(t.text))
  }

  try {
    const expr = parseOr()
    const t = tokens[pos]
    if (t) {
      return { error: i18n().commands.when.unexpectedSymbol(t.text) }
    }
    return { expr }
  } catch (err) {
    if (err instanceof WhenSyntaxError) return { error: err.message }
    throw err
  }
}

export function evaluateWhen(expr: WhenExpr, context: WhenContext): boolean {
  switch (expr.type) {
    case 'key':
      return context[expr.key] === true
    case 'not':
      return !evaluateWhen(expr.operand, context)
    case 'and':
      return evaluateWhen(expr.left, context) && evaluateWhen(expr.right, context)
    case 'or':
      return evaluateWhen(expr.left, context) || evaluateWhen(expr.right, context)
  }
}

/**
 * `true` if the two clauses never hold at the same time (`undefined` = always active). Brute force over the 2^n
 * combinations of `CONTEXT_KEYS`: n is small and this avoids a solver. Combinations with more than one focus
 * true are skipped (`FOCUS_CONTEXT_KEYS`).
 */
export function whenDisjoint(a?: WhenExpr, b?: WhenExpr): boolean {
  const total = 1 << CONTEXT_KEYS.length
  for (let mask = 0; mask < total; mask++) {
    const context: WhenContext = {}
    CONTEXT_KEYS.forEach((key, i) => {
      context[key] = (mask & (1 << i)) !== 0
    })
    // Focuses are exclusive (see `FOCUS_CONTEXT_KEYS`): impossible combinations do not count.
    if (FOCUS_CONTEXT_KEYS.filter((key) => context[key]).length > 1) continue
    if ((!a || evaluateWhen(a, context)) && (!b || evaluateWhen(b, context))) return false
  }
  return true
}

/** Like `whenDisjoint`, over the text. An invalid clause counts as "always active" (never hides a conflict). */
export function whenTextsDisjoint(a?: string, b?: string): boolean {
  const parse = (text?: string): WhenExpr | undefined => {
    if (!text) return undefined
    const parsed = parseWhen(text)
    return 'expr' in parsed ? parsed.expr : undefined
  }
  return whenDisjoint(parse(a), parse(b))
}
