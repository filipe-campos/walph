import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DockerContainer, DockerInspect, DockerLogLine } from '@shared/types'
import { Icon } from '../common/Icon'
import { useFocusRegion } from '../common/useFocusRegion'
import {
  dismissContainerDetail,
  openContainerTerminal,
  setDetailTab,
  takeDetailFocusRequest
} from '../../dockerActions'
import { useStore } from '../../store'
import { formatCreated, formatLogTime, portLabel, statusOf, type DockerDetailTab } from '../../lib/dockerContainers'
import { useT } from '../../i18n'
import { Button } from '../common/Button'
import { IconButton } from '../common/IconButton'

const TABS: DockerDetailTab[] = ['logs', 'details']

const LogLineRow = memo(function LogLineRow({ line, levelLabel }: { line: DockerLogLine; levelLabel: string }) {
  return (
    <div className={`container-log-line ${line.level}`} data-testid="container-log-line" data-level={line.level}>
      <span className="container-log-time">{formatLogTime(line.time)}</span>
      <span className="container-log-level">{levelLabel}</span>
      <span className="container-log-text">{line.text}</span>
    </div>
  )
})

/** Following logs: sticks to the end while the user has not scrolled up. Remounts per container (`key`). */
function LogsPane() {
  const t = useT()
  const logs = useStore((s) => s.docker.logs)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [following, setFollowing] = useState(true)

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [logs?.lines])

  const onScroll = (): void => {
    const el = scroller.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    stick.current = atEnd
    setFollowing(atEnd)
  }
  const toEnd = (): void => {
    const el = scroller.current
    if (!el) return
    stick.current = true
    setFollowing(true)
    el.scrollTop = el.scrollHeight
  }

  if (!logs) return null
  return (
    <div className="container-logs">
      <div className="container-logs-bar" role="status" data-testid="container-logs-status">
        <span className={`container-follow${logs.ended ? ' ended' : following ? ' on' : ''}`}>
          <i aria-hidden="true" />
          {logs.ended ? t.containers.logs.ended : following ? t.containers.logs.following : t.containers.logs.paused}
        </span>
        <span className="container-logs-count">{t.containers.logs.lines(logs.lines.length)}</span>
        {!following && !logs.ended && (
          <Button data-testid="container-logs-to-end" onClick={toEnd}>
            {t.containers.logs.toEnd}
          </Button>
        )}
      </div>
      {logs.error && (
        <div className="container-logs-error" role="alert">
          {logs.error}
        </div>
      )}
      <div
        className="container-log-scroll"
        ref={scroller}
        onScroll={onScroll}
        tabIndex={0}
        role="log"
        aria-label={t.containers.logs.label}
        data-testid="container-logs"
      >
        {logs.lines.length === 0 && !logs.ended && <p className="container-logs-empty">{t.containers.logs.waiting}</p>}
        {logs.lines.length === 0 && logs.ended && !logs.error && (
          <p className="container-logs-empty">{t.containers.logs.none}</p>
        )}
        {logs.lines.map((line, i) => (
          <LogLineRow key={logs.offset + i} line={line} levelLabel={t.containers.logLevel[line.level]} />
        ))}
      </div>
    </div>
  )
}

