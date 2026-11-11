import type { ClaudeSlashCommand } from '@shared/types'
import type { activeMention, MentionCandidate } from '../../lib/claudeMentions'
import type { SlashGroup } from '../../lib/claudePrompt'
import { useT } from '../../i18n'
import { basename, parentOf } from '../../lib/path'
import { splitTemplate } from '../../lib/templateSlots'
import { FileIcon } from '../common/FileIcon'

export type Menu =
  | { kind: 'mention'; mention: NonNullable<ReturnType<typeof activeMention>>; items: MentionCandidate[] }
  | { kind: 'slash'; items: ClaudeSlashCommand[]; groups: SlashGroup[]; hasCustom: boolean }

/** Popup of `@` (files) and `/` (commands, by scope) over the prompt box; focus stays in the textarea. */
export function PromptMenu({
  menu,
  listId,
  hintId,
  index,
  onAccept
}: {
  menu: Menu
  listId: string
  hintId: string
  index: number
  onAccept: (position: number) => void
}) {
  const t = useT()
  const m = t.claude.promptMenu
  if (menu.items.length === 0) return null
  const slots: Record<string, string> = { file: m.emptyFile, dir: '~/.claude/commands' }
  return (
    <div className="claude-menu claude-menu-popup">
      <ul
        id={listId}
        className="claude-menu-scroll"
        role="listbox"
        aria-label={menu.kind === 'mention' ? m.files : m.commands}
        data-testid={menu.kind === 'mention' ? 'claude-mention-menu' : 'claude-slash-menu'}
      >
        {menu.kind === 'mention'
          ? menu.items.map((cand, i) => (
              <li
                key={cand.path}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === index}
                className={`claude-menu-item${i === index ? ' selected' : ''}`}
                // mousedown (not click): the click must not take focus away from the textarea before accepting.
                onMouseDown={(e) => {
                  e.preventDefault()
                  onAccept(i)
                }}
              >
                <FileIcon name={cand.path} folder={cand.isDir} />
                <span className="ellipsis">{basename(cand.path)}</span>
                <span className="claude-menu-dim ellipsis">{parentOf(cand.path)}</span>
              </li>
            ))
          : menu.groups.map((group, g) => {
              const before = menu.groups.slice(0, g).reduce((n, x) => n + x.items.length, 0)
              return (
                <li key={group.scope} role="presentation" data-scope={group.scope}>
                  <div className="claude-menu-group" aria-hidden="true">
                    {group.label}
                  </div>
                  <ul role="group" aria-label={group.label} className="claude-menu-list">
                    {group.items.map((cmd, j) => {
                      const i = before + j
                      return (
                        <li
                          key={cmd.name}
                          id={`${listId}-${i}`}
                          role="option"
                          aria-selected={i === index}
                          data-command={cmd.name}
                          className={`claude-menu-item${i === index ? ' selected' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            onAccept(i)
                          }}
                        >
                          <span className="claude-menu-name">/{cmd.name}</span>
                          {cmd.argumentHint && <span className="claude-menu-hint">{cmd.argumentHint}</span>}
                          <span className="claude-menu-dim ellipsis">{cmd.description}</span>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
      </ul>
      {menu.kind === 'slash' && !menu.hasCustom && (
        // Focus stays in the textarea: the click on the hint must not take it away.
        <div
          id={hintId}
          className="claude-menu-empty"
          data-testid="claude-slash-empty"
          onMouseDown={(e) => e.preventDefault()}
        >
          {splitTemplate(m.emptyHint).map((part, i) =>
            typeof part === 'string' ? part : <code key={i}>{slots[part.slot]}</code>
          )}
        </div>
      )}
    </div>
  )
}
