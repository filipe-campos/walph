// Metadata of the Settings UI: section, control and dependencies of each key. The texts (label, description,
// options) live in the `settings` catalog and are read at display time, in the current language.
// `Record<SettingKey, …>` makes a new key in `settings.ts` without metadata a type error; `settingsUi.test.ts` checks
// that limits and options match the schema validators (the source of truth stays in `settings.ts`).

import { LOCALE_NAMES, LOCALES, t } from './i18n'
import type { SettingKey } from './settings'

export type SettingSection = 'editor' | 'files' | 'terminal' | 'claude' | 'appearance'

/** Sections that list keys, in modal navigation order (the modal adds the shortcut list, which is not a setting). */
export const SETTING_SECTIONS: readonly SettingSection[] = ['editor', 'files', 'terminal', 'claude', 'appearance']

export const sectionLabel = (section: SettingSection | 'shortcuts'): string => t().settings.sections[section]

interface SettingOption {
  value: string
  label: () => string
  /** The item is only offered with this boolean key on (or if it is already the current value). */
  requires?: SettingKey
}

/** Summary shown for complex keys (see `describeComplexSetting`). */
export type ComplexKind = 'patterns' | 'profiles' | 'servers' | 'adapters' | 'env' | 'columns'

type SettingControl =
  | { type: 'switch' }
  /** Dynamic `options` are resolved by the UI: `themes` = theme registry, `profiles` = `terminal.profiles`. */
  | { type: 'select'; options: readonly SettingOption[] | 'themes' | 'profiles' }
  | { type: 'number'; min: number; max: number; unit?: string }
  | { type: 'text'; placeholder?: () => string; monospace?: boolean }
  /** Object/list: the UI shows a summary and "Edit in settings.json". */
  | { type: 'complex'; kind: ComplexKind }
  /** No graphical control: only in the JSON file (the list does not show the key). */
  | { type: 'json-only' }

export interface SettingMeta {
  section: SettingSection
  control: SettingControl
  /** The key only takes effect with `key === equals`; otherwise the control is disabled with `note`. */
  dependsOn?: { key: SettingKey; equals: unknown; note: () => string }
}

export const settingLabel = (key: SettingKey): string => t().settings.items[key].label
export const settingDescription = (key: SettingKey): string => t().settings.items[key].description

// Values that are their own display name in any language (effort levels, Claude Code mode names).
const literalOptions = (...values: string[]): SettingOption[] => values.map((value) => ({ value, label: () => value }))

const PERMISSION_MODES: readonly SettingOption[] = [
  { value: 'default', label: () => 'Manual' },
  { value: 'acceptEdits', label: () => 'Edit automatically' },
  { value: 'plan', label: () => 'Plan' },
  { value: 'auto', label: () => 'Auto' },
  { value: 'bypassPermissions', label: () => 'Bypass permissions', requires: 'claude.allowBypassPermissions' }
]

