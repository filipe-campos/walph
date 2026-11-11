// Reasoning effort: levels, chip bars and slider navigation.
import { CLAUDE_EFFORTS } from '@shared/claudeModes'
import type { ClaudeEffort } from '@shared/types'

/** From lowest to highest; they stay in English and mono, as in the CLI `/effort`. */
export const EFFORT_LEVELS: readonly ClaudeEffort[] = CLAUDE_EFFORTS

const BARS = ['▁', '▃', '▅', '▇', '█']

/** Chip bars: `on` up to the level, the rest off. `null` (auto) = all off. */
export function effortBars(effort: ClaudeEffort | null): { glyph: string; on: boolean }[] {
  const level = effort ? EFFORT_LEVELS.indexOf(effort) : -1
  return BARS.map((glyph, i) => ({ glyph, on: i <= level }))
}

/** Slider positions: `null` (auto) and then the levels in canonical order, filtered by what the model accepts. */
export function effortOptions(accepted: readonly ClaudeEffort[]): (ClaudeEffort | null)[] {
  return [null, ...EFFORT_LEVELS.filter((l) => accepted.includes(l))]
}

/**
 * ← / →: neighbor in the list (without wrapping around). A current level the model does not accept starts from auto.
 */
export function stepEffort(
  current: ClaudeEffort | null,
  accepted: readonly ClaudeEffort[],
  step: 1 | -1
): ClaudeEffort | null {
  const options = effortOptions(accepted)
  const at = Math.max(0, options.indexOf(current))
  return options[Math.min(options.length - 1, Math.max(0, at + step))] ?? null
}
