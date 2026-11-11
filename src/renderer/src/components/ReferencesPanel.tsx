import { memo, useMemo } from 'react'
import { defaultKeybinding } from '@shared/commands'
import { useStore } from '../store'
import { formatKeybinding } from '../lib/keybinding'
import { jumpToItem } from '../lspNavigationActions'
import { buildReferenceGroups, type ReferenceItem } from '../lib/lspReferences'
import { isItemRow, treeRowProps, useGroupedTree } from './common/useGroupedTree'
import { PanelGroupRow } from './PanelGroupRow'
import { useT } from '../i18n'

const ReferenceRow = memo(function ReferenceRow({
  rowKey,
  tabStop,
  item
}: {
  rowKey: string
  tabStop: boolean
  item: ReferenceItem
}) {
  const t = useT()
  return (
    <div {...treeRowProps(rowKey, tabStop)} className="tree-row problem-item reference-item" role="treeitem">
      <span className="tree-label reference-preview">
        {item.preview.slice(0, item.matchFrom)}
        <mark>{item.preview.slice(item.matchFrom, item.matchTo)}</mark>
        {item.preview.slice(item.matchTo)}
      </span>
      <span className="problem-position">{t.lsp.panels.position(item.line, item.column + 1)}</span>
    </div>
  )
})

/** "References" view: locations returned by the server (references, multiple definitions) grouped by file. */
export function ReferencesPanel() {
  const t = useT()
  const references = useStore((s) => s.references)
  const root = useStore((s) => s.root)
  const keybinding = useStore((s) =>
    s.keybindings
      ? s.keybindings['editor.goToReferences']?.[0]
      : defaultKeybinding('editor.goToReferences', window.api.platform)
  )
  const visible = useStore((s) => s.terminalVisible && s.panelView === 'references')
  const groups = useMemo(() => buildReferenceGroups(references?.items ?? [], root), [references, root])
  // New list (or view shown): focus goes to it, to navigate with the arrows right away.
  const { rows, listProps, tabStop, isOpen } = useGroupedTree({
    groups,
    visible,
    focusToken: references,
    onActivateItem: (_group, item: ReferenceItem) => jumpToItem(item)
  })

  return (
    <div {...listProps} className="problems references" tabIndex={-1} role="tree" aria-label={t.lsp.panels.references}>
      {references && (
        <div className="references-title" title={references.title}>
          {references.title}
        </div>
      )}
      {rows.length === 0 && (
        <div className="empty-line" role="status">
          {keybinding
            ? t.lsp.panels.noReferencesWithKey(formatKeybinding(keybinding, window.api.platform))
            : t.lsp.panels.noReferences}
        </div>
      )}
      {rows.map((row) =>
        isItemRow(row) ? (
          <ReferenceRow key={row.key} rowKey={row.key} tabStop={row.key === tabStop} item={row.item} />
        ) : (
          <PanelGroupRow
            key={row.key}
            rowKey={row.key}
            tabStop={row.key === tabStop}
            group={row.group}
            open={isOpen(row.group.path)}
          />
        )
      )}
    </div>
  )
}
