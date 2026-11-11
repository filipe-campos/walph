// Output of CLI local commands (`/context`, `/cost`, `/compact`…): the CLI returns it as a `user` message whose text
// comes wrapped in `<local-command-stdout>…</local-command-stdout>` (or `-stderr`). Untrusted text: here we only
// extract, strip ANSI escapes and truncate; whoever renders it sanitizes.

import { stripAnsi, stripControl } from '@shared/controlChars'
import { isFiniteNumber, isRecord } from '@shared/guards'
import { truncateToolOutput } from './textLimits'

// Anchored like the CLI: the WHOLE block is the markup (typed text that merely quotes it does not count).
const TAG = /^\s*<local-command-(stdout|stderr)>([\s\S]*?)<\/local-command-\1>\s*$/

/** Cleans command text: ANSI, `\r\n`/`\r` → `\n`, controls, trim and truncation. `null` if nothing is left. */
export function cleanCommandText(raw: string): string | null {
  const text = stripControl(stripAnsi(raw), { keepNewlines: true }).trim()
  return text === '' ? null : truncateToolOutput(text)
}

/** `user` content (string or text blocks only) → command output, or `null` if it is not command output. */
export function extractCommandOutput(content: unknown): string | null {
  let texts: string[]
  if (typeof content === 'string') texts = [content]
  else if (Array.isArray(content) && content.length > 0) {
    const all = content.every(
      (b) =>
        typeof b === 'object' &&
        b !== null &&
        (b as { type?: unknown }).type === 'text' &&
        typeof (b as { text?: unknown }).text === 'string'
    )
    if (!all) return null
    texts = content.map((b) => (b as { text: string }).text)
  } else return null
  const parts: string[] = []
  for (const t of texts) {
    const m = TAG.exec(t)
    if (!m) return null
    const cleaned = cleanCommandText(m[2] ?? '')
    if (cleaned) parts.push(cleaned)
  }
  return parts.length > 0 ? truncateToolOutput(parts.join('\n')) : null
}

/** Text of a CLI command wrapper in the transcript (`/cmd` and its output): not typed by the user. */
export const isCommandWrapperText = (text: string): boolean =>
  /^\s*<(?:local-command-|command-(?:name|message|args)>)/.test(text)

/** `compact_metadata` of the `compact_boundary` (untrusted) → what the contract exposes. */
export function parseCompactMetadata(meta: unknown): { trigger: 'manual' | 'auto'; preTokens: number | null } {
  const m = isRecord(meta) ? meta : {}
  const pre = m.pre_tokens
  return {
    trigger: m.trigger === 'manual' ? 'manual' : 'auto',
    preTokens: isFiniteNumber(pre) && pre >= 0 ? Math.round(pre) : null
  }
}
