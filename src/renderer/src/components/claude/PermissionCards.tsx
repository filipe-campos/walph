import { useState } from 'react'
import type { ClaudePermissionRequest } from '@shared/types'
import { acceptEdit, openProposalDiff, rejectEdit, respondPermission } from '../../claudePermissions'
import { summarizeTool, toolInputText } from '../../lib/claudeTools'
import { relativeTo } from '../../lib/path'
import { useT } from '../../i18n'
import { useStore } from '../../store'
import { Chevron } from '../common/Chevron'
import { Segmented } from '../common/Segmented'
import { useFocusRegion } from '../common/useFocusRegion'
import { ClaudeMarkdown } from './ClaudeMarkdown'
import { ElicitationCard } from './ElicitationCard'
import { QuestionCard } from './QuestionCard'
import { Button } from '../common/Button'

type Req<K extends ClaudePermissionRequest['kind']> = Extract<ClaudePermissionRequest, { kind: K }>

/** Tool request (Bash, web, MCP…): Allow / Always allow / Deny with an optional comment. */
function ToolPermissionCard({ conversationId, request }: { conversationId: string; request: Req<'tool'> }) {
  const t = useT()
  const m = t.claude.permissions
  const root = useStore((s) => s.root)
  const [comment, setComment] = useState('')
  const [open, setOpen] = useState(false)
  const summary = summarizeTool(request.toolName, request.input, root)
  const id = request.requestId
  const cardRef = useFocusRegion<HTMLDivElement>(`claudeCard:${id}`)

  return (
    <div
      ref={cardRef}
      className="claude-card"
      role="group"
      aria-label={m.toolAriaLabel}
      data-request-id={request.requestId}
    >
      <div className="claude-card-title">
        <i className="codicon codicon-shield" />
        <span>{request.title}</span>
      </div>
      {request.description && <div className="claude-card-text muted">{request.description}</div>}
      <button className="claude-card-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <i className={`codicon codicon-${summary.icon}`} />
        <span className="claude-row-title">{summary.title}</span>
        <span className="claude-row-detail">{summary.detail}</span>
      </button>
      {open && (
        <div className="claude-row-body">
          <pre>{toolInputText(request.toolName, request.input)}</pre>
        </div>
      )}
      <input
        className="claude-card-input"
        value={comment}
        placeholder={m.denyComment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="claude-card-actions">
        <Button variant="primary" onClick={() => void respondPermission(conversationId, id, { behavior: 'allow' })}>
          {m.allow}
        </Button>
        {request.canAlwaysAllow && (
          <Button
            title={m.allowAlwaysTitle}
            onClick={() => void respondPermission(conversationId, id, { behavior: 'allow', always: true })}
          >
            {m.allowAlways}
          </Button>
        )}
        {request.canAllowInWorkspace && (
          <Button
            data-always="workspace"
            title={m.allowWorkspaceTitle}
            onClick={() => void respondPermission(conversationId, id, { behavior: 'allow', always: 'workspace' })}
          >
            {m.allowWorkspace}
          </Button>
        )}
        <Button onClick={() => void respondPermission(conversationId, id, deny(comment))}>{m.deny}</Button>
      </div>
    </div>
  )
}

const deny = (comment: string) =>
  comment.trim() ? ({ behavior: 'deny', message: comment.trim() } as const) : ({ behavior: 'deny' } as const)

/**
 * Pending edit: the full diff opens in the editor; here only the summary and how to reopen it (Accept/Reject live in
 * the diff).
 */
function EditPermissionCard({ conversationId, request }: { conversationId: string; request: Req<'edit'> }) {
  const t = useT()
  const m = t.claude.permissions
  const root = useStore((s) => s.root)
  const label = root ? relativeTo(root, request.path) : request.path
  const cardRef = useFocusRegion<HTMLDivElement>(`claudeCard:${request.requestId}`)
  return (
    <div
      ref={cardRef}
      className="claude-card"
      role="group"
      aria-label={m.editAriaLabel}
      data-request-id={request.requestId}
    >
      <div className="claude-card-title">
        <i className="codicon codicon-diff" />
        <span>{request.isNewFile ? m.create : m.edit}</span>
        <span className="claude-row-detail">{label}</span>
      </div>
      <div className="claude-card-actions">
        <Button onClick={() => openProposalDiff(conversationId, request)}>{m.viewDiff}</Button>
        <Button variant="primary" onClick={() => void acceptEdit(conversationId, request.requestId)}>
          {m.accept}
        </Button>
        <Button onClick={() => rejectEdit(conversationId, request.requestId, '')}>{m.reject}</Button>
      </div>
    </div>
  )
}

const PLAN_MODES: readonly { id: 'default' | 'acceptEdits'; label: string }[] = [
  { id: 'default', label: 'Manual' },
  { id: 'acceptEdits', label: 'Edit automatically' }
]

/** Plan (ExitPlanMode): a markdown document to review; approving picks the execution mode. */
function PlanPermissionCard({ conversationId, request }: { conversationId: string; request: Req<'plan'> }) {
  const t = useT()
  const m = t.claude.permissions
  const [mode, setMode] = useState<'default' | 'acceptEdits'>('default')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const id = request.requestId
  const cardRef = useFocusRegion<HTMLDivElement>(`claudeCard:${id}`)

  return (
    <div
      ref={cardRef}
      className="claude-card plan"
      role="group"
      aria-label={m.plan}
      data-request-id={request.requestId}
    >
      <div className="claude-card-title">
        <i className="codicon codicon-checklist" />
        <span>{m.planTitle}</span>
      </div>
      <div className="claude-plan">
        <ClaudeMarkdown text={request.plan} />
      </div>
      <div className="claude-card-text muted">{m.runWith}</div>
      <Segmented className="claude-segments" label={m.runMode} value={mode} options={PLAN_MODES} onChange={setMode} />
      {feedbackOpen && (
        <textarea
          className="claude-card-input"
          rows={3}
          autoFocus
          value={feedback}
          placeholder={m.planFeedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      )}
      <div className="claude-card-actions">
        <Button
          variant="primary"
          onClick={() => void respondPermission(conversationId, id, { behavior: 'allow', mode })}
        >
          {m.approve}
        </Button>
        {feedbackOpen ? (
          <Button onClick={() => void respondPermission(conversationId, id, deny(feedback))}>
            {m.sendAndKeepPlanning}
          </Button>
        ) : (
          <Button onClick={() => setFeedbackOpen(true)}>{m.keepPlanning}</Button>
        )}
      </div>
    </div>
  )
}

export function PermissionCard({
  conversationId,
  request
}: {
  conversationId: string
  request: ClaudePermissionRequest
}) {
  switch (request.kind) {
    case 'tool':
      return <ToolPermissionCard conversationId={conversationId} request={request} />
    case 'edit':
      return <EditPermissionCard conversationId={conversationId} request={request} />
    case 'plan':
      return <PlanPermissionCard conversationId={conversationId} request={request} />
    case 'question':
      return <QuestionCard conversationId={conversationId} request={request} />
    case 'elicitation':
      return <ElicitationCard conversationId={conversationId} request={request} />
  }
}
