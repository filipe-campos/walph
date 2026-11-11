/** Only web and e-mail may go to the default browser/client: `file:`, `javascript:` and app schemes never. */
const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** The URL (trimmed) if it is http, https or mailto; `null` for anything else or invalid text. */
export function externalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null
  const url = value.trim()
  try {
    const parsed = new URL(url)
    return OPENABLE_PROTOCOLS.has(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}
