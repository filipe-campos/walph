// Claude Code account: `claude auth status/logout` through the same binary as the conversations (`cliRunner.ts`,
// `execFile`, never a shell). The CLI output is untrusted: known fields only, short text. Login runs in the integrated
// terminal.

import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { ClaudeAccount, ClaudeAuthStatus } from '@shared/types'
import { CliExitError, type ClaudeCliRunner, type CliContext } from './cliRunner'
import { UserError } from '../errors'

const MAX_FIELD_CHARS = 200

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replace(/\p{Cc}/gu, ' ').trim()
  return trimmed === '' ? undefined : trimmed.slice(0, MAX_FIELD_CHARS)
}

function assign(account: ClaudeAccount, key: keyof ClaudeAccount, value: unknown): void {
  const v = text(value)
  if (v !== undefined) account[key] = v
}

/** SDK `initializationResult()` `AccountInfo` → contract account; `null` if nothing usable came. */
export function normalizeAccount(raw: unknown): ClaudeAccount | null {
  if (!isRecord(raw)) return null
  const account: ClaudeAccount = {}
  assign(account, 'email', raw.email)
  assign(account, 'organization', raw.organization ?? raw.orgName)
  assign(account, 'subscriptionType', raw.subscriptionType)
  assign(account, 'authMethod', raw.authMethod ?? raw.tokenSource ?? raw.apiKeySource)
  assign(account, 'apiProvider', raw.apiProvider)
  return Object.keys(account).length > 0 ? account : null
}

/**
 * Output of `claude auth status` (JSON by default; text as a last resort). Throws if it cannot tell whether there is a
 * login, instead of guessing "logged out".
 */
export function parseAuthStatus(stdout: string): ClaudeAuthStatus {
  const body = stdout.trim()
  try {
    const json: unknown = JSON.parse(body)
    if (isRecord(json) && typeof json.loggedIn === 'boolean') {
      return { loggedIn: json.loggedIn, ...(normalizeAccount(json) ?? {}) }
    }
  } catch {
    // not JSON: try the text below
  }
  if (/\b(?:not\s+logged\s+in|logged\s+out|not\s+authenticated|unauthenticated|no\s+account)\b/i.test(body))
    return { loggedIn: false }
  if (/\b(?:logged\s+in|authenticated)\b/i.test(body) && !/\b(?:fail|error)/i.test(body)) {
    const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(body)?.[0]
    return { loggedIn: true, ...(email ? { email } : {}) }
  }
  throw new UserError(t().claudeHost.cli.readLoginFailed)
}

/** `claude auth status`. A non-zero exit code with the JSON in the body (CLIs that exit 1 when logged out) counts. */
export async function readAuthStatus(run: ClaudeCliRunner, context: CliContext): Promise<ClaudeAuthStatus> {
  let output: string
  try {
    output = await run(['auth', 'status', '--json'], context)
  } catch (err) {
    for (const candidate of [err instanceof CliExitError ? err.stdout : '', err instanceof Error ? err.message : '']) {
      try {
        if (candidate.trim() !== '') return parseAuthStatus(candidate)
      } catch {
        // try the next source
      }
    }
    throw err instanceof Error ? err : new UserError(t().claudeHost.cli.readAccountFailed)
  }
  return parseAuthStatus(output)
}

export async function runLogout(run: ClaudeCliRunner, context: CliContext): Promise<void> {
  await run(['auth', 'logout'], context)
}
