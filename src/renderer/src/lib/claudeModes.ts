// Permission modes offered in the panel and the ⇧⇥ order.
import type { ClaudePermissionMode } from '@shared/settings'
import { t } from '@shared/i18n'

export interface ModeInfo {
  mode: ClaudePermissionMode
  label: string
  /** Short name for the box chip. */
  short: string
  /** Design system icon. */
  icon: 'hand' | 'pencil' | 'plan' | 'bolt' | 'shield'
  /** Icon color in the chip and in the menu (design system `wp-tone-*`). */
  tone: 'manual' | 'edit' | 'plan' | 'auto' | 'danger'
  /** One sentence in the menu. */
  description: string
  /** Fixed notice under the text (only Plan and Bypass permissions). */
  note?: string
}

// Names, icons and sentences exactly as in the design system ClaudePanel (the same as Claude Code's). The sentences are
// getters: the language is read on each access.
export const PERMISSION_MODES: readonly [ModeInfo, ...ModeInfo[]] = [
  {
    mode: 'default',
    label: 'Manual',
    short: 'Manual',
    icon: 'hand',
    tone: 'manual',
    get description() {
      return t().claude.modes.default
    }
  },
  {
    mode: 'acceptEdits',
    label: 'Edit automatically',
    short: 'Edit auto',
    icon: 'pencil',
    tone: 'edit',
    get description() {
      return t().claude.modes.acceptEdits
    }
  },
  {
    mode: 'plan',
    label: 'Plan',
    short: 'Plan',
    icon: 'plan',
    tone: 'plan',
    get description() {
      return t().claude.modes.plan
    },
    get note() {
      return t().claude.modes.planNote
    }
  },
  {
    mode: 'auto',
    label: 'Auto',
    short: 'Auto',
    icon: 'bolt',
    tone: 'auto',
    get description() {
      return t().claude.modes.auto
    }
  },
  {
    mode: 'bypassPermissions',
    label: 'Bypass permissions',
    short: 'Bypass',
    icon: 'shield',
    tone: 'danger',
    get description() {
      return t().claude.modes.bypassPermissions
    }
  }
]

export function modeInfo(mode: ClaudePermissionMode): ModeInfo {
  return PERMISSION_MODES.find((m) => m.mode === mode) ?? PERMISSION_MODES[0]
}

/** Modes of the ⇧⇥ cycle: "Bypass permissions" only with `claude.allowBypassPermissions`. */
export function enabledModes(allowBypass: boolean): readonly ModeInfo[] {
  return allowBypass ? PERMISSION_MODES : PERMISSION_MODES.filter((m) => m.mode !== 'bypassPermissions')
}

/**
 * Next enabled mode of the ⇧⇥ cycle (Manual → Edit auto → Plan → Auto [→ Bypass] → Manual); `step` -1
 * goes back. A mode outside the list (e.g. Bypass with the permission off) starts from the first.
 */
export function nextPermissionMode(
  mode: ClaudePermissionMode,
  step: 1 | -1 = 1,
  allowBypass = false
): ClaudePermissionMode {
  const list = enabledModes(allowBypass)
  const index = list.findIndex((m) => m.mode === mode)
  const from = index < 0 ? 0 : index
  return list[(from + step + list.length) % list.length]?.mode ?? mode
}
