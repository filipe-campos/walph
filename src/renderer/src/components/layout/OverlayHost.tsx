import { lazy, Suspense } from 'react'
import { useStore } from '../../store'
import { AddWorkspaceModal } from '../AddWorkspaceModal'

// Rarely used modals load on demand. The fallback is empty: the modal shows when it arrives.
const SettingsModal = lazy(() => import('../settings/SettingsModal').then((m) => ({ default: m.SettingsModal })))
const UsageModal = lazy(() => import('../claude/UsageModal').then((m) => ({ default: m.UsageModal })))
const McpModal = lazy(() => import('../claude/mcp/McpModal').then((m) => ({ default: m.McpModal })))
const CommandArgsModal = lazy(() => import('../claude/CommandArgsModal').then((m) => ({ default: m.CommandArgsModal })))

/** The open modal (only one at a time, `overlay.kind`). */
export function OverlayHost() {
  const kind = useStore((s) => s.overlay?.kind)
  switch (kind) {
    case 'settings':
      return (
        <Suspense fallback={null}>
          <SettingsModal />
        </Suspense>
      )
    case 'mcp':
      return (
        <Suspense fallback={null}>
          <McpModal />
        </Suspense>
      )
    case 'usage':
      return (
        <Suspense fallback={null}>
          <UsageModal />
        </Suspense>
      )
    case 'claudeCommandArgs':
      return (
        <Suspense fallback={null}>
          <CommandArgsModal />
        </Suspense>
      )
    case 'addWorkspace':
      return <AddWorkspaceModal />
    default:
      return null
  }
}
