import { hasControl } from '@shared/controlChars'
import type { CloneUrlCheck } from '@shared/types'
import { t } from '@shared/i18n'

// Validates the URL typed for `git clone` (user input, untrusted) and derives the folder name.
// Only accepts `https://`, `ssh://` and the scp form `user@host:path`. git runs with `--` before the URL, but the list
// is closed on purpose: `ext::`/`fd::` (remote helpers) run commands and `file://`/local paths read the disk.

const MAX_URL_LENGTH = 2048
const MAX_NAME_LENGTH = 200

export interface CloneUrlOptions {
  /** `file://` only in tests (unpackaged app with `WALPH_HIDDEN_WINDOWS=1`). */
  allowFile?: boolean
}

const invalid = (reason: string): Extract<CloneUrlCheck, { ok: false }> => ({
  ok: false,
  error: t().git.clone.url.invalid(reason)
})

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i
// `ext::`, `fd::`, `<transport>::<address>` (remote helpers).
const REMOTE_HELPER = /^([a-z0-9][a-z0-9+.-]*)::/i
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i
// user@host:path, host without a leading `-` (avoids `-oProxyCommand`) and without `//` right after the colon.
const SCP_LIKE = /^([a-z0-9_][a-z0-9._-]*)@([a-z0-9][a-z0-9.-]*):(?!\/\/)(.+)$/i
// Invalid in folder names on Windows (and `/`, `\` on all).
const BAD_NAME_CHARS = /[\\/:*?"<>|]/

/** Last path segment without trailing `/` and without `.git`; `null` if it does not give a safe folder name. */
export function folderNameFromPath(path: string): string | null {
  const segments = path.split('/').filter((s) => s.length > 0)
  let name = segments[segments.length - 1] ?? ''
  try {
    name = decodeURIComponent(name)
  } catch {
    // Stray `%`: uses the text as it came
  }
  if (name.toLowerCase().endsWith('.git')) name = name.slice(0, -4)
  if (!name || name === '.' || name === '..' || name.length > MAX_NAME_LENGTH) return null
  if (BAD_NAME_CHARS.test(name) || hasControl(name) || /[. ]$/.test(name)) return null
  return name
}

/** Internal result: besides the contract, the normalized URL that actually goes to git. */
export type CloneUrlResolved = { ok: true; name: string; url: string } | Extract<CloneUrlCheck, { ok: false }>

function checkParsed(url: URL, scheme: 'https' | 'ssh' | 'file', normalized: string): CloneUrlResolved {
  if (scheme !== 'file') {
    const host = url.hostname
    // `ssh://-oProxyCommand=…@host/` and variations: no host or user that ssh would read as an option.
    if (!host || host.startsWith('-') || decodeURIComponent(url.username).startsWith('-')) {
      return invalid(t().git.clone.url.badHost)
    }
  }
  const name = folderNameFromPath(url.pathname)
  if (!name) return invalid(t().git.clone.url.noFolderName)
  return { ok: true, name, url: normalized }
}

/** Public contract (renderer): only the folder name. */
export function checkCloneUrl(input: string, options: CloneUrlOptions = {}): CloneUrlCheck {
  const r = resolveCloneUrl(input, options)
  return r.ok ? { ok: true, name: r.name } : r
}

/** Validates and returns the URL with a lowercase scheme: git's `GIT_ALLOW_PROTOCOL` is case-sensitive. */
export function resolveCloneUrl(input: string, options: CloneUrlOptions = {}): CloneUrlResolved {
  if (typeof input !== 'string') return invalid(t().git.clone.url.notAString)
  const url = input.trim()
  if (!url) return invalid(t().git.clone.url.empty)
  if (url.length > MAX_URL_LENGTH) return invalid(t().git.clone.url.tooLong)
  if (url.startsWith('-')) return invalid(t().git.clone.url.dashPrefix)

  const helper = REMOTE_HELPER.exec(url)
  if (helper) return invalid(t().git.clone.url.transportNotAllowed(helper[1] ?? ''))
  if (/\s/.test(url) || hasControl(url)) return invalid(t().git.clone.url.controlChars)

  const scheme = SCHEME.exec(url)
  if (scheme) {
    const schemeName = scheme[1] ?? ''
    const name = schemeName.toLowerCase()
    if (name === 'file') {
      if (!options.allowFile) return invalid(t().git.clone.url.fileNotAllowed)
    } else if (name !== 'https' && name !== 'ssh') {
      return invalid(t().git.clone.url.protocolNotAllowed(name))
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return invalid(t().git.clone.url.unparseable)
    }
    return checkParsed(parsed, name, name + url.slice(schemeName.length))
  }

  if (
    url.startsWith('/') ||
    url.startsWith('\\') ||
    url.startsWith('.') ||
    url.startsWith('~') ||
    WINDOWS_DRIVE.test(url)
  ) {
    return invalid(t().git.clone.url.localPath)
  }

  const scp = SCP_LIKE.exec(url)
  if (scp) {
    const name = folderNameFromPath(scp[3] ?? '')
    return name ? { ok: true, name, url } : invalid(t().git.clone.url.noFolderName)
  }

  return invalid(t().git.clone.url.unsupported)
}
