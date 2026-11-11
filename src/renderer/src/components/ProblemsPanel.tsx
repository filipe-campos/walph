import { memo, useMemo, useState } from 'react'
import type { Diagnostic } from '@shared/types'
import { useStore } from '../store'
import { buildProblemGroups, formatDiagnosticSource } from '../lib/problems'
import { isItemRow, treeRowProps, useGroupedTree } from './common/useGroupedTree'
import { PanelGroupRow } from './PanelGroupRow'
import { openProblem } from '../lspActions'
import { useT } from '../i18n'

const SEVERITY_ICON: Record<Diagnostic['severity'], string> = {
  error: 'codicon-error',
  warning: 'codicon-warning',
  info: 'codicon-info',
  hint: 'codicon-info'
}

const ProblemRow = memo(function ProblemRow({
  rowKey,
  tabStop,
  item
}: {
  rowKey: string
  tabStop: boolean
  item: Diagnostic
}) {
  const t = useT()
  const source = formatDiagnosticSource(item)
  const { line, character } = item.range.start
  return (
    <div {...treeRowProps(rowKey, tabStop)} className="tree-row problem-item" role="treeitem" title={item.message}>
      <i className={`codicon ${SEVERITY_ICON[item.severity]} problem-icon ${item.severity}`} />
      <span className="tree-label">{item.message.split('\n')[0]}</span>
      {source && <span className="problem-source">{source}</span>}
      <span className="problem-position">{t.lsp.panels.position(line + 1, character + 1)}</span>
    </div>
  )
})

/** "Problems" view: LSP diagnostics grouped by file. Click or Enter opens the file at the range. */
export function ProblemsPanel() {
  const t = useT()
  const diagnostics = useStore((s) => s.diagnostics)
  const root = useStore((s) => s.root)
  const visible = useStore((s) => s.terminalVisible && s.panelView === 'problems')
  // Hidden, it does not regroup on every diagnostic: freezes the diagnostics and updates on appearing.
  const [shown, setShown] = useState(diagnostics)
  if (visible && shown !== diagnostics) setShown(diagnostics)
  const groups = useMemo(() => buildProblemGroups(shown, root), [shown, root])
  const { rows, listProps, tabStop, isOpen } = useGroupedTree({
    groups,
    visible,
    onActivateItem: (group, item: Diagnostic) => openProblem(group.path, item)
  })

  return (
    <div {...listProps} className="problems" tabIndex={-1} role="tree" aria-label={t.lsp.panels.problems}>
      {rows.length === 0 && (
        <div className="empty-line" role="status">
          {t.lsp.panels.noProblems}
        </div>
      )}
      {rows.map((row) =>
        isItemRow(row) ? (
          <ProblemRow key={row.key} rowKey={row.key} tabStop={row.key === tabStop} item={row.item} />
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
