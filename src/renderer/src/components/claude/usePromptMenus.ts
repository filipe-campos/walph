import type { ClaudeSlashCommand } from '@shared/types'
import { useMemo, useState } from 'react'
import { loadSlashCommands } from '../../claudePromptActions'
import { loadProjectFiles } from '../../projectFiles'
import { useT } from '../../i18n'
import { activeMention, mentionCandidates } from '../../lib/claudeMentions'
import {
  activeSlash,
  filterSlash,
  groupSlash,
  promptSegments,
  slashMenuApplies,
  withLocalCommands
} from '../../lib/claudePrompt'
import { useAsync } from '../common/useAsync'
import type { Menu } from './PromptMenu'

const MENU_LIMIT = 8
const SLASH_LIMIT = 50

/**
 * `@` (files) and `/` (commands) menus of the prompt box: what is under the cursor, the lists and the `Menu` to show.
 */
export function usePromptMenus({
  conversationId,
  commands,
  root,
  text,
  caret
}: {
  conversationId: string
  commands: ClaudeSlashCommand[]
  root: string | null
  text: string
  caret: number
}) {
  const t = useT()
  // Esc closes the menu until the text changes.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  const mention = useMemo(() => activeMention(text, caret), [text, caret])
  const rawSlash = useMemo(() => (mention ? null : activeSlash(text, caret)), [mention, text, caret])
  const mentionOpen = mention !== null
  const slashOpen = rawSlash !== null

  // The `/` menu list is reread by main on every open (new command files show up without a restart).
  const fetched = useAsync(() => loadSlashCommands(conversationId), [slashOpen, conversationId, commands], {
    enabled: slashOpen,
    keepPrevious: true
  }).value
  const localDescriptions = t.claude.prompt.localCommands
  const allCommands = useMemo(
    () => withLocalCommands(fetched ?? commands, localDescriptions),
    [fetched, commands, localDescriptions]
  )
  const hasCustom = useMemo(() => allCommands.some((c) => c.scope !== 'builtin'), [allCommands])
  const segments = useMemo(() => promptSegments(text, allCommands), [text, allCommands])
  // In the middle of the text it only counts if the token looks like a command (paths like `/tmp` stay as text).
  const slashToken = rawSlash && slashMenuApplies(rawSlash, allCommands) ? rawSlash : null
  const slash = slashToken?.query ?? null

  // The file list is only fetched when the `@` popup opens (main caches it).
  const files = useAsync(() => loadProjectFiles(root!), [mentionOpen, root], {
    enabled: mentionOpen && !!root,
    keepPrevious: true
  }).value

  const menu: Menu | null = useMemo(() => {
    if (dismissedFor === text) return null
    if (mention && files)
      return {
        kind: 'mention',
        mention,
        items: mentionCandidates(files.files, files.folders, mention.query, MENU_LIMIT)
      }
    if (slash !== null) {
      const groups = groupSlash(filterSlash(allCommands, slash, Infinity), SLASH_LIMIT)
      return {
        kind: 'slash',
        items: groups.flatMap((g) => g.items),
        groups,
        hasCustom
      }
    }
    return null
  }, [dismissedFor, text, mention, files, slash, allCommands, hasCustom])

  return {
    menu,
    slashToken,
    allCommands,
    segments,
    menuKey: mention?.query ?? slash ?? '',
    dismissMenu: () => setDismissedFor(text)
  }
}
