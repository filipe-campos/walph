// Pure auto update logic: settings → updater options and events/errors → `UpdateNotice` in the current language.

import { t } from '@shared/i18n'
import type { UpdateNotice } from '@shared/types'
import type { Settings } from '@shared/settings'

/** First check 10 s after opening (does not compete for CPU/network with window restore) and then every 4 h. */
export const FIRST_CHECK_DELAY_MS = 10_000
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export interface UpdaterOptions {
  enabled: boolean
  /** electron-updater channel name: `latest` (stable) or `beta` (reads `beta.yml`). */
  channel: 'latest' | 'beta'
  allowPrerelease: boolean
}

export function updaterOptions(settings: Pick<Settings, 'update.enabled' | 'update.channel'>): UpdaterOptions {
  const beta = settings['update.channel'] === 'beta'
  return { enabled: settings['update.enabled'], channel: beta ? 'beta' : 'latest', allowPrerelease: beta }
}

/** Did something change that requires reconfiguring the updater (or rescheduling the checks)? */
export function sameOptions(a: UpdaterOptions | null, b: UpdaterOptions): boolean {
  return !!a && a.enabled === b.enabled && a.channel === b.channel && a.allowPrerelease === b.allowPrerelease
}

export const checkingNotice = (): UpdateNotice => ({ kind: 'checking', message: t().app.update.checking })

export const upToDateNotice = (): UpdateNotice => ({ kind: 'upToDate', message: t().app.update.upToDate })

export const downloadingNotice = (version: string): UpdateNotice => ({
  kind: 'downloading',
  message: t().app.update.downloading(version),
  version
})

export const downloadedNotice = (version: string): UpdateNotice => ({
  kind: 'downloaded',
  message: t().app.update.downloaded(version),
  version
})

const NETWORK = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ERR_INTERNET_DISCONNECTED|net::ERR_/i
const SIGNATURE = /code signature|codesign|not signed|signature/i

/**
 * Updater error → notice. Never returns the raw message (it carries stack, URLs and HTTP headers). 404/private
 * repository and unknown errors fall back to the generic text.
 */
export function errorNotice(err: unknown): UpdateNotice {
  const text = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ''}` : String(err)
  const messages = t().app.update
  let message = messages.checkFailed
  if (NETWORK.test(text)) message = messages.offline
  else if (SIGNATURE.test(text)) message = messages.unsigned
  return { kind: 'error', message }
}
