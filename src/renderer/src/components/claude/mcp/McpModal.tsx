import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ClaudeMcpServer } from '@shared/types'
import {
  canLogout,
  canToggle,
  configSummary,
  groupServers,
  serverKey,
  statusDot,
  statusLabel,
  toolCountLabel
} from '../../../lib/claudeMcp'
import { useT } from '../../../i18n'
import { useConversationOverlay } from '../useConversationOverlay'
import { Chevron } from '../../common/Chevron'
import { IconButton } from '../../common/IconButton'
import { Modal } from '../../common/Modal'
import { StatusDot } from '../../common/StatusDot'
import { Switch } from '../../common/Switch'
import { McpServerForm } from './McpServerForm'
import { useMcpServers, type AuthState, type McpServerActions } from './useMcpServers'
import { closeMcpModal } from '../../../overlayActions'
import { Button } from '../../common/Button'
import { CopyButton } from '../../common/CopyButton'

/**
 * MCP servers of the panel's active conversation (`/mcp`). Mounted in `App`; the id comes from the store
 * (`openMcpModal`).
 */
export function McpModal() {
  const id = useConversationOverlay('mcp', closeMcpModal)
  if (!id) return null
  // `key`: switching conversations starts from scratch (list, expanded rows, authentications).
  return <McpModalContent key={id} conversationId={id} />
}

function McpModalContent({ conversationId }: { conversationId: string }) {
  const t = useT()
  const { servers, loadFailed, auth, busy, retry, applyExternal, actions } = useMcpServers(conversationId)
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const addRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const focusedList = useRef(false)
  const wasAdding = useRef(false)
  // The form disappears with the footer button: going back to the list, focus returns to "Add server".
  useEffect(() => {
    if (!adding && wasAdding.current) addRef.current?.focus()
    wasAdding.current = adding
  }, [adding])

  // First list on screen: focus leaves the container and goes to the first row (the keyboard enters the list directly).
  const loaded = servers !== null
  useEffect(() => {
    if (!loaded || focusedList.current) return
    focusedList.current = true
    if (document.activeElement === bodyRef.current) {
      bodyRef.current?.querySelector<HTMLElement>('.mcp-expand')?.focus({ preventScroll: true })
    }
  }, [loaded])

  const rowActions = useMemo<RowActions>(
    () => ({
      ...actions,
      open: (key) => setExpanded((e) => (e === key ? null : key)),
      askRemove: (key) => setConfirmRemove(key),
      cancelRemove: () => setConfirmRemove(null),
      remove: async (s) => {
        setConfirmRemove(null)
        if (!(await actions.remove(s))) return
        setExpanded((e) => (e === serverKey(s) ? null : e))
        // The removed row took the focus with it: give it back to the fixed footer button.
        if (!document.activeElement || document.activeElement === document.body) addRef.current?.focus()
      }
    }),
    [actions]
  )

  const groups = servers ? groupServers(servers) : []

  return (
    <Modal
      title={t.claude.mcpModal.title}
      className="mcp-modal"
      testId="claude-mcp-modal"
      onClose={closeMcpModal}
      footer={
        adding ? undefined : (
          <Button type="button" data-testid="mcp-add" ref={addRef} onClick={() => setAdding(true)}>
            <i className="codicon codicon-add" aria-hidden /> {t.claude.mcpModal.addServer}
          </Button>
        )
      }
    >
      {/* Initial focus on the container (no ring): the "Add server" button does not steal focus on open. */}
      <div className="mcp-body" ref={bodyRef} tabIndex={-1} data-autofocus="">
        {loadFailed && servers !== null && !adding && (
          <div className="mcp-stale" role="alert" data-testid="mcp-load-failed">
            <span>{t.claude.mcpModal.refreshFailed}</span>
            <Button type="button" data-testid="mcp-retry" onClick={retry}>
              {t.common.retry}
            </Button>
          </div>
        )}
        {adding ? (
          <McpServerForm
            conversationId={conversationId}
            onCancel={() => setAdding(false)}
            onAdded={(list) => {
              if (applyExternal(list)) setAdding(false)
            }}
          />
        ) : servers === null ? (
          loadFailed ? (
            <div className="empty-state" data-testid="mcp-load-failed">
              <p>{t.claude.mcpModal.loadFailed}</p>
              <Button type="button" data-testid="mcp-retry" onClick={retry}>
                {t.common.retry}
              </Button>
            </div>
          ) : (
            <div className="empty-state" role="status" data-testid="mcp-loading">
              {t.claude.mcpModal.loading}
            </div>
          )
        ) : groups.length === 0 ? (
          <div className="empty-state" data-testid="mcp-empty">
            <p>{t.claude.mcpModal.empty}</p>
            <p className="muted">{t.claude.mcpModal.emptyHint}</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mcp-group" data-mcp-group={group.key} aria-label={group.label}>
              <h3 className="mcp-group-title">
                {group.label} <span className="count-badge">{group.servers.length}</span>
              </h3>
              {group.servers.map((s) => {
                const key = serverKey(s)
                return (
                  <McpRow
                    key={key}
                    server={s}
                    open={expanded === key}
                    busy={busy.has(key)}
                    auth={auth[key]}
                    confirmingRemove={confirmRemove === key}
                    actions={rowActions}
                  />
                )
              })}
            </section>
          ))
        )}
      </div>
    </Modal>
  )
}

