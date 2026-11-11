import { memo, type MouseEvent, useCallback, useId, useRef, useState } from 'react'
import { findActiveTab } from '../../lib/findActiveTab'
import type { ClaudeImage, ClaudeSlashCommand } from '@shared/types'
import { setConversationMode } from '../../claudeConversationSettings'
import { clearPromptSuggestion, interruptConversation, sendPrompt } from '../../claudePromptActions'
import { getSentHistory, setSentHistory } from '../../claudeDrafts'
import { PromptSegments } from './PromptSegments'
import { useActiveDescendant } from '../common/useActiveDescendant'
import { applyMention } from '../../lib/claudeMentions'
import { modeInfo, nextPermissionMode } from '../../lib/claudeModes'
import {
  HISTORY_IDLE,
  applySlash,
  historyDown,
  historyUp,
  insertAtCaret,
  promptKeyAction,
  pushHistory
} from '../../lib/claudePrompt'
import { basename } from '../../lib/path'
import { Icon } from '../common/Icon'
import { useT } from '../../i18n'
import { useStore } from '../../store'
import { selectConversation } from '../../lib/claudeSelectors'
import { useConversationField } from './useConversation'
import { focusEditor } from '../editor/editorFocus'
import { IconButton } from '../common/IconButton'
import { Toggle } from '../common/Toggle'
import { AttachmentChips } from './AttachmentChips'
import { PromptMenu } from './PromptMenu'
import { SendControls } from './SendControls'
import { useAttachments } from './useAttachments'
import { usePromptMenus } from './usePromptMenus'
import { usePromptText } from './usePromptText'
import { ModeChip, ModelChip } from './PromptChips'

/** Window after sending in which "Stop" ignores clicks (a double click on send does not interrupt the new turn). */
const STOP_GUARD_MS = 300

/**
 * Prompt box of a conversation: Enter sends, Shift+Enter breaks the line, `@` opens the file search, `/` the
 * commands, ↑/↓ recall previous messages, ⇧⇥ toggles the permission mode, Esc interrupts, and it pastes images.
 */
