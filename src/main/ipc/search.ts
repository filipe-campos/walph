import { type WebContents } from 'electron'
import { describeRgSpawnError, runRg } from '../search/rg'
import type { GroupProcess } from '../process/spawnGroup'
import { createLineSplitter } from '../util/lineSplitter'
import { parseRgLine } from '../search/parseRipgrep'
import { buildGlobArgs } from '../search/searchGlobs'
import { assertOwnRoot } from '../window/ownRoot'
import { createViewRegistry } from '../window/viewResources'
import { parseOptions, parseQuery, parseReplaceRequest } from '../search/validate'
import { replaceAll } from '../search/replaceFiles'
import { getEffectiveSettings } from '../settings/state'
import { activeSearchExcludes } from '@shared/settings'
import { t } from '@shared/i18n'
import { comparePaths } from '@shared/pathCompare'
import type { SearchFileResult, SearchOptions, SearchResult } from '@shared/types'
import { omitUndefined } from '@shared/omitUndefined'
import { handle } from './typed'

const MAX_MATCHES = 2000
/** A `--json` line with many matches fits easily; the cap only guards against an endless line. */
const MAX_LINE = 4 * 1024 * 1024

// One rg per view: a new search (fast typing) kills the previous one, and a reload or a renderer crash cancels it.
const searches = createViewRegistry<GroupProcess>({ key: 'search', dispose: (rg) => void rg.kill() })

function cancelSearch(owner: WebContents): void {
  void searches.disposeAll(owner)
}

export function killAllSearches(): void {
  searches.disposeAllSync()
}

function describeRgError(stderr: string): string {
  const detail = stderr.trim()
  if (!detail) return t().search.errors.failedGeneric
  return /regex parse error|error parsing regex|regex error/i.test(detail)
    ? t().search.errors.invalidRegex(detail)
    : t().search.errors.failed(detail)
}

async function find(owner: WebContents, root: string, query: string, options: SearchOptions): Promise<SearchResult> {
  cancelSearch(owner)
  const globs = buildGlobArgs({
    ...omitUndefined({ include: options.include, exclude: options.exclude }),
    settingsExcludes: activeSearchExcludes(getEffectiveSettings(owner)),
    platform: process.platform
  })
  const args = [
    '--json',
    ...globs,
    '--max-columns=500',
    '--max-filesize=2M',
    options.caseSensitive ? '--case-sensitive' : '--ignore-case',
    ...(options.regex ? [] : ['--fixed-strings']),
    ...(options.wholeWord ? ['--word-regexp'] : []),
    '--',
    query,
    '.'
  ]
  const files = new Map<string, SearchFileResult>()
  let totalMatches = 0
  let truncated = false
  const lines = createLineSplitter(MAX_LINE)

  const onLine = (line: string, stop: () => void): void => {
    if (truncated) return
    const parsed = parseRgLine(line, root)
    if (!parsed) return
    let file = files.get(parsed.path)
    if (!file) {
      file = { path: parsed.path, matches: [] }
      files.set(parsed.path, file)
    }
    for (const match of parsed.matches) {
      file.matches.push(match)
      if (++totalMatches >= MAX_MATCHES) {
        truncated = true
        stop()
        break
      }
    }
  }

  const rg = await runRg(args, {
    cwd: root,
    owner: searches.scope(owner),
    onStdout: (chunk, stop) => {
      for (const line of lines.feed(chunk)) onLine(line, stop)
    }
  })
  for (const line of lines.flush()) onLine(line, () => undefined)

  if (rg.outcome === 'cancelled') return { files: [], totalMatches: 0, truncated: false, cancelled: true }
  if (rg.outcome === 'spawnError' && rg.spawnError) {
    const m = t().search.errors
    const error = describeRgSpawnError(rg.spawnError, {
      notFound: m.rgNotFound,
      noPermission: m.rgNoPermission,
      failed: m.failed
    })
    return { files: [], totalMatches: 0, truncated: false, error }
  }
  // Code 1 = no results; 2 = error (e.g. invalid regex).
  const error = rg.outcome === 'error' ? describeRgError(rg.stderr) : undefined
  // rg scans in parallel: without sorting, the file order changes from one search to the next.
  const sorted = [...files.values()].sort((a, b) => comparePaths(a.path, b.path))
  return { files: sorted, totalMatches, truncated, error }
}

function ownRoot(owner: WebContents, root: unknown): string {
  return assertOwnRoot(owner, root, t().search.errors.onlyOwnFolder)
}

export function registerSearchHandlers(): void {
  handle('search:find', (e, root: unknown, query: unknown, options: unknown) => {
    const own = ownRoot(e.sender, root)
    return find(e.sender, own, parseQuery(query), parseOptions(options))
  })

  handle('search:replace', (e, root: unknown, request: unknown) => {
    const own = ownRoot(e.sender, root)
    return replaceAll(own, parseReplaceRequest(request))
  })
}
