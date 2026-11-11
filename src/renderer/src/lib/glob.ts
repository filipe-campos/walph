// `files.exclude` globs, with the VS Code semantics over root-relative paths, always with `/`:
// `**` (any depth), `*`, `?`, `{a,b}` and `[abc]`. Without `/` or `**/`, the pattern applies only at the root (`dist`
// does not match `src/dist`; `**/dist` matches at any level). Matching a folder hides everything inside it.

const REGEX_SPECIAL = /[.+^$()|\\]/

/** Converts the glob into a regex source (without anchors). */
function translate(glob: string): string {
  let out = ''
  let braceDepth = 0
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i)
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        const atEnd = i + 1 >= glob.length || glob[i + 1] === ',' || glob[i + 1] === '}'
        if (glob[i + 1] === '/') {
          // `**/` = zero or more folders.
          i++
          out += '(?:.*/)?'
        } else if (atEnd && out.endsWith('/')) {
          // `dir/**` also matches `dir` itself.
          out = out.slice(0, -1) + '(?:/.*)?'
        } else out += '.*'
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '{') {
      braceDepth++
      out += '(?:'
    } else if (c === '}' && braceDepth > 0) {
      braceDepth--
      out += ')'
    } else if (c === ',' && braceDepth > 0) out += '|'
    else if (c === '[') {
      const end = glob.indexOf(']', i + 2)
      if (end < 0) out += '\\['
      else {
        let body = glob.slice(i + 1, end)
        const negate = body[0] === '!' || body[0] === '^'
        if (negate) body = body.slice(1)
        out += `[${negate ? '^' : ''}${body.replace(/[\\\]^]/g, '\\$&')}]`
        i = end
      }
    } else out += REGEX_SPECIAL.test(c) ? `\\${c}` : c
  }
  // Unclosed brace: closes the group so the regex stays valid.
  return out + ')'.repeat(braceDepth)
}

/** Compiles a glob into a test over the relative path (`a/b/c`). `null` if the pattern is invalid. */
export function compileGlob(glob: string): ((rel: string) => boolean) | null {
  const pattern = glob
    .trim()
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '')
  if (!pattern) return null
  try {
    const regex = new RegExp(`^(?:${translate(pattern)})(?:/.*)?$`)
    return (rel) => regex.test(rel)
  } catch {
    return null
  }
}

export interface ExcludeMatcher {
  /** `rel`: path relative to the root with `/`. `true` if it or some folder above it matches some glob. */
  matches(rel: string): boolean
  /** Without any active glob (filtering is a no-op). */
  readonly empty: boolean
}

const NONE: ExcludeMatcher = { matches: () => false, empty: true }

/** Compiles the list once; invalid globs are ignored. */
export function compileExcludes(globs: readonly string[]): ExcludeMatcher {
  const tests = globs.map(compileGlob).filter((t): t is (rel: string) => boolean => t !== null)
  if (tests.length === 0) return NONE
  return { matches: (rel) => tests.some((test) => test(rel)), empty: false }
}