function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="container-field" data-testid={testId}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function DetailsPane({ container }: { container: DockerContainer }) {
  const t = useT()
  const fields = t.containers.fields
  const view = useStore((s) => s.docker.inspect)
  const data: DockerInspect | null = view && view.id === container.id ? view.data : null
  if (view?.id === container.id && view.error) {
    return (
      <div className="container-logs-error" role="alert">
        {view.error}
      </div>
    )
  }
  if (!data) return <p className="container-logs-empty">{fields.loading}</p>
  return (
    <dl className="container-fields" data-testid="container-details">
      <Field label={fields.image}>{data.image}</Field>
      <Field label={fields.command}>
        <code>{data.command || '—'}</code>
      </Field>
      <Field label={fields.created}>{formatCreated(data.created)}</Field>
      <Field label={fields.restarts} testId="container-detail-restarts">
        {data.restartCount}
        {data.exitCode !== null && data.state !== 'running' ? ` · ${fields.exitCode(data.exitCode)}` : ''}
      </Field>
      <Field label={fields.health} testId="container-detail-health">
        {data.health ? (
          <>
            {data.health.status}
            {data.health.failingStreak > 0 ? ` · ${fields.failingStreak(data.health.failingStreak)}` : ''}
            {data.health.lastOutput && <pre className="container-health-output">{data.health.lastOutput}</pre>}
          </>
        ) : (
          fields.noHealthCheck
        )}
      </Field>
      <Field label={fields.networks}>{data.networks.length > 0 ? data.networks.join(', ') : '—'}</Field>
      <Field label={fields.ports}>{data.ports.length > 0 ? data.ports.map(portLabel).join(', ') : '—'}</Field>
      <Field label={fields.volumes}>
        {data.mounts.length > 0 ? (
          <ul className="container-mounts">
            {data.mounts.map((m, i) => (
              <li key={i}>
                <code>
                  {m.source} → {m.destination}
                </code>
                <span className="muted">
                  {' '}
                  {m.type}
                  {m.readOnly ? ` · ${fields.readOnly}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          '—'
        )}
      </Field>
      <Field label={fields.env}>{fields.envCount(data.envCount)}</Field>
    </dl>
  )
}

/** Details panel of the open container: Logs and Details tabs. */
export function ContainerDetail({ container }: { container: DockerContainer }) {
  const t = useT()
  const tab = useStore((s) => s.docker.detailTab)
  const status = statusOf(container)
  const regionRef = useFocusRegion<HTMLElement>('containerDetail')
  const live = container.state === 'running'

  // Opened by keyboard: focus goes to the active tab (the detail is new on screen, focus cannot stay on the list).
  useEffect(() => {
    if (takeDetailFocusRequest()) document.querySelector<HTMLElement>('.container-tab.active')?.focus()
  }, [container.id])

  return (
    <section
      ref={regionRef}
      className="container-detail"
      data-testid="container-detail"
      data-container-name={container.name}
      aria-label={t.containers.detail.label(container.name)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismissContainerDetail()
      }}
    >
      <header className="container-detail-header">
        <IconButton
          className="container-detail-back"
          label={t.containers.detail.back}
          onClick={dismissContainerDetail}
          icon="codicon-arrow-left"
        />
        <span className="container-detail-title">
          <span className="container-detail-name ellipsis">{container.name}</span>
          <span className={`container-status tone-${status.tone}`}>
            <i className="container-status-dot" aria-hidden="true" />
            {status.label}
          </span>
        </span>
        <Button
          data-action="terminal"
          disabled={!live}
          title={live ? t.containers.detail.openTerminal : t.containers.detail.notRunning}
          onClick={() => void openContainerTerminal(container)}
        >
          <Icon name="terminal" />
          <span className="container-btn-text">{t.containers.detail.terminal}</span>
        </Button>
        <IconButton
          data-testid="container-detail-close"
          title={t.containers.detail.close}
          label={t.containers.detail.closeLabel}
          onClick={dismissContainerDetail}
          glyph="close"
        />
      </header>
      <div className="container-tabs" role="tablist" aria-label={t.containers.detail.tabsLabel}>
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            id={`container-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="container-tabpanel"
            data-testid={`container-tab-${id}`}
            className={`container-tab${tab === id ? ' active' : ''}`}
            onClick={() => setDetailTab(id)}
          >
            {t.containers.detail.tabs[id]}
          </button>
        ))}
      </div>
      <div
        className="container-tabpanel"
        id="container-tabpanel"
        role="tabpanel"
        aria-labelledby={`container-tab-${tab}`}
      >
        {tab === 'logs' ? <LogsPane key={container.id} /> : <DetailsPane container={container} />}
      </div>
    </section>
  )
}
