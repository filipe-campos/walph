// Classification of Claude errors into messages for the user. The CLI/server text is untrusted and stays out of the
// displayed message, except the short stderr tail on process failures (helps diagnosis).

import { stripAnsi } from '@shared/controlChars'
import { t } from '@shared/i18n'
import type { ClaudeError } from '@shared/types'

const AUTH_TEXT =
  /not logged in|please run \/login|invalid api key|authentication[_ ](failed|error)|oauth token (has )?expired|invalid[_ ]x-api-key|401 unauthorized|status(?: code)?:? 401/i

/** `error` code of an assistant message (`SDKAssistantMessageError`) → contract error. */
export function classifyAssistantError(code: string): ClaudeError {
  switch (code) {
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
    case 'cloud_credential_error':
      return { code: 'auth', message: t().claudeHost.errors.auth }
    case 'account_on_hold':
    case 'verification_required':
      return { code: 'other', message: t().claudeHost.errors.accountAttention }
    case 'billing_error':
      return { code: 'other', message: t().claudeHost.errors.billing }
    case 'rate_limit':
      return { code: 'other', message: t().claudeHost.errors.rateLimit }
    case 'overloaded':
      return { code: 'other', message: t().claudeHost.errors.overloaded }
    case 'model_not_found':
      return { code: 'other', message: t().claudeHost.errors.modelNotFound }
    case 'invalid_request':
      return { code: 'other', message: t().claudeHost.errors.invalidRequest }
    case 'max_output_tokens':
      return { code: 'other', message: t().claudeHost.errors.maxOutput }
    default:
      return { code: 'other', message: t().claudeHost.errors.generic }
  }
}

/** Text of a `result` with `is_error`: only recognizes a login failure; the rest returns `null` (caller decides). */
export function classifyResultText(text: string): ClaudeError | null {
  return AUTH_TEXT.test(text) ? { code: 'auth', message: t().claudeHost.errors.auth } : null
}

/** stderr tail: last non-empty lines, short, without escape codes. */
export function stderrSummary(stderr: string, maxLines = 4, maxChars = 400): string {
  const clean = stripAnsi(stderr)
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.slice(-maxLines).join('\n').slice(-maxChars)
}

/** Failure at startup or during the conversation (SDK exception, process exit). */
export function classifyFailure(err: unknown, stderr = ''): ClaudeError {
  const raw = err instanceof Error ? err.message : String(err)
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  const tail = stderrSummary(stderr)
  if (AUTH_TEXT.test(raw) || AUTH_TEXT.test(tail)) return { code: 'auth', message: t().claudeHost.errors.auth }
  if (code === 'ENOENT' || code === 'EACCES' || /native cli binary|ENOENT|EACCES/i.test(raw)) {
    return { code: 'executable', message: t().claudeHost.errors.cannotStart }
  }
  if (/exited with code|process exited|terminated by signal|transport/i.test(raw) || tail !== '') {
    return {
      code: 'process',
      message: `${t().claudeHost.errors.processDied}${tail ? `\n${tail}` : ''}`
    }
  }
  return { code: 'other', message: t().claudeHost.errors.failed }
}
