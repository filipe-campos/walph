// Resolves the current model option and the family ("Opus"), used by main (effort) and by the renderer (chip). Pure.
import type { ClaudeModelOption } from '@shared/types'

const FAMILY = /\b(opus|sonnet|haiku|fable)\b/i
const FROM_ID = /claude-(opus|sonnet|haiku|fable)/i

const MODEL_ID = /^[A-Za-z0-9][\w.:@[\]/-]{0,199}$/

/**
 * Alias (`opus`) or full id (`claude-opus-4-1[1m]`, Vertex `claude-sonnet-4@20250514`): becomes `--model`, so no
 * spaces, commas or leading `-`.
 */
export function isModelId(v: unknown): v is string {
  return typeof v === 'string' && MODEL_ID.test(v)
}

export function family(text: string | undefined): string | null {
  if (!text) return null
  const m = FROM_ID.exec(text) ?? FAMILY.exec(text)
  if (!m) return null
  const name = m[1]
  if (!name) return null
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

/**
 * The menu option matching the current model: by alias (`value`), by the resolved id (`init` brings the full id,
 * sometimes with a suffix like `[1m]`) and, finally, by family ("claude-opus-…" → the `opus` option, or the `default`
 * one that runs Opus). Without this the chip would lose the effort after the first message.
 */
export function currentModelOption(
  model: string,
  models: readonly ClaudeModelOption[] | undefined
): ClaudeModelOption | undefined {
  if (!models || !model) return models?.find((m) => m.value === model)
  const bare = model.replace(/\[.*\]$/, '')
  const exact =
    models.find((m) => m.value === model) ??
    models.find((m) => m.resolvedModel === model) ??
    models.find((m) => m.resolvedModel?.replace(/\[.*\]$/, '') === bare)
  if (exact) return exact
  const fam = family(model === 'default' ? undefined : model)
  if (!fam) return undefined
  return models.find((m) => m.value.toLowerCase() === fam.toLowerCase()) ?? models.find((m) => familyOf(m) === fam)
}

function familyOf(m: ClaudeModelOption): string | null {
  return family(m.resolvedModel) ?? family(m.displayName) ?? family(m.description)
}
