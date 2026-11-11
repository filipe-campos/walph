import type { ReactNode } from 'react'

/**
 * Row of a setting: label + description on the left, control on the right. `settingKey` goes in `data-setting-key`
 * (test hook). `note` sits under the description (indicators, explanations); `disabled` dims the whole row.
 */
export function SettingRow({
  settingKey,
  label,
  description,
  note,
  actions,
  disabled,
  children
}: {
  settingKey: string
  label: string
  description: string
  note?: ReactNode
  /** Buttons beside the control (e.g. restore). */
  actions?: ReactNode
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <div className={`setting-row${disabled ? ' disabled' : ''}`} data-setting-key={settingKey}>
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        <div className="setting-description">{description}</div>
        {note && <div className="setting-note">{note}</div>}
      </div>
      <div className="setting-control">
        {children}
        <span className="setting-action">{actions}</span>
      </div>
    </div>
  )
}
