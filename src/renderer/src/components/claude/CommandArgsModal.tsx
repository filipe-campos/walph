import { useState } from 'react'
import { sendPrompt } from '../../claudePromptActions'
import { useT } from '../../i18n'
import { closeCommandArgsModal } from '../../overlayActions'
import { useStore } from '../../store'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { MiniMarkdownEditor } from '../editor/MiniMarkdownEditor'
import { useConversationOverlay } from './useConversationOverlay'

/**
 * Arguments of a favorite command that asks for them (`argumentHint`). Mounted in `OverlayHost`; the data comes from
 * the overlay.
 */
export function CommandArgsModal() {
  const id = useConversationOverlay('claudeCommandArgs', closeCommandArgsModal)
  const request = useStore((s) => (s.overlay?.kind === 'claudeCommandArgs' ? s.overlay : null))
  if (!id || !request) return null
  return (
    <CommandArgsContent
      key={`${id}:${request.command}`}
      conversationId={id}
      command={request.command}
      hint={request.hint}
    />
  )
}

function CommandArgsContent({
  conversationId,
  command,
  hint
}: {
  conversationId: string
  command: string
  hint: string
}) {
  const t = useT()
  const m = t.claude.commandArgs
  const [args, setArgs] = useState('')
  const mod = window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'

  const submit = (): void => {
    closeCommandArgsModal()
    const text = `/${command} ${args.trim()}`.trimEnd()
    // No automatic context: the command already says what to do, the open file does not go along.
    void sendPrompt(conversationId, text, [], false)
  }

  return (
    <Modal
      title={`/${command}`}
      className="command-args-modal"
      testId="claude-command-args"
      onClose={closeCommandArgsModal}
      footer={
        <>
          <Button type="button" onClick={closeCommandArgsModal}>
            {t.common.cancel}
          </Button>
          <Button type="button" variant="primary" data-testid="command-args-send" onClick={submit}>
            {m.send} <kbd className="button-kbd">{mod}↵</kbd>
          </Button>
        </>
      }
    >
      <p className="command-args-hint muted">
        {m.hint} <code>{hint}</code>
      </p>
      <MiniMarkdownEditor
        value={args}
        onChange={setArgs}
        onSubmit={submit}
        placeholder={hint}
        label={m.inputLabel(command)}
        className="command-args-editor"
      />
    </Modal>
  )
}
