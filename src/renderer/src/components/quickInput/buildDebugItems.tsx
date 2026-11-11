// Debug configuration picker: those of launch.json (or the default ones) and open/create launch.json.
import { t } from '@shared/i18n'
import type { DebugConfigList } from '@shared/types'
import { rankByLabel } from '../../lib/rankByLabel'
import { openLaunchJson, selectDebugConfig } from '../../debugActions'
import { highlight } from './highlight'
import type { QuickItem, QuickList } from './buildItems'

export function buildDebugConfigList(
  text: string,
  configs: DebugConfigList | null,
  selected: string | null
): QuickList {
  const m = t().debugUi.picker
  const list = configs?.configurations ?? []
  const current = list.find((c) => c.name === selected)?.name ?? list[0]?.name
  const items: QuickItem[] = rankByLabel(list, text, (c) => c.name, { sort: true }).map(({ entry, matches }) => ({
    key: `config:${entry.name}`,
    icon: 'codicon-debug-alt',
    label: highlight(entry.name, new Set(matches), 0),
    tag: entry.name === current ? t().quickInput.current : entry.builtin ? m.builtin : entry.type,
    run: () => selectDebugConfig(entry.name)
  }))
  items.push({
    key: '__launchJson',
    icon: 'codicon-gear',
    label: configs?.exists ? m.open : m.create,
    run: () => void openLaunchJson()
  })
  return { items, message: m.none }
}
