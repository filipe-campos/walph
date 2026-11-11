import { useStore } from '../store'
import type { SidebarView } from '@shared/types'
import { toggleContainers } from '../dockerActions'
import { countProblems } from '../lib/dockerContainers'
import { executeCommand } from '../commands/registry'
import { capCount } from '../lib/capCount'
import { useShortcutLabel } from './common/useShortcutLabel'
import { Icon, type IconName } from './common/Icon'
import type { CommandId } from '@shared/commands'
import { toggleSidebar } from '../layoutActions'
import { useT } from '../i18n'

const ITEMS: { view: SidebarView; icon: IconName; command: CommandId }[] = [
  { view: 'explorer', icon: 'files', command: 'view.explorer' },
  { view: 'search', icon: 'search', command: 'view.search' },
  { view: 'git', icon: 'branch', command: 'view.git' },
  { view: 'debug', icon: 'bug', command: 'view.debug' }
]

/**
 * Tooltip with the effective shortcut (the `keybindings.json` one wins over the default); the accessible name omits it.
 */
function useTitle(label: string, command: CommandId): string {
  const t = useT()
  const shortcut = useShortcutLabel(command)
  return shortcut ? t.common.withShortcut(label, shortcut) : label
}

function ViewTab({ item, active, collapsed }: { item: (typeof ITEMS)[number]; active: boolean; collapsed: boolean }) {
  const t = useT()
  const label = t.app.activityBar[item.view]
  const title = useTitle(label, item.command)
  const changes = useStore((s) => (item.view === 'git' ? (s.git?.files.length ?? 0) : 0))
  return (
    <button
      className={`activity-item${active ? ' active' : ''}${active && collapsed ? ' collapsed' : ''}`}
      title={title}
      aria-label={label}
      aria-pressed={active && !collapsed}
      onClick={() => toggleSidebar(item.view)}
    >
      <Icon name={item.icon} />
      {changes > 0 && <span className="activity-badge">{capCount(changes)}</span>}
    </button>
  )
}

/** Containers: a view that takes over the screen. The badge counts containers with problems (number + aria-label). */
function ContainersTab({ active }: { active: boolean }) {
  const t = useT()
  const problems = useStore((s) => countProblems(s.docker.list))
  const label =
    problems > 0
      ? t.app.activityBar.containersProblems(t.app.activityBar.containers, problems)
      : t.app.activityBar.containers
  const title = useTitle(label, 'view.containers')
  return (
    <button
      className={`activity-item${active ? ' active' : ''}`}
      data-testid="activity-containers"
      title={title}
      aria-label={label}
      aria-pressed={active}
      onClick={toggleContainers}
    >
      <Icon name="box" />
      {problems > 0 && (
        <span className="activity-badge danger" data-testid="activity-containers-badge" aria-hidden="true">
          {capCount(problems)}
        </span>
      )}
    </button>
  )
}

/** Vertical icon column (44px, `bg-000`): views at the top, Settings at the bottom. */
export function ActivityBar() {
  const view = useStore((s) => s.view)
  const visible = useStore((s) => s.sidebarVisible)
  const onContainers = useStore((s) => s.screen === 'containers')
  const t = useT()
  const settingsTitle = useTitle(t.common.settings, 'workbench.openSettings')

  return (
    <nav className="activity-bar" aria-label={t.app.activityBar.views}>
      {ITEMS.map((item) => (
        <ViewTab key={item.view} item={item} active={!onContainers && view === item.view} collapsed={!visible} />
      ))}
      <ContainersTab active={onContainers} />
      <span className="activity-spacer" />
      <button
        className="activity-item settings"
        title={settingsTitle}
        aria-label={t.common.settings}
        onClick={() => void executeCommand('workbench.openSettings')}
      >
        <Icon name="gear" />
      </button>
    </nav>
  )
}
