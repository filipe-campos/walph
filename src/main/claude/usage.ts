// `/usage`: normalizes the response of the SDK experimental API
// `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` into `ClaudeUsageReport`. The format may change between
// versions and nothing in it is trusted: numbers are validated.

import { isFiniteNumber, isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { ConversationError } from './conversationError'
import type { ClaudeAccount, ClaudeUsageLimit, ClaudeUsageModel, ClaudeUsageReport } from '@shared/types'

const MAX_MODELS = 50
const MAX_LABEL_CHARS = 80

/** Finite non-negative number; anything else becomes `fallback`. */
function count(value: unknown, fallback = 0): number {
  return isFiniteNumber(value) && value >= 0 ? value : fallback
}

function percent(value: unknown): number | null {
  return isFiniteNumber(value) ? Math.min(100, Math.max(0, value)) : null
}

function epochMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 40) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function label(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\p{Cc}/gu, ' ').trim()
  return clean === '' ? null : clean.slice(0, MAX_LABEL_CHARS)
}

const WINDOW_LABELS = [
  ['five_hour', 'fiveHour'],
  ['seven_day', 'sevenDay'],
  ['seven_day_opus', 'sevenDayOpus'],
  ['seven_day_sonnet', 'sevenDaySonnet'],
  ['seven_day_oauth_apps', 'sevenDayOauthApps']
] as const

function limitsOf(raw: unknown): ClaudeUsageLimit[] {
  if (!isRecord(raw)) return []
  const limits: ClaudeUsageLimit[] = []
  const labels = t().claudeHost.usage
  for (const [key, text] of WINDOW_LABELS) {
    const w = raw[key]
    if (!isRecord(w)) continue
    limits.push({ key, label: labels[text], utilization: percent(w.utilization), resetsAt: epochMs(w.resets_at) })
  }
  if (Array.isArray(raw.model_scoped)) {
    const seen = new Map<string, number>()
    for (const entry of raw.model_scoped.slice(0, MAX_MODELS)) {
      const name = isRecord(entry) ? label(entry.display_name) : null
      if (!isRecord(entry) || !name) continue
      const n = (seen.get(name) ?? 0) + 1
      seen.set(name, n)
      limits.push({
        key: n === 1 ? `model:${name}` : `model:${name}#${n}`,
        label: labels.weekModel(name),
        utilization: percent(entry.utilization),
        resetsAt: epochMs(entry.resets_at)
      })
    }
  }
  return limits
}

function extraUsageOf(raw: unknown): ClaudeUsageReport['extraUsage'] {
  if (!isRecord(raw)) return null
  const credits = (v: unknown): number | null => (isFiniteNumber(v) && v >= 0 ? v : null)
  return {
    enabled: raw.is_enabled === true,
    usedCredits: credits(raw.used_credits),
    monthlyLimit: credits(raw.monthly_limit),
    utilization: percent(raw.utilization),
    currency: label(raw.currency)
  }
}

function modelsOf(raw: unknown): ClaudeUsageModel[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .slice(0, MAX_MODELS)
    .flatMap(([model, usage]) => {
      const name = label(model)
      if (!name || !isRecord(usage)) return []
      return [
        {
          model: name,
          inputTokens: count(usage.inputTokens),
          outputTokens: count(usage.outputTokens),
          cacheReadTokens: count(usage.cacheReadInputTokens),
          cacheCreationTokens: count(usage.cacheCreationInputTokens),
          costUsd: count(usage.costUSD)
        }
      ]
    })
}

/** Throws if the response lacks the minimum expected shape (session); anything else missing becomes empty/`null`. */
export function normalizeUsage(raw: unknown, account: ClaudeAccount | null = null): ClaudeUsageReport {
  if (!isRecord(raw) || !isRecord(raw.session)) throw new ConversationError('invalidReport')
  const session = raw.session
  const rateLimits = isRecord(raw.rate_limits) ? raw.rate_limits : null
  const available = raw.rate_limits_available !== false && rateLimits !== null
  return {
    session: {
      costUsd: count(session.total_cost_usd),
      apiDurationMs: count(session.total_api_duration_ms),
      durationMs: count(session.total_duration_ms),
      linesAdded: count(session.total_lines_added),
      linesRemoved: count(session.total_lines_removed),
      models: modelsOf(session.model_usage)
    },
    subscriptionType: label(raw.subscription_type),
    rateLimitsAvailable: available,
    limits: available ? limitsOf(rateLimits) : [],
    extraUsage: available ? extraUsageOf(rateLimits.extra_usage) : null,
    account
  }
}
