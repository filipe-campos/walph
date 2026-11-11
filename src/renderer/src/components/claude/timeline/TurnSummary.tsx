import { useMemo } from 'react'
import { reviewChangedFile } from '../../../claudeEditorContext'
import type { ClaudeConversation } from '../../../lib/claudeConversation'
import { formatDuration } from '../../../lib/claudeTime'
import { filesChangedLabel, turnSummary, type TurnFile } from '../../../lib/claudeTurnSummary'
import { relativeTo } from '../../../lib/path'
import { useT } from '../../../i18n'
import { useStore } from '../../../store'
import { Button } from '../../common/Button'
import { FileIcon } from '../../common/FileIcon'
import { Icon } from '../../common/Icon'

/** Turn summary row: file, `+N −N` and "Review" (git diff of the file). */
function SummaryRow({ file, root }: { file: TurnFile; root: string | null }) {
  const rel = root ? relativeTo(root, file.path) : file.path
  const name = rel.split(/[\\/]/).pop() ?? rel
  const m = useT().claude.timelineParts
  return (
    <li className="claude-summary-row" data-path={file.path} data-added={file.added} data-removed={file.removed}>
      <FileIcon name={file.path} />
      <span className="claude-summary-name ellipsis" title={rel}>
        {name}
      </span>
      {!file.uncounted && (
        <span
          className="claude-summary-counts"
          title={
            [file.replaceAll ? m.replaceAllNote : '', file.overwrite ? m.overwriteNote : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
        >
          <span className="claude-summary-added">
            <span className="sr-only">{m.linesAdded}</span>+{file.added}
          </span>
          <span className="claude-summary-removed">
            <span className="sr-only">{m.linesRemoved}</span>
            {file.overwrite ? '−?' : `−${file.removed}`}
            {file.replaceAll ? '*' : ''}
          </span>
        </span>
      )}
      <Button size="xs" aria-label={m.reviewFile(rel)} onClick={() => reviewChangedFile(file.path)}>
        {m.review}
      </Button>
    </li>
  )
}

/** End of turn: title + changed files; without files, only the duration ("Took 34s"). */
export function TurnSummary({
  messages,
  durationMs
}: {
  messages: ClaudeConversation['messages']
  durationMs: number | null
}) {
  const root = useStore((s) => s.root)
  const files = useMemo(() => turnSummary(messages), [messages])
  const m = useT().claude.timelineParts
  if (files.length === 0)
    return durationMs !== null && durationMs > 0 ? (
      <div className="claude-turn-time muted" data-turn-time>
        <Icon name="check" />
        <span>{m.tookTime(formatDuration(durationMs))}</span>
      </div>
    ) : null
  return (
    <section className="claude-summary" aria-label={m.turnSummary} data-turn-summary>
      <div className="claude-summary-title">
        <Icon name="check" />
        <span>{filesChangedLabel(files.length)}</span>
        {durationMs !== null && durationMs > 0 && (
          <span className="claude-summary-time muted" title={m.turnDuration}>
            {formatDuration(durationMs)}
          </span>
        )}
      </div>
      <ul className="claude-summary-list">
        {files.map((file) => (
          <SummaryRow key={file.path} file={file} root={root} />
        ))}
      </ul>
    </section>
  )
}
