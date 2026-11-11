import type { ClaudeSlashCommand } from '@shared/types'
import { useMemo, useState } from 'react'
import { openPathFromClaude } from '../../../claudeEditorContext'
import { focusPrompt } from '../../../claudePromptBridge'
import { rewindConversation } from '../../../claudeRewind'
import { contextChipLabel } from '../../../lib/claudeContext'
import { promptSegments } from '../../../lib/claudePrompt'
import { imageUrl, type TimelineItem, type UserImage } from '../../../lib/claudeTimeline'
import { basename } from '../../../lib/path'
import { useT } from '../../../i18n'
import { Button } from '../../common/Button'
import { CopyButton } from '../../common/CopyButton'
import { FileIcon } from '../../common/FileIcon'
import { IconButton } from '../../common/IconButton'
import { ImageLightbox } from '../../common/ImageLightbox'
import { PromptSegments } from '../PromptSegments'
import { useConversationField } from '../useConversation'
import { MessageTime } from './MessageTime'

const NO_COMMANDS: readonly ClaudeSlashCommand[] = []

/** Text typed by the user, with the `/commands` highlighted (color and italics). */
export function UserText({ conversationId, text }: { conversationId: string; text: string }) {
  const commands = useConversationField(conversationId, (c) => c.commands, NO_COMMANDS)
  const segments = useMemo(() => promptSegments(text, commands), [text, commands])
  return (
    <div className="claude-user-text">
      <PromptSegments segments={segments} />
    </div>
  )
}

/** Thumbnails of the sent images; clicking enlarges. */
function UserImages({ images }: { images: readonly UserImage[] }) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  // The data URLs can exceed MBs: built once per list, not on every render.
  const urls = useMemo(() => images.map(imageUrl), [images])
  const openUrl = open === null ? undefined : urls[open]
  return (
    <div className="claude-user-images" data-testid="claude-user-images">
      {urls.map((src, i) => (
        <button
          key={i}
          type="button"
          className="claude-user-image"
          aria-label={t.claude.timelineParts.openImage(i + 1, images.length)}
          onClick={() => setOpen(i)}
        >
          <img src={src} alt="" loading="lazy" decoding="async" />
        </button>
      ))}
      {openUrl && (
        <ImageLightbox
          src={openUrl}
          name={t.claude.timelineParts.imageName((open ?? 0) + 1, images.length)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** File (and range) of the editor that went with the message; click opens it at the range. */
function ContextChip({ context }: { context: NonNullable<Extract<TimelineItem, { type: 'user' }>['context']> }) {
  return (
    <button
      type="button"
      className="claude-context-chip"
      title={context.path}
      data-testid="claude-context-chip"
      onClick={() => void openPathFromClaude(context.path, context.startLine)}
    >
      <FileIcon name={basename(context.path)} />
      <span className="claude-context-chip-label">{contextChipLabel(context)}</span>
    </button>
  )
}

/** User message; those with a checkpoint get "go back to here" (code and/or conversation). */
export function UserMessage({
  conversationId,
  item,
  busy,
  waiting
}: {
  conversationId: string
  item: Extract<TimelineItem, { type: 'user' }>
  busy: boolean
  waiting: boolean
}) {
  const [rewinding, setRewinding] = useState(false)
  const t = useT()
  const m = t.claude.timelineParts
  // The confirmation buttons disappear on choose/cancel: focus returns to the prompt instead of getting lost.
  const run = (code: boolean, conversation: boolean): void => {
    setRewinding(false)
    focusPrompt()
    void rewindConversation(conversationId, item.uuid, { code, conversation }, item.text)
  }
  return (
    <div className={`claude-user${waiting ? ' queued' : ''}`}>
      {item.context && <ContextChip context={item.context} />}
      <UserText conversationId={conversationId} text={item.text} />
      {waiting && (
        <div className="claude-user-meta muted" role="status">
          {m.queued}
        </div>
      )}
      {item.images.length > 0 && <UserImages images={item.images} />}
      <MessageTime timestamp={item.timestamp} />
      <div className="claude-user-actions">
        {rewinding ? (
          <>
            <Button size="xs" autoFocus disabled={busy} onClick={() => run(true, true)}>
              {m.rewindBoth}
            </Button>
            <Button size="xs" disabled={busy} onClick={() => run(false, true)}>
              {m.rewindConversation}
            </Button>
            <Button size="xs" disabled={busy} onClick={() => run(true, false)}>
              {m.rewindCode}
            </Button>
            <Button
              size="xs"
              onClick={() => {
                setRewinding(false)
                focusPrompt()
              }}
            >
              {t.common.cancel}
            </Button>
          </>
        ) : (
          <>
            {item.text && <CopyButton text={item.text} label={m.copyMessage} className="claude-copy" />}
            {item.checkpoint && (
              <IconButton
                icon="codicon-discard"
                label={busy ? m.rewindBusy : m.rewind}
                disabled={busy}
                onClick={() => setRewinding(true)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
