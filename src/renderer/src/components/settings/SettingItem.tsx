import { useMemo } from 'react'
import {
  DEFAULT_SETTINGS,
  USER_ONLY_SETTINGS,
  sanitizeSettings,
  type SettingKey,
  type SettingsLayer
} from '@shared/settings'
import {
  SETTINGS_UI,
  describeComplexSetting,
  settingDescription,
  settingLabel,
  type SettingMeta
} from '@shared/settingsUi'
import type { Messages } from '@shared/i18n'
import { useStore } from '../../store'
import { attempt } from '../../attempt'
import { THEMES } from '../../themes'
import { IconButton } from '../common/IconButton'
import { Select } from '../common/Select'
import { SettingRow } from '../common/SettingRow'
import { Switch } from '../common/Switch'
import { DraftField } from './DraftField'
import { closeSettingsModal, openSettingsFile, resetSettingValue, setSettingValue } from '../../settingsActions'
import { useT } from '../../i18n'
import { Button } from '../common/Button'

const userOnlyReason = (key: SettingKey, t: Messages): string =>
  key === 'claude.initialPermissionMode' || key === 'claude.allowBypassPermissions'
    ? t.settings.modal.userOnlyPermissions
    : t.settings.modal.userOnlyExecutable

/**
 * Value the scope shows: User = default ← user layer; Workspace = the effective one. Returns stable references
 * (no `mergeSettings` inside the selector, which would create a new object on every read).
 */
function useScopedValue(scope: SettingsLayer, key: SettingKey): unknown {
  const layerValue = useStore((s) => s.settingsLayers.user[key])
  const effective = useStore((s) => s.settings[key])
  return useMemo(() => {
    if (scope === 'workspace') return effective
    // `files.exclude`/`search.exclude`/`files.watcherExclude` merge by glob with the default, like main.
    if (key === 'files.exclude' || key === 'search.exclude' || key === 'files.watcherExclude')
      return { ...DEFAULT_SETTINGS[key], ...(layerValue as Record<string, boolean> | undefined) }
    return layerValue ?? DEFAULT_SETTINGS[key]
  }, [scope, key, layerValue, effective])
}

