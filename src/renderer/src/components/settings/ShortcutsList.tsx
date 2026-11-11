import { defaultKeybinding } from '@shared/commands'
import { useStore } from '../../store'
import { attempt } from '../../attempt'
import { listAllCommands } from '../../commands/registry'
import { formatKeybinding } from '../../lib/keybinding'
import { closeSettingsModal, openSettingsFile } from '../../settingsActions'
import { useT } from '../../i18n'
import { Button } from '../common/Button'

/** Read-only list of the effective shortcuts (default ← keybindings.json) grouped by category. */
export function ShortcutsList() {
  const t = useT()
  const keybindings = useStore((s) => s.keybindings)

  // Built on every render: command titles and categories follow the current language.
  const platform = window.api.platform
  const byCategory = new Map<string, { id: string; title: string; keys: string[] }[]>()
  for (const command of listAllCommands()) {
    const accelerators = keybindings
      ? (keybindings[command.id] ?? [])
      : [defaultKeybinding(command.id, platform)].filter((k): k is string => !!k)
    if (accelerators.length === 0) continue
    const rows = byCategory.get(command.category) ?? []
    rows.push({ id: command.id, title: command.title, keys: accelerators.map((a) => formatKeybinding(a, platform)) })
    byCategory.set(command.category, rows)
  }
  const groups = [...byCategory.entries()]

  return (
    <div className="shortcuts" data-testid="settings-shortcuts">
      <div className="shortcuts-bar">
        <p className="shortcuts-intro">{t.settings.modal.shortcutsIntro}</p>
        <Button
          type="button"
          data-action="edit-keybindings"
          onClick={() => {
            closeSettingsModal()
            void attempt(() => openSettingsFile('keybindings'))
          }}
        >
          {t.settings.modal.editKeybindings}
        </Button>
      </div>
      {groups.map(([category, rows]) => (
        <section key={category} className="shortcuts-group" aria-label={category}>
          <h3 className="shortcuts-category">{category}</h3>
          <ul className="shortcuts-list">
            {rows.map((row) => (
              <li key={row.id} className="shortcut-row" data-command={row.id}>
                <span className="shortcut-title">{row.title}</span>
                <span className="shortcut-keys">
                  {row.keys.map((key) => (
                    <kbd key={key} className="shortcut-key">
                      {key}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
