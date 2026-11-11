// Short model name for the Claude panel chip ("Opus", as in the design system). Pure.
import type { ClaudeModelOption } from '@shared/types'
import { currentModelOption, family } from '@shared/claudeModel'
import { t } from '@shared/i18n'

export { currentModelOption }

/**
 * "Default (recommended)" does not say which model runs: the name comes from the id (`claude-opus-…`), from the alias'
 * resolved id, from the display name or from the description, the first one that names a family. Without a known
 * family,
 * the display name without parentheses.
 */
export function modelChipName(model: string, option: ClaudeModelOption | undefined): string {
  const byName =
    family(model === 'default' ? undefined : model) ??
    family(option?.resolvedModel) ??
    family(option?.displayName) ??
    family(option?.description)
  if (byName) return byName
  const shown = option?.displayName.replace(/\s*\(.*\)\s*$/, '').trim()
  return shown || model || t().claude.modelName.default
}