/** Actions of a row: those of the hook + what belongs only to the screen (expand and confirm removal). */
interface RowActions extends Omit<McpServerActions, 'remove'> {
  open: (key: string) => void
  askRemove: (key: string) => void
  cancelRemove: () => void
  remove: (server: ClaudeMcpServer) => Promise<void>
}

const McpRow = memo(function McpRow({
  server: s,
  open,
  busy,
  auth,
  confirmingRemove,
  actions
}: {
  server: ClaudeMcpServer
  open: boolean
  busy: boolean
  auth: AuthState | undefined
  confirmingRemove: boolean
  actions: RowActions
}) {
  const t = useT()
  const detailId = useId()
  const n = s.name
  const key = serverKey(s)
  const removeRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  // The confirmation enters after the Modal mounts (which only reads `data-autofocus` on its own mount): focuses the
  // safe
  // button and, on leaving, returns focus to the button that opened it (or to the row, if it is gone).
  useEffect(() => {
    if (confirmingRemove) cancelRef.current?.focus()
    else if (wasConfirming.current) (removeRef.current ?? expandRef.current)?.focus()
    wasConfirming.current = confirmingRemove
  }, [confirmingRemove])
  // Busy controls are `aria-disabled` (not `disabled`) so focus does not drop to `body`.
  const guard = (fn: () => void) => () => {
    if (!busy) fn()
  }
  const tools = toolCountLabel(s)
  return (
    <div className="mcp-server" data-mcp-server={n} data-status={s.status}>
      <div className="mcp-row">
        <button
          type="button"
          className="mcp-expand"
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          ref={expandRef}
          data-testid={`mcp-expand-${n}`}
          onClick={() => actions.open(key)}
        >
          <Chevron open={open} />
          {/* The text beside it already says the state: the dot stays out of the accessibility tree. */}
          <span aria-hidden>
            <StatusDot status={statusDot(s.status)} />
          </span>
          <span className="mcp-name">{n}</span>
          <span className="mcp-status" data-testid={`mcp-status-${n}`}>
            {statusLabel(s.status)}
          </span>
          {tools && <span className="mcp-tools-count muted">{tools}</span>}
        </button>
        <div className="mcp-actions">
          {confirmingRemove ? (
            <>
              <span className="mcp-confirm-text">{t.claude.mcpModal.confirmRemove(n)}</span>
              <Button
                type="button"
                data-testid={`mcp-remove-cancel-${n}`}
                ref={cancelRef}
                onClick={actions.cancelRemove}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="danger"
                type="button"
                data-testid={`mcp-remove-confirm-${n}`}
                busy={busy}
                onClick={() => void actions.remove(s)}
              >
                {t.claude.mcpModal.remove}
              </Button>
            </>
          ) : (
            <>
              {s.status === 'failed' && (
                <Button
                  type="button"
                  data-testid={`mcp-reconnect-${n}`}
                  busy={busy}
                  onClick={() => actions.reconnect(s)}
                >
                  {t.claude.mcpModal.reconnect}
                </Button>
              )}
              {s.status === 'needs-auth' && (
                <Button
                  type="button"
                  data-testid={`mcp-authenticate-${n}`}
                  aria-disabled={busy || !!auth || undefined}
                  onClick={guard(() => actions.authenticate(s))}
                >
                  {t.claude.mcpModal.authenticate}
                </Button>
              )}
              {canLogout(s) && (
                <Button type="button" data-testid={`mcp-logout-${n}`} busy={busy} onClick={() => actions.logout(s)}>
                  {t.claude.mcpModal.logout}
                </Button>
              )}
              {s.editable && (
                <IconButton
                  icon="codicon-trash"
                  label={t.claude.mcpModal.removeServer(n)}
                  busy={busy}
                  ref={removeRef}
                  data-testid={`mcp-remove-${n}`}
                  onClick={() => actions.askRemove(key)}
                />
              )}
              {canToggle(s) && (
                <Switch
                  checked={s.status !== 'disabled'}
                  onChange={() => actions.toggle(s)}
                  label={t.claude.mcpModal.enableServer(n)}
                  busy={busy}
                  testId={`mcp-toggle-${n}`}
                />
              )}
            </>
          )}
        </div>
      </div>
      {auth && s.status === 'needs-auth' && (
        <McpAuthPanel
          name={n}
          auth={auth}
          onCancel={() => actions.cancelAuth(s)}
          onSubmit={(url) => actions.submitCallback(s, url)}
        />
      )}
      {open && (
        <div id={detailId} className="mcp-detail" data-testid={`mcp-detail-${n}`}>
          <McpDetail server={s} />
        </div>
      )}
    </div>
  )
})