/** Schema error message ("must be an integer between 6 and 72") or `null` if the value is accepted. */
function schemaError(key: SettingKey, value: unknown, scope: SettingsLayer): string | null {
  const warning = sanitizeSettings({ [key]: value }, scope).warnings[0]
  if (!warning) return null
  const text = warning.replace(/^"[^"]+"\s*/, '')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

function SelectControl({ settingKey, meta, scope, disabled }: ItemProps & { meta: SettingMeta; disabled: boolean }) {
  const t = useT()
  const control = meta.control
  const value = String(useScopedValue(scope, settingKey))
  const profiles = useScopedValue(scope, 'terminal.profiles') as Record<string, unknown>
  const requiredKey =
    control.type === 'select' && typeof control.options !== 'string'
      ? control.options.find((o) => o.requires)?.requires
      : undefined
  const requiredOn = useScopedValue(scope, requiredKey ?? settingKey) === true

  const options = useMemo((): { value: string; label: string }[] => {
    if (control.type !== 'select') return []
    let list: { value: string; label: string }[]
    if (control.options === 'themes') list = THEMES.map((theme) => ({ value: theme.name, label: theme.name }))
    else if (control.options === 'profiles')
      list = [
        { value: '', label: t.settings.modal.defaultShell },
        ...Object.keys(profiles).map((name) => ({ value: name, label: name }))
      ]
    else
      list = control.options
        .filter((o) => !o.requires || requiredOn || o.value === value)
        .map((o) => ({ value: o.value, label: o.label() }))
    // A stored value outside the list (removed theme, deleted profile) stays visible instead of disappearing.
    return list.some((o) => o.value === value)
      ? list
      : [...list, { value, label: value === '' ? t.settings.modal.defaultValue : value }]
  }, [control, profiles, requiredOn, value, t])

  return (
    <Select
      value={value}
      options={options}
      label={settingLabel(settingKey)}
      disabled={disabled}
      testId={`setting-${settingKey}`}
      onChange={(next) => void setSettingValue(scope, settingKey, next as never)}
    />
  )
}

interface ItemProps {
  settingKey: SettingKey
  scope: SettingsLayer
}

/**
 * The restore button disappears with the new snapshot: focus first goes to the row control (otherwise it falls to
 * `body`).
 */
function focusRowControl(button: HTMLElement): void {
  const target = button
    .closest('.setting-row')
    ?.querySelector<HTMLElement>('.setting-control :is(input, button, [tabindex]):not(:disabled):not([data-action])')
  if (target && target !== button) target.focus()
}

/** A row of the modal: picks the control by metadata and applies the scope rules (user only, overridden…). */
export function SettingItem({ settingKey, scope }: ItemProps) {
  const t = useT()
  const meta = SETTINGS_UI[settingKey]
  const label = settingLabel(settingKey)
  const value = useScopedValue(scope, settingKey)
  const inUser = useStore((s) => Object.hasOwn(s.settingsLayers.user, settingKey))
  const inWorkspace = useStore((s) => Object.hasOwn(s.settingsLayers.workspace, settingKey))
  const dep = meta.dependsOn
  const depValue = useScopedValue(scope, dep?.key ?? settingKey)

  const userOnly = USER_ONLY_SETTINGS.includes(settingKey)
  const lockedByScope = scope === 'workspace' && userOnly
  const lockedByDep = !!dep && depValue !== dep.equals
  const disabled = lockedByScope || lockedByDep

  let note: React.ReactNode = null
  if (lockedByScope) note = userOnlyReason(settingKey, t)
  else if (lockedByDep) note = dep.note()
  else if (scope === 'workspace' && inWorkspace)
    note = (
      <>
        <span className="setting-badge" data-testid="workspace-override">
          {t.settings.modal.definedInWorkspace}
        </span>
        <button
          type="button"
          className="setting-link"
          data-action="reset-workspace"
          onClick={(e) => {
            focusRowControl(e.currentTarget)
            void resetSettingValue('workspace', settingKey)
          }}
        >
          {t.settings.modal.restore}
        </button>
      </>
    )
  else if (scope === 'user' && inWorkspace && !userOnly)
    note = <span className="setting-badge muted-badge">{t.settings.modal.workspaceOverrides}</span>

  const actions =
    scope === 'user' && inUser && !lockedByScope ? (
      <IconButton
        icon="codicon-discard"
        label={t.settings.modal.restoreDefault}
        onClick={(e) => {
          focusRowControl(e.currentTarget)
          void resetSettingValue('user', settingKey)
        }}
      />
    ) : undefined

  const control = meta.control
  let body: React.ReactNode = null
  switch (control.type) {
    case 'switch':
      body = (
        <Switch
          checked={value === true}
          label={label}
          disabled={disabled}
          testId={`setting-${settingKey}`}
          onChange={(next) => void setSettingValue(scope, settingKey, next as never)}
        />
      )
      break
    case 'select':
      body = <SelectControl settingKey={settingKey} scope={scope} meta={meta} disabled={disabled} />
      break
    case 'number':
      body = (
        <DraftField
          numeric
          normalize={(text) => String(Number(text))}
          value={String(value)}
          label={label}
          unit={control.unit}
          disabled={disabled}
          testId={`setting-${settingKey}`}
          validate={(text) => schemaError(settingKey, text.trim() === '' ? Number.NaN : Number(text), scope)}
          onCommit={(text) => setSettingValue(scope, settingKey, Number(text) as never)}
        />
      )
      break
    case 'text':
      body = (
        <DraftField
          value={String(value ?? '')}
          label={label}
          monospace={control.monospace}
          placeholder={control.placeholder?.()}
          disabled={disabled}
          testId={`setting-${settingKey}`}
          validate={(text) => schemaError(settingKey, text, scope)}
          onCommit={(text) => setSettingValue(scope, settingKey, text as never)}
        />
      )
      break
    case 'complex':
      body = (
        <>
          <span className="setting-summary" data-testid={`setting-${settingKey}`}>
            {describeComplexSetting(control.kind, value)}
          </span>
          <Button
            type="button"
            data-action="edit-json"
            disabled={disabled}
            onClick={() => {
              closeSettingsModal()
              void attempt(() => openSettingsFile(scope))
            }}
          >
            {t.settings.modal.editJson}
          </Button>
        </>
      )
      break
    case 'json-only':
      return null
  }

  return (
    <SettingRow
      settingKey={settingKey}
      label={label}
      description={settingDescription(settingKey)}
      note={note}
      actions={actions}
      disabled={disabled}
    >
      {body}
    </SettingRow>
  )
}
