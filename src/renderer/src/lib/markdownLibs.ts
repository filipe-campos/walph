// `marked` and `dompurify` are heavy and only needed on the first preview/hover/Claude message: they load on demand,
// outside
// the initial bundle. Whoever renders after the load uses `markdownLibs()` (synchronous); before that, falls back to
// plain text.
import type { Marked, marked } from 'marked'
import type DOMPurify from 'dompurify'

/** `preview` is its own instance (KaTeX, footnotes, alerts): the global `marked` stays pure for the LSP and Claude. */
type Libs = { marked: typeof marked; preview: Marked; DOMPurify: typeof DOMPurify }

let libs: Libs | null = null
let loading: Promise<Libs> | null = null

/** The libraries, if they already loaded. */
export function markdownLibs(): Libs | null {
  return libs
}

async function load(): Promise<Libs> {
  const [m, d, footnote, alert, katex] = await Promise.all([
    import('marked'),
    import('dompurify'),
    import('marked-footnote'),
    import('marked-alert'),
    import('marked-katex-extension'),
    import('katex/dist/katex.min.css')
  ])
  const preview = new m.Marked()
  preview.use(
    footnote.default(),
    alert.default(),
    // No MathML (the `math` tag is forbidden), muted `strict` (else KaTeX writes to the console) and limits against
    // `\rule{1000em}`.
    katex.default({ output: 'html', throwOnError: false, strict: 'ignore', maxSize: 50, maxExpand: 200 })
  )
  libs = { marked: m.marked, preview, DOMPurify: d.default }
  return libs
}

export function loadMarkdownLibs(): Promise<Libs> {
  loading ??= load()
  // Import failure (chunk unavailable): the next attempt starts from scratch.
  loading.catch(() => {
    loading = null
  })
  return loading
}
