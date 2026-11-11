import { memo } from 'react'
import { useStore } from '../../store'
import { resizeClaude } from '../../layoutActions'
import { ClaudePanel } from '../claude/ClaudePanel'
import { Resizer } from '../Resizer'

const Panel = memo(ClaudePanel)

/** Secondary sidebar and its handle: always mounted (only hidden) to keep the conversations and drafts. */
export function ClaudeSlot() {
  const claudeVisible = useStore((s) => s.claudeVisible)
  const claudeWidth = useStore((s) => s.claudeWidth)
  return (
    <>
      {claudeVisible && <Resizer axis="x" onDrag={resizeClaude} />}
      <aside className="claude-sidebar" hidden={!claudeVisible} style={{ width: claudeWidth }}>
        <Panel />
      </aside>
    </>
  )
}
