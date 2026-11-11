import type { ClaudeUsageLimit, ClaudeUsageReport } from '@shared/types'
import { loadClaudeUsage } from '../../claudeMcpActions'
import { formatCost, formatTokens } from '../../lib/claudeFormat'
import { formatDuration } from '../../lib/claudeTime'
import {
  accountText,
  clampPercent,
  formatMinorUnits,
  resetText,
  shortModel,
  sortedLimits,
  usageLevel,
  usedText
} from '../../lib/claudeUsage'
import { closeUsageModal } from '../../overlayActions'
import { useT } from '../../i18n'
import { useConversationOverlay } from './useConversationOverlay'
import { errorMessage } from '../../lib/errors'
import { Modal } from '../common/Modal'
import { useAsync } from '../common/useAsync'
import { Button } from '../common/Button'

/**
 * Plan usage and session cost of the conversation (`/usage`). Mounted in `App`; the id comes from the store
 * (`openUsageModal`).
 */
export function UsageModal() {
  const id = useConversationOverlay('usage', closeUsageModal)
  if (!id) return null
  return <UsageModalContent key={id} conversationId={id} />
}

function UsageModalContent({ conversationId }: { conversationId: string }) {
  const t = useT()
  const m = t.claude.usageModal
  const { status, value: report, error, reload } = useAsync(() => loadClaudeUsage(conversationId), [conversationId])

  const loading = status === 'loading'
  return (
    <Modal
      title={m.title}
      className="usage-modal"
      testId="claude-usage-modal"
      onClose={closeUsageModal}
      footer={
        <Button type="button" data-testid="usage-refresh" busy={loading} onClick={reload}>
          <i className="codicon codicon-refresh" aria-hidden /> {t.common.refresh}
        </Button>
      }
    >
      <div className="usage-body" tabIndex={-1} data-autofocus="" aria-busy={loading}>
        {status === 'loading' && (
          <div className="empty-state" role="status" data-testid="usage-loading">
            {m.loading}
          </div>
        )}
        {status === 'error' && (
          <div className="empty-state" role="alert" data-testid="usage-error">
            <p>{errorMessage(error) || m.loadFailed}</p>
          </div>
        )}
        {status === 'success' &&
          (report ? (
            <UsageReport report={report} />
          ) : (
            <div className="empty-state" data-testid="usage-unsupported">
              <p>{m.unsupported}</p>
              <p className="muted">{m.unsupportedHint}</p>
            </div>
          ))}
      </div>
    </Modal>
  )
}

function UsageReport({ report }: { report: ClaudeUsageReport }) {
  const t = useT()
  const m = t.claude.usageModal
  // The report's plan rules: `null` (API key, Bedrock, Vertex) hides what `init` reported.
  const { subscriptionType: _plan, ...rest } = report.account ?? {}
  const account = accountText({
    ...rest,
    ...(report.subscriptionType !== null && { subscriptionType: report.subscriptionType })
  })
  const { session, extraUsage } = report
  return (
    <>
      {account && (
        <p className="usage-account" data-testid="usage-account">
          {account}
        </p>
      )}
      <section className="usage-section" aria-label={m.planLimits}>
        <h3 className="usage-title">{m.planLimits}</h3>
        {report.rateLimitsAvailable && report.limits.length > 0 ? (
          sortedLimits(report.limits).map((l) => <LimitRow key={l.key} limit={l} />)
        ) : (
          <p className="muted usage-note">{report.rateLimitsAvailable ? m.noLimits : m.limitsNotApplicable}</p>
        )}
      </section>
      {extraUsage?.enabled && (
        <section className="usage-section" aria-label={m.extraUsage}>
          <h3 className="usage-title">{m.extraUsage}</h3>
          <div className="usage-row" data-testid="usage-extra">
            <div className="usage-row-head">
              <span className="usage-label">{m.monthlyOverage}</span>
              <span className="usage-figures">
                {extraUsage.monthlyLimit !== null
                  ? m.usedOfLimit(
                      extraUsage.usedCredits !== null
                        ? formatMinorUnits(extraUsage.usedCredits, extraUsage.currency)
                        : '--',
                      formatMinorUnits(extraUsage.monthlyLimit, extraUsage.currency)
                    )
                  : extraUsage.usedCredits !== null
                    ? formatMinorUnits(extraUsage.usedCredits, extraUsage.currency)
                    : '--'}
              </span>
            </div>
            {extraUsage.utilization !== null && <Bar percent={extraUsage.utilization} label={m.extraUsage} />}
          </div>
        </section>
      )}
      <section className="usage-section" aria-label={m.session}>
        <h3 className="usage-title">{m.thisSession}</h3>
        <dl className="usage-facts" data-testid="usage-session">
          <div>
            <dt>{m.cost}</dt>
            <dd>{formatCost(session.costUsd)}</dd>
          </div>
          <div>
            <dt>{m.totalTime}</dt>
            <dd>{formatDuration(session.durationMs)}</dd>
          </div>
          <div>
            <dt>{m.apiTime}</dt>
            <dd>{formatDuration(session.apiDurationMs)}</dd>
          </div>
          <div>
            <dt>{m.lines}</dt>
            <dd>
              <span className="usage-added">+{session.linesAdded}</span>{' '}
              <span className="usage-removed">-{session.linesRemoved}</span>
            </dd>
          </div>
        </dl>
        {session.models.length > 0 && (
          <table className="usage-models" data-testid="usage-models">
            <thead>
              <tr>
                <th scope="col">{m.model}</th>
                <th scope="col">{m.input}</th>
                <th scope="col">{m.output}</th>
                <th scope="col">{m.cache}</th>
                <th scope="col">{m.cost}</th>
              </tr>
            </thead>
            <tbody>
              {session.models.map((row) => (
                <tr key={row.model}>
                  <th scope="row" title={row.model}>
                    {shortModel(row.model)}
                  </th>
                  <td>{formatTokens(row.inputTokens)}</td>
                  <td>{formatTokens(row.outputTokens)}</td>
                  <td>{formatTokens(row.cacheReadTokens + row.cacheCreationTokens)}</td>
                  <td>{formatCost(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

function Bar({ percent, label }: { percent: number | null; label: string }) {
  const value = clampPercent(percent)
  return (
    <div
      className={`usage-bar ${usageLevel(percent)}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  )
}

function LimitRow({ limit }: { limit: ClaudeUsageLimit }) {
  const reset = resetText(limit.resetsAt)
  return (
    <div className="usage-row" data-usage-limit={limit.key}>
      <div className="usage-row-head">
        <span className="usage-label">{limit.label}</span>
        <span className="usage-figures">
          {usedText(limit.utilization)}
          {reset && <span className="muted"> · {reset}</span>}
        </span>
      </div>
      {limit.utilization !== null && <Bar percent={limit.utilization} label={limit.label} />}
    </div>
  )
}
