import { useId, useState } from 'react'
import type { SettingsLayer } from '@shared/settings'
import { SETTING_SECTIONS, sectionLabel, settingsOfSection, type SettingSection } from '@shared/settingsUi'
import { useStore } from '../../store'
import { Modal } from '../common/Modal'
import { Segmented } from '../common/Segmented'
import { useRovingFocus } from '../common/useRovingFocus'
import { SettingItem } from './SettingItem'
import { ShortcutsList } from './ShortcutsList'
import { closeSettingsModal } from '../../settingsActions'
import { useT } from '../../i18n'

type SectionId = SettingSection | 'shortcuts'

const SECTIONS: readonly SectionId[] = [...SETTING_SECTIONS, 'shortcuts']

function ScopeBar({
  scope,
  onChange,
  hasFolder
}: {
  scope: SettingsLayer
  onChange: (scope: SettingsLayer) => void
  hasFolder: boolean
}) {
  const t = useT()
  const scopes: readonly { id: SettingsLayer; label: string; hint: string }[] = [
    { id: 'user', label: t.common.user, hint: t.settings.modal.userHint },
    { id: 'workspace', label: t.common.workspace, hint: t.settings.modal.workspaceHint }
  ]
  const hint = scopes.find((s) => s.id === scope)?.hint
  const options = scopes.map((item) =>
    item.id === 'workspace' && !hasFolder
      ? { ...item, disabled: true, title: t.settings.modal.workspaceNeedsFolder }
      : item
  )
  return (
    <div className="settings-scope">
      <Segmented
        label={t.settings.modal.scopeAria}
        value={scope}
        options={options}
        onChange={onChange}
        itemData={(o) => ({ 'data-scope': o.id })}
      />
      <span className="settings-scope-hint">{hint}</span>
    </div>
  )
}

function SettingsDialog() {
  const t = useT()
  const [section, setSection] = useState<SectionId>('editor')
  const [scopeChoice, setScopeChoice] = useState<SettingsLayer>('user')
  const hasFolder = useStore((s) => !!s.root)
  // Without a folder (or when closing it with the modal open) only the user scope exists.
  const scope: SettingsLayer = hasFolder ? scopeChoice : 'user'
  const idBase = useId()
  const tabId = (id: SectionId): string => `${idBase}-tab-${id}`
  const panelId = `${idBase}-panel`
  const onNavKeyDown = useRovingFocus({ orientation: 'vertical', activate: true })

  return (
    <Modal title={t.common.settings} onClose={closeSettingsModal} className="settings-modal" testId="settings-modal">
      <div className="settings-layout">
        <nav
          className="settings-nav"
          role="tablist"
          aria-orientation="vertical"
          aria-label={t.settings.modal.sectionsAria}
          onKeyDown={onNavKeyDown}
        >
          {SECTIONS.map((id) => (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={section === id}
              aria-controls={panelId}
              tabIndex={section === id ? 0 : -1}
              className={`settings-nav-item${section === id ? ' active' : ''}`}
              data-section={id}
              data-autofocus={section === id ? '' : undefined}
              onClick={() => setSection(id)}
            >
              {sectionLabel(id)}
            </button>
          ))}
        </nav>
        <section
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(section)}
          className="settings-content"
          data-section-panel={section}
          // Switching sections goes back to the top of the list.
          key={section}
        >
          {section === 'shortcuts' ? (
            <ShortcutsList />
          ) : (
            <>
              <ScopeBar scope={scope} onChange={setScopeChoice} hasFolder={hasFolder} />
              <div className="settings-list">
                {settingsOfSection(section).map((key) => (
                  <SettingItem key={key} settingKey={key} scope={scope} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}

/** Settings modal (⌘,): mounted only while open, so the local state (section, drafts) resets on every open. */
export function SettingsModal() {
  const open = useStore((s) => s.overlay?.kind === 'settings')
  return open ? <SettingsDialog /> : null
}
