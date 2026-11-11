import { useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes } from '../../lib/format'
import type { DockerContainer } from '@shared/types'
import { Icon } from '../common/Icon'
import { useFocusRegion } from '../common/useFocusRegion'
import { composeUpWorkspace, investigateContainer, openContainerDetail, refreshDocker } from '../../dockerActions'
import { useStore } from '../../store'
import {
  clampPercent,
  formatPercent,
  groupContainers,
  isProblem,
  problemDescription,
  statusOf,
  summarize,
  type ContainerFilter
} from '../../lib/dockerContainers'
import { ContainerGroup } from './ContainerGroup'
import { ContainerDetail } from './ContainerDetail'
import { useT } from '../../i18n'
import { Button } from '../common/Button'
import { IconButton } from '../common/IconButton'

const FILTERS: ContainerFilter[] = ['all', 'running', 'stopped']

const MAX_PROBLEM_CARDS = 3

function SummaryCards() {
  const t = useT()
  const list = useStore((s) => s.docker.list)
  const stats = useStore((s) => s.docker.stats)
  const memTotal = useStore((s) => (s.docker.info?.ok ? s.docker.info.memTotal : 0))
  const summary = useMemo(() => summarize(list?.containers ?? [], stats), [list, stats])
  const memPercent = memTotal > 0 ? clampPercent((summary.memUsage / memTotal) * 100) : 0
  return (
    <div className="containers-summary" data-testid="containers-summary">
      <div className="container-card" data-testid="summary-running">
        <span className="container-card-label">{t.containers.summary.running}</span>
        <span className="container-card-value">{summary.running}</span>
        <span className="container-card-hint">{t.containers.summary.ofTotal(summary.total)}</span>
      </div>
      <div className="container-card" data-testid="summary-stopped">
        <span className="container-card-label">{t.containers.summary.stopped}</span>
        <span className="container-card-value">{summary.stopped}</span>
        <span className="container-card-hint">{t.containers.summary.stoppedHint}</span>
      </div>
      <div className={`container-card${summary.problems > 0 ? ' problem' : ''}`} data-testid="summary-problems">
        <span className="container-card-label">{t.containers.summary.problems}</span>
        <span className="container-card-value">
          {summary.problems > 0 && <Icon name="alert" />}
          {summary.problems}
        </span>
        <span className="container-card-hint">
          {summary.problems > 0 ? t.containers.summary.problemsHint : t.containers.summary.allGood}
        </span>
      </div>
      <div className="container-card" data-testid="summary-resources">
        <span className="container-card-label">{t.containers.summary.resources}</span>
        <span className="container-card-value mono">{formatPercent(summary.cpu)}</span>
        <span className="container-card-hint">
          {memTotal > 0
            ? t.containers.summary.memoryOf(formatBytes(summary.memUsage), formatBytes(memTotal))
            : formatBytes(summary.memUsage)}
        </span>
        {memTotal > 0 && (
          <span
            className="container-mem-bar wide"
            role="progressbar"
            aria-label={t.containers.summary.memoryLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={memPercent}
          >
            <i style={{ transform: `scaleX(${memPercent / 100})` }} />
          </span>
        )}
      </div>
    </div>
  )
}

function ProblemCard({ container }: { container: DockerContainer }) {
  const t = useT()
  const busy = useStore((s) => !!s.docker.busy[`investigate:${container.id}`])
  const status = statusOf(container)
  return (
    <div
      className="container-problem"
      role="group"
      aria-label={t.containers.problem.label(container.name)}
      data-testid="container-problem-card"
      data-container-name={container.name}
    >
      <Icon name="alert" />
      <div className="container-problem-text">
        <strong>
          {container.name} — {status.label}
        </strong>
        <span className="muted ellipsis" title={problemDescription(container)}>
          {problemDescription(container)}
        </span>
      </div>
      <Button data-testid="container-investigate" disabled={busy} onClick={() => void investigateContainer(container)}>
        <Icon name="spark" />
        {t.containers.problem.investigate}
      </Button>
      <Button onClick={() => openContainerDetail(container.id, 'logs')}>{t.containers.problem.viewLogs}</Button>
    </div>
  )
}

/** Docker missing, daemon stopped or error: explains the reason and offers to try again. */
function ErrorState({ message, loading }: { message: string; loading: boolean }) {
  const t = useT()
  return (
    <div className="containers-empty" data-testid="containers-error" role="alert">
      <Icon name="box" />
      <p>{message}</p>
      <Button
        variant="primary"
        data-testid="containers-retry"
        disabled={loading}
        onClick={() => void refreshDocker(true)}
      >
        {t.common.retry}
      </Button>
    </div>
  )
}

/** Containers screen: takes over the work area; responds to its own width (container queries). */
export function ContainersView() {
  const t = useT()
  const info = useStore((s) => s.docker.info)
  const list = useStore((s) => s.docker.list)
  const listError = useStore((s) => s.docker.listError)
  const loading = useStore((s) => s.docker.loading)
  const selectedId = useStore((s) => s.docker.selectedId)
  const root = useStore((s) => s.root)
  const composeFile = useStore((s) => s.docker.list?.workspaceComposeFile ?? null)
  const composeBusy = useStore((s) => !!s.docker.busy.workspace)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ContainerFilter>('all')
  const search = useRef<HTMLInputElement>(null)
  const searchRef = useFocusRegion<HTMLInputElement>('containersSearch', { intoRef: search })
  const viewRef = useFocusRegion<HTMLDivElement>('containersView')

  // The editor/terminal/Claude are hidden with focus inside: brings focus here (otherwise the focus `when`s get stuck).
  useEffect(() => search.current?.focus(), [])

  const groups = useMemo(
    () =>
      groupContainers(list?.containers ?? [], {
        query,
        filter,
        root,
        platform: window.api.platform,
        standaloneLabel: t.containers.standalone
      }),
    [list, query, filter, root, t]
  )
  const problems = useMemo(() => (list?.containers ?? []).filter(isProblem), [list])
  const selected = useMemo(() => list?.containers.find((c) => c.id === selectedId) ?? null, [list, selectedId])
  const ok = info?.ok === true

  let body: React.ReactNode
  if (info && !info.ok) body = <ErrorState message={info.message} loading={loading} />
  else if (listError && !list) body = <ErrorState message={listError} loading={loading} />
  else if (!list)
    body = (
      <div className="containers-empty" role="status">
        {t.containers.view.loading}
      </div>
    )
  else {
    body = (
      <div className={`containers-body${selected ? ' has-detail' : ''}`}>
        <div className="containers-main">
          {listError && (
            <div className="container-logs-error" role="alert">
              {listError}
            </div>
          )}
          <SummaryCards />
          {problems.slice(0, MAX_PROBLEM_CARDS).map((c) => (
            <ProblemCard key={c.id} container={c} />
          ))}
          {problems.length > MAX_PROBLEM_CARDS && (
            <p className="muted container-problem-more">
              {t.containers.problem.more(problems.length - MAX_PROBLEM_CARDS)}
            </p>
          )}
          {groups.length === 0 ? (
            <p className="containers-none" data-testid="containers-none">
              {list.containers.length === 0 ? t.containers.view.empty : t.containers.view.noMatch}
            </p>
          ) : (
            <div className="container-groups" data-testid="container-groups">
              {groups.map((g) => (
                <ContainerGroup key={g.key} group={g} />
              ))}
            </div>
          )}
        </div>
        {selected && <ContainerDetail container={selected} />}
      </div>
    )
  }

  return (
    <div
      ref={viewRef}
      className="containers-view containers-screen"
      data-testid="containers-view"
      aria-label={t.containers.title}
      role="region"
      aria-busy={loading || undefined}
    >
      <header className="containers-header">
        <div className="containers-title">
          <h2>{t.containers.title}</h2>
          {info?.ok && (
            <span className="containers-context mono" data-testid="containers-context">
              {info.context ?? 'docker'} · Docker {info.version}
            </span>
          )}
        </div>
        <div className="containers-controls">
          <label className="containers-search">
            <i className="codicon codicon-search" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              spellCheck={false}
              placeholder={t.containers.view.search}
              aria-label={t.containers.view.search}
              data-testid="containers-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="segmented" role="radiogroup" aria-label={t.containers.view.filterLabel}>
            {FILTERS.map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={filter === f}
                data-testid={`containers-filter-${f}`}
                className={`segmented-item${filter === f ? ' on' : ''}`}
                onClick={() => setFilter(f)}
              >
                {t.containers.view.filters[f]}
              </button>
            ))}
          </div>
          <IconButton
            data-testid="containers-refresh"
            label={t.common.refresh}
            disabled={loading}
            onClick={() => void refreshDocker(true)}
            glyph="restart"
          />
          <Button
            variant="primary"
            data-testid="containers-compose-up"
            disabled={!ok || !composeFile || composeBusy}
            title={composeFile ? t.containers.view.composeUpIn(composeFile) : t.containers.view.noComposeFile}
            onClick={() => void composeUpWorkspace()}
          >
            <Icon name="play" plain />
            {t.containers.view.composeUp}
          </Button>
        </div>
      </header>
      {body}
    </div>
  )
}
