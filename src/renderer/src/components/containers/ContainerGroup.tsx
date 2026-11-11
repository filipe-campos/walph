import { useState } from 'react'
import { Chevron } from '../common/Chevron'
import { Icon } from '../common/Icon'
import { runComposeAction } from '../../dockerActions'
import { useStore } from '../../store'
import type { ContainerGroup as Group } from '../../lib/dockerContainers'
import { ContainerRow } from './ContainerRow'
import { useT } from '../../i18n'
import { Button } from '../common/Button'

/** A compose project (or the standalone ones): header with "N/M running" and group actions, and the rows. */
export function ContainerGroup({ group }: { group: Group }) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const project = group.project
  const busy = useStore((s) => (project ? !!s.docker.busy[`project:${project}`] : false))
  const countText = t.containers.group.running(group.running, group.total)
  const id = `container-group-${group.key}`

  return (
    <section
      className="container-group"
      data-testid="container-group"
      data-project={project ?? ''}
      data-standalone={project ? undefined : 'true'}
      aria-labelledby={id}
    >
      <header className="container-group-header">
        <button
          className="container-group-toggle"
          aria-expanded={!collapsed}
          aria-controls={`${id}-list`}
          onClick={() => setCollapsed((c) => !c)}
        >
          <Chevron open={!collapsed} />
          <span id={id} className="container-group-name">
            {group.label}
          </span>
          <span className="container-group-count" data-testid="container-group-count">
            {countText}
          </span>
          {group.inWorkspace && <span className="container-group-tag">{t.containers.group.inWorkspace}</span>}
        </button>
        {project && (
          <span className="container-group-actions">
            <Button
              data-action="group-up"
              title={t.containers.view.composeUpIn(project)}
              aria-label={t.containers.view.composeUpIn(project)}
              disabled={busy}
              onClick={() => void runComposeAction(project, 'up')}
            >
              <Icon name="play" />
              <span className="container-btn-text">{t.containers.view.composeUp}</span>
            </Button>
            <Button
              data-action="group-restart"
              title={t.containers.row.restart(project)}
              aria-label={t.containers.row.restart(project)}
              disabled={busy}
              onClick={() => void runComposeAction(project, 'restart')}
            >
              <Icon name="restart" />
              <span className="container-btn-text">{t.containers.group.restart}</span>
            </Button>
            <Button
              data-action="group-stop"
              title={t.containers.row.stop(project)}
              aria-label={t.containers.row.stop(project)}
              disabled={busy}
              onClick={() => void runComposeAction(project, 'stop')}
            >
              <Icon name="stop" />
              <span className="container-btn-text">{t.containers.group.stop}</span>
            </Button>
          </span>
        )}
      </header>
      {!collapsed && (
        <ul className="container-list" id={`${id}-list`}>
          {group.containers.map((c) => (
            <ContainerRow key={c.id} container={c} />
          ))}
        </ul>
      )}
    </section>
  )
}
