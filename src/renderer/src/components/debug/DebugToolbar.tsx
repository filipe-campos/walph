import type { CommandId } from '@shared/commands'
import { useStore } from '../../store'
import { useT } from '../../i18n'
import { executeCommand } from '../../commands/registry'
import { IconButton } from '../common/IconButton'
import { useShortcutLabel } from '../common/useShortcutLabel'
import { useRovingFocus } from '../common/useRovingFocus'

function ToolbarButton({
  command,
  icon,
  label,
  disabled
}: {
  command: CommandId
  icon: string
  label: string
  disabled?: boolean
}) {
  const shortcut = useShortcutLabel(command)
  return (
    <IconButton
      icon={icon}
      label={label}
      shortcut={shortcut}
      disabled={!!disabled}
      onClick={() => void executeCommand(command)}
    />
  )
}

/** Floating bar at the top of the editor area while there is a session: continue/pause, steps, restart and stop. */
export function DebugToolbar() {
  const t = useT()
  const m = t.debugUi.toolbarActions
  const state = useStore((s) => s.debugSessions.find((x) => x.id === s.debugFocus?.sessionId)?.state ?? null)
  const active = useStore((s) => s.debugSessions.length > 0)
  const onKeyDown = useRovingFocus({ orientation: 'horizontal', selector: 'button' })
  if (!active) return null
  const stopped = state === 'stopped'
  return (
    <div className="debug-toolbar" role="toolbar" aria-label={t.debugUi.toolbar} onKeyDown={onKeyDown}>
      {stopped ? (
        <ToolbarButton command="debug.continue" icon="codicon-debug-continue" label={m.continue} />
      ) : (
        <ToolbarButton
          command="debug.pause"
          icon="codicon-debug-pause"
          label={m.pause}
          disabled={state !== 'running'}
        />
      )}
      <ToolbarButton command="debug.stepOver" icon="codicon-debug-step-over" label={m.stepOver} disabled={!stopped} />
      <ToolbarButton command="debug.stepInto" icon="codicon-debug-step-into" label={m.stepInto} disabled={!stopped} />
      <ToolbarButton command="debug.stepOut" icon="codicon-debug-step-out" label={m.stepOut} disabled={!stopped} />
      <ToolbarButton command="debug.restart" icon="codicon-debug-restart" label={m.restart} />
      <ToolbarButton command="debug.stop" icon="codicon-debug-stop" label={m.stop} />
    </div>
  )
}
