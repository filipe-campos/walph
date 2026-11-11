import { memo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { DebugStackFrame } from '@shared/types'
import { useStore } from '../../store'
import { useT } from '../../i18n'
import {
  addWatch,
  editWatch,
  focusFrame,
  loadThreadFrames,
  removeAllWatches,
  removeWatch,
  setVariableExpanded
} from '../../debugActions'
import {
  removeAllBreakpoints,
  removeBreakpointAt,
  revealBreakpoint,
  setAllBreakpointsEnabled,
  setBreakpointEnabledAt,
  setBreakpointFieldsAt
} from '../../debugBreakpointActions'
import { sessionTree } from '../../lib/debugSessions'
import { basename, dirname, relativeTo, isInside } from '../../lib/path'
import { IconButton } from '../common/IconButton'
import { InlineEdit } from '../common/InlineEdit'
import { Section } from '../common/Section'
import { Chevron } from '../common/Chevron'
import { ValueRow, ValueTree } from './ValueTree'
import { onTreeKeyDown } from './treeKeys'

/** Collapsible section whose open state lives in the store (the view unmounts when hidden). */
function DebugSection({
  id,
  title,
  count,
  actions,
  children
}: {
  id: string
  title: string
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const key = `section:${id}`
  const open = useStore((s) => s.debugExpanded[key] ?? true)
  return (
    <Section
      title={title}
      {...(count !== undefined && { count })}
      actions={actions}
      open={open}
      onToggle={(next) => setVariableExpanded(key, next)}
    >
      {children}
    </Section>
  )
}

const useStopped = (): boolean =>
  useStore((s) => s.debugSessions.some((x) => x.id === s.debugFocus?.sessionId && x.state === 'stopped'))

export function VariablesSection() {
  const t = useT()
  const scopes = useStore((s) => s.debugScopes)
  const stopped = useStopped()
  return (
    <DebugSection id="variables" title={t.debugUi.sections.variables}>
      {!stopped || scopes.length === 0 ? (
        <div className="debug-empty">{stopped ? t.debugUi.variables.empty : t.debugUi.variables.notStopped}</div>
      ) : (
        <ValueTree label={t.debugUi.sections.variables}>
          {scopes.map((scope) => (
            <ValueRow
              key={scope.name}
              nodeKey={`scope:${scope.name}`}
              name={scope.name}
              reference={scope.variablesReference}
              depth={0}
              defaultOpen={!scope.expensive}
              className="debug-scope-row"
            />
          ))}
        </ValueTree>
      )}
    </DebugSection>
  )
}

const WatchRow = memo(function WatchRow({ expression }: { expression: string }) {
  const t = useT()
  const result = useStore((s) => s.debugWatchResults[expression])
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <div className="tree-row editing debug-watch-edit">
        <InlineEdit
          className="debug-inline-input"
          aria-label={t.debugUi.watch.inputLabel}
          initial={expression}
          spellCheck={false}
          onCommit={(value) => {
            setEditing(false)
            editWatch(expression, value)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }
  return (
    <ValueRow
      nodeKey={`watch:${expression}`}
      name={expression}
      value={result?.value ?? t.debugUi.watch.notAvailable}
      reference={result?.variablesReference ?? 0}
      depth={0}
      error={!!result?.error}
      onDoubleClick={() => setEditing(true)}
      actions={
        <>
          <IconButton
            icon="codicon-edit"
            label={t.debugUi.watch.edit}
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
          />
          <IconButton
            icon="codicon-close"
            label={t.debugUi.watch.remove}
            onClick={(e) => {
              e.stopPropagation()
              removeWatch(expression)
            }}
          />
        </>
      }
    />
  )
})

export function WatchSection() {
  const t = useT()
  const watches = useStore((s) => s.debugWatches)
  const [adding, setAdding] = useState(false)
  return (
    <DebugSection
      id="watch"
      title={t.debugUi.sections.watch}
      actions={
        <>
          <IconButton icon="codicon-add" label={t.debugUi.watch.add} onClick={() => setAdding(true)} />
          <IconButton
            icon="codicon-close-all"
            label={t.debugUi.watch.removeAll}
            disabled={watches.length === 0}
            onClick={removeAllWatches}
          />
        </>
      }
    >
      <ValueTree label={t.debugUi.sections.watch}>
        {watches.map((w) => (
          <WatchRow key={w} expression={w} />
        ))}
      </ValueTree>
      {adding && (
        <div className="tree-row editing debug-watch-edit">
          <InlineEdit
            className="debug-inline-input"
            aria-label={t.debugUi.watch.inputLabel}
            initial=""
            spellCheck={false}
            onCommit={(value) => {
              setAdding(false)
              addWatch(value)
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {!adding && watches.length === 0 && <div className="debug-empty">{t.debugUi.watch.empty}</div>}
    </DebugSection>
  )
}

const FrameRow = memo(function FrameRow({
  sessionId,
  threadId,
  frame
}: {
  sessionId: string
  threadId: number
  frame: DebugStackFrame
}) {
  const t = useT()
  const active = useStore((s) => s.debugFocus?.sessionId === sessionId && s.debugFocus.frameId === frame.id)
  const source = frame.sourceName ?? (frame.path ? basename(frame.path) : t.debugUi.callStack.unknownSource)
  const activate = (): void => void focusFrame(sessionId, threadId, frame, true)
  return (
    <div
      className={`tree-row debug-frame${active ? ' active' : ''}${frame.hint !== 'normal' ? ' subtle' : ''}`}
      role="treeitem"
      aria-level={3}
      aria-current={active || undefined}
      tabIndex={0}
      data-debug-row=""
      title={frame.path ?? undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          activate()
        }
      }}
    >
      <span className="debug-frame-name">{frame.name}</span>
      <span className="debug-frame-source">{t.debugUi.callStack.frameLocation(source, frame.line)}</span>
    </div>
  )
})

function ThreadNode({ sessionId, threadId, name }: { sessionId: string; threadId: number; name: string }) {
  const t = useT()
  const key = `thread:${sessionId}:${threadId}`
  const paused = useStore((s) => {
    const session = s.debugSessions.find((x) => x.id === sessionId)
    return session?.state === 'stopped' && (session.stoppedThreadId === threadId || session.stoppedThreadId === null)
  })
  const frames = useStore((s) => s.debugFrames[`${sessionId}:${threadId}`])
  const open = useStore((s) => s.debugExpanded[key] ?? paused)
  const toggle = (): void => {
    setVariableExpanded(key, !open)
    if (!open && !frames) void loadThreadFrames(sessionId, threadId)
  }
  return (
    <>
      <div
        className="tree-row debug-thread"
        role="treeitem"
        aria-level={2}
        aria-expanded={open}
        tabIndex={0}
        data-debug-row=""
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <Chevron open={open} />
        <span className="debug-thread-name">{t.debugUi.callStack.thread(name)}</span>
        <span className="debug-state">{paused ? t.debugUi.callStack.pausedPlain : t.debugUi.callStack.running}</span>
      </div>
      {open &&
        (frames && frames.length > 0 ? (
          frames.map((f) => <FrameRow key={f.id} sessionId={sessionId} threadId={threadId} frame={f} />)
        ) : (
          <div className="debug-empty debug-indent-2">{t.debugUi.callStack.noFrames}</div>
        ))}
    </>
  )
}

function SessionNode({ id, depth }: { id: string; depth: number }) {
  const t = useT()
  const session = useStore((s) => s.debugSessions.find((x) => x.id === id))
  const threads = useStore((s) => s.debugThreads[id])
  if (!session) return null
  const state =
    session.state === 'starting'
      ? t.debugUi.callStack.starting
      : session.state === 'stopped'
        ? t.debugUi.callStack.pausedPlain
        : t.debugUi.callStack.running
  return (
    <>
      <div
        className="tree-row debug-session"
        role="treeitem"
        aria-level={1}
        tabIndex={0}
        data-debug-row=""
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span className="codicon codicon-debug-alt-small" aria-hidden />
        <span className="debug-session-name">{session.name}</span>
        <span className="debug-state">{state}</span>
      </div>
      {(threads ?? []).map((th) => (
        <ThreadNode key={th.id} sessionId={id} threadId={th.id} name={th.name} />
      ))}
    </>
  )
}

export function CallStackSection() {
  const t = useT()
  const tree = useStore(useShallow((s) => sessionTree(s.debugSessions).map((n) => `${n.session.id}|${n.depth}`)))
  return (
    <DebugSection id="callStack" title={t.debugUi.sections.callStack}>
      {tree.length === 0 ? (
        <div className="debug-empty">{t.debugUi.callStack.empty}</div>
      ) : (
        <div className="debug-tree" role="tree" aria-label={t.debugUi.sections.callStack} onKeyDown={onTreeKeyDown}>
          {tree.map((entry) => {
            const [id = '', depth = '0'] = entry.split('|')
            return <SessionNode key={id} id={id} depth={Number(depth)} />
          })}
        </div>
      )}
    </DebugSection>
  )
}

const BreakpointRow = memo(function BreakpointRow({ path, line }: { path: string; line: number }) {
  const t = useT()
  const m = t.debugUi.breakpoints
  const root = useStore((s) => s.root)
  const bp = useStore((s) => s.breakpoints[path]?.find((b) => b.line === line))
  const status = useStore((s) => s.breakpointStatus[path]?.find((x) => x.line === line))
  const [editing, setEditing] = useState(false)
  if (!bp) return null
  const label = m.location(basename(path), line)
  const dir = root && isInside(root, path) ? relativeTo(root, dirname(path)) : dirname(path)
  const detail = bp.logMessage
    ? m.logMessage(bp.logMessage)
    : bp.condition
      ? m.condition(bp.condition)
      : bp.hitCondition
        ? m.hitCondition(bp.hitCondition)
        : null
  const unverified = status !== undefined && !status.verified
  if (editing) {
    return (
      <div className="tree-row editing debug-watch-edit">
        <InlineEdit
          className="debug-inline-input"
          aria-label={m.conditionLabel}
          initial={bp.condition ?? ''}
          spellCheck={false}
          onCommit={(value) => {
            setEditing(false)
            setBreakpointFieldsAt(path, line, {
              condition: value,
              ...(bp.hitCondition && { hitCondition: bp.hitCondition }),
              ...(bp.logMessage && { logMessage: bp.logMessage })
            })
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }
  return (
    <div
      className={`tree-row debug-breakpoint${bp.enabled ? '' : ' disabled'}${unverified ? ' unverified' : ''}`}
      role="treeitem"
      aria-level={1}
      tabIndex={0}
      data-debug-row=""
      title={unverified ? (status.message ?? m.unverified) : path}
      onClick={() => revealBreakpoint(path, line)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter') {
          e.preventDefault()
          revealBreakpoint(path, line)
        } else if (e.key === ' ') {
          e.preventDefault()
          setBreakpointEnabledAt(path, line, !bp.enabled)
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          removeBreakpointAt(path, line)
        }
      }}
    >
      <input
        type="checkbox"
        className="debug-breakpoint-check"
        checked={bp.enabled}
        aria-label={m.enable(label)}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setBreakpointEnabledAt(path, line, e.currentTarget.checked)}
      />
      <span className="tree-label">{label}</span>
      {detail ? (
        <span className="debug-breakpoint-detail">{detail}</span>
      ) : (
        <span className="debug-breakpoint-dir">{dir}</span>
      )}
      <span className="row-actions">
        <IconButton
          icon="codicon-edit"
          label={m.editCondition}
          onClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        />
        <IconButton
          icon="codicon-close"
          label={m.remove}
          onClick={(e) => {
            e.stopPropagation()
            removeBreakpointAt(path, line)
          }}
        />
      </span>
    </div>
  )
})

export function BreakpointsSection() {
  const t = useT()
  const m = t.debugUi.breakpoints
  const entries = useStore(
    useShallow((s) =>
      Object.keys(s.breakpoints)
        .sort()
        .flatMap((path) => (s.breakpoints[path] ?? []).map((b) => `${b.line}|${path}`))
    )
  )
  const allEnabled = useStore((s) => Object.values(s.breakpoints).every((list) => list.every((b) => b.enabled)))
  return (
    <DebugSection
      id="breakpoints"
      title={t.debugUi.sections.breakpoints}
      count={entries.length}
      actions={
        <>
          <IconButton
            icon="codicon-activate-breakpoints"
            label={m.toggleAll}
            pressed={allEnabled}
            disabled={entries.length === 0}
            onClick={() => setAllBreakpointsEnabled(!allEnabled)}
          />
          <IconButton
            icon="codicon-close-all"
            label={m.removeAll}
            disabled={entries.length === 0}
            onClick={removeAllBreakpoints}
          />
        </>
      }
    >
      {entries.length === 0 ? (
        <div className="debug-empty">{m.empty}</div>
      ) : (
        <div className="debug-tree" role="tree" aria-label={t.debugUi.sections.breakpoints} onKeyDown={onTreeKeyDown}>
          {entries.map((entry) => {
            const sep = entry.indexOf('|')
            const line = Number(entry.slice(0, sep))
            const path = entry.slice(sep + 1)
            return <BreakpointRow key={entry} path={path} line={line} />
          })}
        </div>
      )}
    </DebugSection>
  )
}