export const SETTINGS_UI: Record<SettingKey, SettingMeta> = {
  'editor.fontSize': {
    section: 'editor',
    control: { type: 'number', min: 6, max: 72, unit: 'px' }
  },
  'editor.fontFamily': {
    section: 'editor',
    control: { type: 'text', monospace: true }
  },
  'editor.tabSize': {
    section: 'editor',
    control: { type: 'number', min: 1, max: 16 }
  },
  'editor.insertSpaces': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'editor.wordWrap': {
    section: 'editor',
    control: {
      type: 'select',
      options: [
        { value: 'off', label: () => t().settings.options.wordWrap.off },
        { value: 'on', label: () => t().settings.options.wordWrap.on }
      ]
    }
  },
  'editor.lineNumbers': {
    section: 'editor',
    control: {
      type: 'select',
      options: [
        { value: 'on', label: () => t().settings.options.lineNumbers.on },
        { value: 'off', label: () => t().settings.options.lineNumbers.off }
      ]
    }
  },
  'editor.minimap': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'editor.stickyScroll.enabled': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'editor.stickyScroll.maxLineCount': {
    section: 'editor',
    control: { type: 'number', min: 1, max: 20 }
  },
  'breadcrumbs.enabled': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'editor.codeLens': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'editor.formatOnSave': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'editor.inlayHints.enabled': {
    section: 'editor',
    control: {
      type: 'select',
      options: [
        { value: 'on', label: () => t().settings.options.inlayHints.on },
        { value: 'off', label: () => t().settings.options.inlayHints.off }
      ]
    }
  },
  'editor.semanticHighlighting.enabled': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'editor.rulers': {
    section: 'editor',
    control: { type: 'complex', kind: 'columns' }
  },
  'editor.renderWhitespace': {
    section: 'editor',
    control: {
      type: 'select',
      options: [
        { value: 'none', label: () => t().settings.options.renderWhitespace.none },
        { value: 'boundary', label: () => t().settings.options.renderWhitespace.boundary },
        { value: 'selection', label: () => t().settings.options.renderWhitespace.selection },
        { value: 'trailing', label: () => t().settings.options.renderWhitespace.trailing },
        { value: 'all', label: () => t().settings.options.renderWhitespace.all }
      ]
    }
  },
  'editor.snippetSuggestions': {
    section: 'editor',
    control: {
      type: 'select',
      options: [
        { value: 'top', label: () => t().settings.options.snippetSuggestions.top },
        { value: 'bottom', label: () => t().settings.options.snippetSuggestions.bottom },
        { value: 'inline', label: () => t().settings.options.snippetSuggestions.inline },
        { value: 'none', label: () => t().settings.options.snippetSuggestions.none }
      ]
    }
  },
  'emmet.enabled': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'emmet.triggerExpansionOnTab': {
    section: 'editor',
    control: { type: 'switch' },
    dependsOn: { key: 'emmet.enabled', equals: true, note: () => t().settings.emmetDisabledNote }
  },
  'emmet.includeLanguages': {
    section: 'editor',
    control: { type: 'json-only' }
  },
  'git.blame.inline': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'git.blame.statusBar': {
    section: 'editor',
    control: { type: 'switch' }
  },
  'lsp.servers': {
    section: 'editor',
    control: { type: 'complex', kind: 'servers' }
  },
  'debug.adapters': {
    section: 'editor',
    control: { type: 'complex', kind: 'adapters' }
  },
  'files.autoSave': {
    section: 'files',
    control: {
      type: 'select',
      options: [
        { value: 'off', label: () => t().settings.options.autoSave.off },
        { value: 'afterDelay', label: () => t().settings.options.autoSave.afterDelay },
        { value: 'onFocusChange', label: () => t().settings.options.autoSave.onFocusChange }
      ]
    }
  },
  'files.autoSaveDelay': {
    section: 'files',
    control: { type: 'number', min: 100, max: 600_000, unit: 'ms' },
    dependsOn: {
      key: 'files.autoSave',
      equals: 'afterDelay',
      note: () => t().settings.autoSaveDelayNote
    }
  },
  'files.trimTrailingWhitespace': {
    section: 'files',
    control: { type: 'switch' }
  },
  'files.insertFinalNewline': {
    section: 'files',
    control: { type: 'switch' }
  },
  'files.trimFinalNewlines': {
    section: 'files',
    control: { type: 'switch' }
  },
  'files.exclude': {
    section: 'files',
    control: { type: 'complex', kind: 'patterns' }
  },
  'search.exclude': {
    section: 'files',
    control: { type: 'complex', kind: 'patterns' }
  },
  'files.watcherExclude': {
    section: 'files',
    control: { type: 'complex', kind: 'patterns' }
  },
  'terminal.fontSize': {
    section: 'terminal',
    control: { type: 'number', min: 6, max: 72, unit: 'px' }
  },
  'terminal.scrollback': {
    section: 'terminal',
    control: { type: 'number', min: 100, max: 100000 }
  },
  'terminal.shell': {
    section: 'terminal',
    control: { type: 'text', placeholder: () => t().settings.placeholders.shell, monospace: true }
  },
  'terminal.profiles': {
    section: 'terminal',
    control: { type: 'complex', kind: 'profiles' }
  },
  'terminal.defaultProfile': {
    section: 'terminal',
    control: { type: 'select', options: 'profiles' }
  },
  'terminal.copyOnSelection': {
    section: 'terminal',
    control: { type: 'switch' }
  },
  'terminal.colorPrompt': {
    section: 'terminal',
    control: { type: 'switch' }
  },
  'terminal.gpuAcceleration': {
    section: 'terminal',
    control: {
      type: 'select',
      options: [
        { value: 'auto', label: () => t().settings.options.gpuAcceleration.auto },
        { value: 'off', label: () => t().settings.options.gpuAcceleration.off }
      ]
    }
  },
  'claude.model': {
    section: 'claude',
    control: { type: 'text', placeholder: () => t().settings.placeholders.model, monospace: true }
  },
  'claude.fallbackModel': {
    section: 'claude',
    control: { type: 'text', placeholder: () => t().settings.placeholders.fallbackModel, monospace: true }
  },
  'claude.initialPermissionMode': {
    section: 'claude',
    control: { type: 'select', options: PERMISSION_MODES }
  },
  'claude.effort': {
    section: 'claude',
    control: {
      type: 'select',
      options: [
        { value: '', label: () => t().settings.options.effortAuto },
        ...literalOptions('low', 'medium', 'high', 'xhigh', 'max')
      ]
    }
  },
  'claude.allowBypassPermissions': {
    section: 'claude',
    control: { type: 'switch' }
  },
  'claude.autoContext': {
    section: 'claude',
    control: { type: 'switch' }
  },
  'claude.executable': {
    section: 'claude',
    control: { type: 'text', placeholder: () => t().settings.placeholders.executable, monospace: true }
  },
  'claude.env': {
    section: 'claude',
    control: { type: 'complex', kind: 'env' }
  },
  'claude.notifications.toast': {
    section: 'claude',
    control: {
      type: 'select',
      options: [
        { value: 'all', label: () => t().settings.options.toast.all },
        { value: 'attention', label: () => t().settings.options.toast.attention },
        { value: 'off', label: () => t().settings.options.toast.off }
      ]
    }
  },
  'claude.notifications.system': {
    section: 'claude',
    control: { type: 'switch' }
  },
  'claude.notifications.sound': {
    section: 'claude',
    control: { type: 'switch' }
  },
  'claude.idleSleepMinutes': {
    section: 'claude',
    control: { type: 'number', min: 0, max: 1440, unit: 'min' }
  },
  'workbench.language': {
    section: 'appearance',
    control: {
      type: 'select',
      options: [
        { value: 'system', label: () => t().settings.options.languageSystem },
        ...LOCALES.map((locale) => ({ value: locale, label: () => LOCALE_NAMES[locale] }))
      ]
    }
  },
  'workbench.theme': {
    section: 'appearance',
    control: { type: 'select', options: 'themes' }
  },
  'workbench.fontFamily': {
    section: 'appearance',
    control: { type: 'text' }
  },
  'workbench.fontSize': {
    section: 'appearance',
    control: { type: 'number', min: 10, max: 20, unit: 'px' }
  },
  'docker.path': {
    section: 'terminal',
    control: { type: 'text', placeholder: () => 'docker', monospace: true }
  },
  'workspaces.maxLiveViews': {
    section: 'appearance',
    control: { type: 'number', min: 0, max: 64 }
  },
  'workspaces.hibernateAfterMinutes': {
    section: 'appearance',
    control: { type: 'number', min: 0, max: 10080, unit: 'min' }
  },
  'update.enabled': {
    section: 'appearance',
    control: { type: 'switch' }
  },
  'update.channel': {
    section: 'appearance',
    control: {
      type: 'select',
      options: [
        { value: 'stable', label: () => t().settings.options.updateChannel.stable },
        { value: 'beta', label: () => t().settings.options.updateChannel.beta }
      ]
    }
  }
}

/** Keys with a graphical control in a section, in `SETTINGS_UI` order. */
export function settingsOfSection(section: SettingSection): SettingKey[] {
  return (Object.keys(SETTINGS_UI) as SettingKey[]).filter(
    (key) => SETTINGS_UI[key].section === section && SETTINGS_UI[key].control.type !== 'json-only'
  )
}

/** Summary of a complex key for the modal row ("3 profiles", "2 active patterns"). Unexpected value = "—". */
export function describeComplexSetting(kind: ComplexKind, value: unknown): string {
  if (kind === 'columns') return Array.isArray(value) ? t().settings.summary.columns(value.length) : '—'
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '—'
  const entries = Object.entries(value as Record<string, unknown>)
  const summary = t().settings.summary
  switch (kind) {
    case 'patterns':
      return summary.patterns(entries.filter(([, v]) => v === true).length)
    case 'profiles':
      return summary.profiles(entries.length)
    case 'servers':
      return summary.servers(entries.length)
    case 'adapters':
      return summary.adapters(entries.length)
    case 'env':
      return summary.env(entries.length)
  }
}
