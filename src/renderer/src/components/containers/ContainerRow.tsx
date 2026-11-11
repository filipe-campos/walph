import { memo } from 'react'
import { formatBytes } from '../../lib/format'
import type { DockerContainer } from '@shared/types'
import { Icon } from '../common/Icon'
import { openContainerDetail, openContainerTerminal, runContainerAction } from '../../dockerActions'
import { useStore } from '../../store'
import { useT } from '../../i18n'
import { clampPercent, formatPercent, portLabel, sparklinePoints, statusOf, webPorts } from '../../lib/dockerContainers'
import { IconButton } from '../common/IconButton'

const MAX_PORT_CHIPS = 3

function Sparkline({ history }: { history: number[] }) {
  return (
    <svg className="container-spark" viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={sparklinePoints(history, 60, 16)} />
    </svg>
  )
}

function Ports({ container }: { container: DockerContainer }) {
  const t = useT()
  const web = new Set(webPorts(container.ports).map((p) => p.port))
  const seen = new Set<string>()
  const ports = container.ports.filter((p) => {
    const label = portLabel(p)
    if (seen.has(label)) return false
    seen.add(label)
    return true
  })
  if (ports.length === 0) return <span className="container-cell-empty">—</span>
  const shown = ports.slice(0, MAX_PORT_CHIPS)
  const hidden = ports.slice(MAX_PORT_CHIPS)
  return (
    <span className="container-ports">
      {shown.map((p) =>
        p.hostPort !== null && p.protocol === 'tcp' && web.has(p.hostPort) ? (
          <button
            key={portLabel(p)}
            className="container-port web"
            data-testid="container-port"
            title={t.containers.row.openUrl(`http://localhost:${p.hostPort}`)}
            aria-label={t.containers.row.openUrlInBrowser(`http://localhost:${p.hostPort}`)}
            onClick={() => window.open(`http://localhost:${p.hostPort}`)}
          >
            {portLabel(p)}
            <Icon name="external" />
          </button>
        ) : (
          <span key={portLabel(p)} className="container-port" data-testid="container-port">
            {portLabel(p)}
          </span>
        )
      )}
      {hidden.length > 0 && (
        <span
          className="container-port more"
          title={hidden.map(portLabel).join(', ')}
          aria-label={t.containers.row.morePorts(hidden.length, hidden.map(portLabel).join(', '))}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  )
}

export const ContainerRow = memo(function ContainerRow({ container }: { container: DockerContainer }) {
  const t = useT()
  // Each row subscribes only to its own sample: `docker stats` does not redo the whole list.
  const stats = useStore((s) => s.docker.stats[container.id])
  const selected = useStore((s) => s.docker.selectedId === container.id)
  const busy = useStore((s) => !!s.docker.busy[container.id])
  const status = statusOf(container)
  const live = container.state === 'running'
  const active = live || container.state === 'restarting' || container.state === 'paused'
  const name = container.name

  const onRowClick = (e: React.MouseEvent): void => {
    if ((e.target as Element).closest('button, a')) return
    openContainerDetail(container.id)
  }

  return (
    <li
      className={`container-row${selected ? ' selected' : ''}${busy ? ' busy' : ''}`}
      data-testid="container-row"
      data-container-name={name}
      data-container-id={container.id}
      data-state={container.state}
      data-health={container.health ?? ''}
      aria-current={selected ? 'true' : undefined}
      aria-busy={busy || undefined}
      onClick={onRowClick}
    >
      <span className="container-identity">
        <button className="container-name" onClick={() => openContainerDetail(container.id)} title={name}>
          {name}
        </button>
        <span className="container-image ellipsis" title={container.image}>
          {container.image}
        </span>
      </span>
      <span className={`container-status tone-${status.tone}`} data-testid="container-status">
        <i className="container-status-dot" aria-hidden="true" />
        {status.label}
      </span>
      <span className="container-cell col-ports">
        <Ports container={container} />
      </span>
      <span className="container-cell col-cpu" data-testid="container-cpu">
        {live && stats ? (
          <>
            <span className="container-cpu-text">{formatPercent(stats.cpuPercent)}</span>
            <Sparkline history={stats.cpuHistory} />
          </>
        ) : (
          <span className="container-cell-empty">—</span>
        )}
      </span>
      <span className="container-cell col-mem" data-testid="container-mem">
        {live && stats ? (
          <>
            <span
              className="container-mem-bar"
              role="progressbar"
              aria-label={t.containers.row.memory(name)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clampPercent(stats.memPercent)}
            >
              <i style={{ transform: `scaleX(${clampPercent(stats.memPercent) / 100})` }} />
            </span>
            <span className="container-mem-text">
              {formatBytes(stats.memUsage)}
              {stats.memLimit > 0 ? ` / ${formatBytes(stats.memLimit)}` : ''}
            </span>
          </>
        ) : (
          <span className="container-cell-empty">—</span>
        )}
      </span>
      <span className="container-cell col-uptime" title={container.status}>
        {container.uptime ?? <span className="container-cell-empty">—</span>}
      </span>
      <span className="container-actions">
        {active ? (
          <>
            <IconButton
              data-action="stop"
              label={t.containers.row.stop(name)}
              disabled={busy}
              onClick={() => void runContainerAction(container.id, 'stop')}
              glyph="stop"
            />
            <IconButton
              data-action="restart"
              label={t.containers.row.restart(name)}
              disabled={busy}
              onClick={() => void runContainerAction(container.id, 'restart')}
              glyph="restart"
            />
          </>
        ) : (
          <IconButton
            data-action="start"
            label={t.containers.row.start(name)}
            disabled={busy}
            onClick={() => void runContainerAction(container.id, 'start')}
            glyph="play"
          />
        )}
        <IconButton
          data-action="logs"
          label={t.containers.row.logs(name)}
          onClick={() => openContainerDetail(container.id, 'logs')}
          glyph="logs"
        />
        <IconButton
          data-action="terminal"
          label={t.containers.row.terminal(name)}
          disabled={!live}
          onClick={() => void openContainerTerminal(container)}
          glyph="terminal"
        />
      </span>
    </li>
  )
})