function McpAuthPanel({
  name,
  auth,
  onCancel,
  onSubmit
}: {
  name: string
  auth: AuthState
  onCancel: () => void
  onSubmit: (url: string) => Promise<void>
}) {
  const t = useT()
  const [url, setUrl] = useState('')
  const [sending, setSending] = useState(false)
  return (
    <div className="mcp-auth" data-testid={`mcp-auth-${name}`}>
      <div className="setting-note" role="status">
        <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden /> {t.claude.mcpModal.awaitingAuth}
      </div>
      {auth.authUrl && (
        <div className="mcp-auth-row">
          <input
            className="mcp-input mono"
            readOnly
            aria-label={t.claude.mcpModal.authUrl}
            data-testid={`mcp-auth-url-${name}`}
            value={auth.authUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton text={auth.authUrl} label={t.claude.mcpModal.copyUrl} />
        </div>
      )}
      {auth.awaitingCallback && (
        <form
          className="mcp-auth-row"
          onSubmit={(e) => {
            e.preventDefault()
            const value = url.trim()
            if (!value || sending) return
            setSending(true)
            void onSubmit(value).finally(() => setSending(false))
          }}
        >
          <input
            className="mcp-input mono"
            aria-label={t.claude.mcpModal.callbackUrl}
            placeholder={t.claude.mcpModal.callbackUrl}
            autoComplete="off"
            spellCheck={false}
            data-testid={`mcp-callback-input-${name}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit" data-testid={`mcp-callback-submit-${name}`} disabled={sending || !url.trim()}>
            {t.claude.mcpModal.send}
          </Button>
        </form>
      )}
      <div className="mcp-auth-row">
        <Button type="button" data-testid={`mcp-auth-cancel-${name}`} onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  )
}

function McpDetail({ server: s }: { server: ClaudeMcpServer }) {
  const t = useT()
  const summary = configSummary(s)
  const c = s.config
  return (
    <>
      {s.error && (
        <div className="setting-error" role="alert" data-testid={`mcp-error-${s.name}`}>
          {s.error}
        </div>
      )}
      <dl className="mcp-props">
        {s.serverInfo && (
          <>
            <dt>{t.claude.mcpModal.server}</dt>
            <dd>
              {s.serverInfo.name} <span className="muted">{s.serverInfo.version}</span>
            </dd>
          </>
        )}
        {c && (
          <>
            <dt>{t.claude.mcpModal.transport}</dt>
            <dd>{c.transport}</dd>
          </>
        )}
        {summary && (
          <>
            <dt>{c?.url ? t.claude.mcpModal.url : t.claude.mcpModal.command}</dt>
            <dd className="mono">{summary}</dd>
          </>
        )}
        {!!c?.envKeys?.length && (
          <>
            <dt>{t.claude.mcpModal.variables}</dt>
            <dd className="mono">
              {c.envKeys.join(', ')} <span className="muted">{t.claude.mcpModal.hiddenValues}</span>
            </dd>
          </>
        )}
        {!!c?.headerKeys?.length && (
          <>
            <dt>{t.claude.mcpModal.headers}</dt>
            <dd className="mono">
              {c.headerKeys.join(', ')} <span className="muted">{t.claude.mcpModal.hiddenValues}</span>
            </dd>
          </>
        )}
      </dl>
      {s.tools.length > 0 && (
        <>
          <div className="mcp-tools-title">{t.claude.mcpModal.tools(s.tools.length)}</div>
          <ul className="mcp-tools">
            {s.tools.map((tool) => (
              <li key={tool.name} className="mcp-tool" data-mcp-tool={tool.name}>
                <span className="mcp-tool-name mono">{tool.name}</span>
                {tool.readOnly && <span className="setting-badge">{t.claude.mcpModal.readOnly}</span>}
                {tool.destructive && (
                  <span className="setting-badge mcp-badge-danger">{t.claude.mcpModal.destructive}</span>
                )}
                {tool.description && (
                  <span className="mcp-tool-desc" title={tool.description}>
                    {tool.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {s.status === 'connected' && s.tools.length === 0 && <div className="muted">{t.claude.mcpModal.noTools}</div>}
    </>
  )
}