export const PromptBox = memo(function PromptBox({
  conversationId,
  commands,
  suggestion,
  working,
  loading
}: {
  conversationId: string
  commands: ClaudeSlashCommand[]
  /** Next prompt suggestion (ghost text in the empty box; Tab accepts). */
  suggestion: string | null
  working: boolean
  /**
   * Session still starting (or connecting MCP): only changes the helper text; sending stays pending until it is ready.
   */
  loading: boolean
}) {
  const t = useT()
  const m = t.claude.promptBox
  const root = useStore((s) => s.root)
  const mode = useConversationField(conversationId, (c) => c.permissionMode, undefined)
  const allowBypass = useStore((s) => s.settings['claude.allowBypassPermissions'])
  const autoDefault = useStore((s) => s.settings['claude.autoContext'])
  const activeFile = useStore((s) => {
    const tab = findActiveTab(s)
    return tab?.kind === 'file' ? tab.path : null
  })
  const [autoContext, setAutoContext] = useState(autoDefault)
  const { text, caret, ref, nav, textRef, idRef, commit, writeText, setText, setCaret } = usePromptText(conversationId)
  // Repeated Enter while the send has not finished must not send twice.
  const sending = useRef(false)
  const { menu, slashToken, allCommands, segments, menuKey, dismissMenu } = usePromptMenus({
    conversationId,
    commands,
    root,
    text,
    caret
  })

  const focusInput = useCallback(() => ref.current?.focus(), [ref])
  const { chips, dragging, dropZone, onPaste, attach, removeChips } = useAttachments(focusInput)

  const listId = useId()
  const ghostId = useId()
  const hintId = useId()
  // Only in the empty box and without a menu: with text or a popup open the suggestion does not get in the way (nor
  // steal Tab).
  const ghost = suggestion && text === '' && !menu ? suggestion : null
  const menuCount = menu?.items.length ?? 0
  const showEmptyHint = menu?.kind === 'slash' && menuCount > 0 && !menu.hasCustom
  const {
    index,
    activeId,
    onKeyDown: onMenuKeyDown
  } = useActiveDescendant({ count: menuCount, resetKey: menuKey, idOf: (i) => `${listId}-${i}`, wrap: true })

  const accept = (position: number): void => {
    if (!menu) return
    if (menu.kind === 'mention') {
      const cand = menu.items[position]
      if (!cand) return
      const next = applyMention(text, menu.mention, cand.path, cand.isDir)
      setText(next.text, next.caret)
    } else {
      const cmd = menu.items[position]
      // Replaces only the `/xxx` token under the cursor (the rest of the message stays, e.g. `/loop 15m /command`).
      if (cmd && slashToken) {
        const next = applySlash(text, slashToken, cmd)
        setText(next.text, next.caret)
      }
    }
    nav.current = HISTORY_IDLE
    ref.current?.focus()
  }

  // A double click on Send must not land on "Stop" (which takes the same place) and interrupt the just-sent turn.
  const sentAt = useRef(0)
  const stop = (e: MouseEvent): void => {
    // Only the 2nd click of a double click (detail > 1) counts; a single deliberate click is never swallowed.
    if (e.detail > 1 && Date.now() - sentAt.current < STOP_GUARD_MS) return
    interruptConversation(conversationId)
    // The stop button turns into the send one (or disappears): focus returns to the field instead of getting lost.
    ref.current?.focus()
  }

  const submit = (): void => {
    const value = textRef.current
    if ((!value.trim() && chips.length === 0) || sending.current) return
    sending.current = true
    sentAt.current = Date.now()
    const sentImages: ClaudeImage[] = []
    const sentKeys = new Set(chips.map((c) => c.key))
    for (const chip of chips) if (chip.kind === 'image') sentImages.push(chip.image)
    void sendPrompt(
      idRef.current,
      value,
      sentImages,
      autoContext,
      chips.flatMap((c) => (c.kind === 'file' ? [{ path: c.path }] : []))
    )
      .finally(() => {
        sending.current = false
      })
      .then((sent) => {
        // Only clears if the box did not change during the send (the user may already be typing the next one).
        if (!sent || textRef.current !== value) return
        setSentHistory(pushHistory(getSentHistory(), value))
        nav.current = HISTORY_IDLE
        writeText('')
        // Only the sent chips: others may have been attached during the send.
        removeChips(sentKeys)
      })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    const composing = e.nativeEvent.isComposing
    if (!composing && menu && menu.items.length > 0 && onMenuKeyDown(e)) return
    const key = {
      key: e.key,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      isComposing: composing
    }
    const action = promptKeyAction(key, {
      text: textRef.current,
      selectionStart: el.selectionStart,
      selectionEnd: el.selectionEnd,
      commands: allCommands,
      menu: menu
        ? {
            kind: menu.kind,
            hasItems: menu.items.length > 0,
            dismissible: menu.kind === 'mention' || menu.items.length > 0
          }
        : null,
      slashToken,
      marked: menu?.kind === 'slash' ? menu.items[index] : undefined,
      hasGhost: !!ghost,
      working
    })
    if (action.type === 'none') return
    if (action.type === 'history') {
      const { direction } = action
      const result =
        direction === 'up'
          ? historyUp(getSentHistory(), nav.current, textRef.current)
          : historyDown(getSentHistory(), nav.current)
      if (!result) return
      e.preventDefault()
      nav.current = result.nav
      // On the first line ↑ takes the cursor to the start; at the end ↓ to the end, like in a terminal.
      setText(result.text, direction === 'up' ? 0 : result.text.length)
      return
    }
    e.preventDefault()
    switch (action.type) {
      case 'submit':
        submit()
        break
      case 'acceptMenu':
        accept(index)
        break
      case 'acceptSuggestion':
        clearPromptSuggestion(conversationId)
        nav.current = HISTORY_IDLE
        if (ghost) setText(ghost)
        break
      case 'dismissMenu':
        dismissMenu()
        break
      case 'interrupt':
        interruptConversation(conversationId)
        break
      case 'focusEditor':
        focusEditor()
        break
      case 'cycleMode': {
        const conv = selectConversation(conversationId)(useStore.getState())
        if (conv) setConversationMode(conversationId, nextPermissionMode(conv.permissionMode, 1, allowBypass))
        break
      }
    }
  }

  /**
   * The `/` button: inserts a slash at the cursor (the menu opens from the text); a lone `/` in the field clears it
   * again.
   */
  const toggleSlash = (): void => {
    const current = textRef.current
    if (current === '/') setText('')
    else {
      const el = ref.current
      const next = insertAtCaret(current, '/', el?.selectionStart, el?.selectionEnd)
      setText(next.text, next.caret)
    }
    ref.current?.focus()
  }

  const hasContent = !!text.trim() || chips.length > 0
  const contextLabel = activeFile ? basename(activeFile) : m.noActiveFile

  return (
    // Neon line running along the border while Claude works on this conversation (design system: live = AI working).
    <div
      className={`claude-prompt${working ? ' neon-live' : ''}${dragging ? ' dragging' : ''}`}
      data-testid="claude-prompt"
      data-dragging={dragging || undefined}
      data-mode={mode}
      {...dropZone}
    >
      {menu && <PromptMenu menu={menu} listId={listId} hintId={hintId} index={index} onAccept={accept} />}
      <AttachmentChips
        chips={chips}
        onRemove={(key) => {
          removeChips(new Set([key]))
          ref.current?.focus()
        }}
      />
      <div className="claude-input-wrap">
        {/* The layer gives the height and the (transparent) textarea covers it: a single scroller
            (`.claude-input-wrap`) moves both. */}
        <div className="claude-input-body">
          <div className="claude-input-mirror" aria-hidden="true">
            <PromptSegments segments={segments} />
            {/* An empty line at the end (text ending in \n) would collapse in the layer and misalign from the
                textarea. */}
            {text.endsWith('\n') && '\u200b'}
          </div>
          <textarea
            ref={ref}
            className="claude-input"
            rows={1}
            value={text}
            aria-label={m.inputLabel}
            role="combobox"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-expanded={!!menu && menu.items.length > 0}
            aria-controls={menu && menu.items.length > 0 ? listId : undefined}
            aria-activedescendant={activeId}
            aria-describedby={ghost ? ghostId : showEmptyHint ? hintId : undefined}
            aria-busy={loading || undefined}
            placeholder={ghost ? '' : loading ? m.placeholderLoading : working ? m.placeholderWorking : m.placeholder}
            data-testid="claude-input"
            spellCheck={false}
            onChange={(e) => {
              nav.current = HISTORY_IDLE
              if (suggestion) clearPromptSuggestion(conversationId)
              commit(e.target.value, e.target.selectionStart)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
        </div>
        {ghost && (
          <div id={ghostId} className="claude-input-ghost" data-testid="claude-suggestion">
            <span className="sr-only">{m.suggestionHint}</span>
            <span className="claude-input-ghost-text">{ghost}</span>
            <kbd className="claude-input-ghost-key" aria-hidden>
              Tab
            </kbd>
          </div>
        )}
      </div>
      <div className="claude-prompt-actions">
        <IconButton glyph="clip" label={m.attach} onClick={attach} className="claude-attach" />
        <IconButton
          className="claude-slash-button"
          title={m.commandsTitle}
          label={m.commands}
          pressed={text === '/'}
          data-testid="claude-slash-button"
          onClick={toggleSlash}
          glyph="slash"
        />
        <Toggle
          active={autoContext}
          label={autoContext ? contextLabel : m.noContext}
          title={autoContext ? m.autoContextOn(contextLabel) : m.autoContextOff}
          icon={autoContext ? 'codicon-eye' : 'codicon-eye-closed'}
          onClick={() => setAutoContext(!autoContext)}
        >
          <span className="claude-context-label">{autoContext ? contextLabel : m.noContext}</span>
        </Toggle>
        <span className="claude-prompt-spacer" />
        <ModeChip conversationId={conversationId} returnFocus={focusInput} />
        <ModelChip conversationId={conversationId} returnFocus={focusInput} />
        <SendControls
          working={working}
          hasContent={hasContent}
          onSend={() => {
            submit()
            // The button may turn into "Stop" (another element): focus stays on the field.
            ref.current?.focus()
          }}
          onStop={stop}
        />
      </div>
      {mode === 'plan' && (
        <p className="claude-mode-note" role="status">
          <Icon name={modeInfo(mode).icon} plain />
          {modeInfo(mode).note}
        </p>
      )}
    </div>
  )
})
