import { useScrollMemory } from '../common/useScrollMemory'
import { memo, useEffect, useMemo, useRef } from 'react'
import type { SearchMatch } from '@shared/types'
import { createReplacer, type Replacer } from '@shared/searchReplace'
import { useStore } from '../../store'
import { Toggle } from '../common/Toggle'
import { useRequest } from '../common/useRequest'
import {
  clearSearch,
  collapseAllResults,
  consumeFocusReplace,
  expandAllResults,
  openSearchMatch,
  refreshSearch,
  replaceAllResults,
  replaceInResults,
  selectSearchLoading,
  setSearchFilter,
  setSearchQuery,
  setSearchReplace,
  toggleFiltersOpen,
  toggleReplaceOpen,
  toggleResultFile,
  toggleSearchOption
} from '../../searchActions'
import { relativeTo } from '../../lib/path'
import { Chevron } from '../common/Chevron'
import { FileTreeRow } from '../common/FileTreeRow'
import { IconButton } from '../common/IconButton'
import { isItemRow, treeRowProps, useGroupedTree } from '../common/useGroupedTree'
import { useT } from '../../i18n'

const CONTEXT_CHARS = 40

function MatchLine({ match, replacement }: { match: SearchMatch; replacement: string | null }) {
  const start = Math.max(0, match.column - CONTEXT_CHARS)
  const before = (start > 0 ? '…' : '') + match.text.slice(start, match.column).trimStart()
  const hit = match.text.slice(match.column, match.column + match.length)
  const after = match.text.slice(match.column + match.length)
  return (
    <span className="match-text">
      {before}
      {replacement === null ? (
        <mark>{hit}</mark>
      ) : (
        <>
          <mark className="match-old">{hit}</mark>
          <mark className="match-new">{replacement}</mark>
        </>
      )}
      {after}
    </span>
  )
}

interface SearchGroup {
  path: string
  /** Path relative to the folder, computed once per result. */
  rel: string
  items: SearchMatch[]
}

const MatchRow = memo(function MatchRow({
  rowKey,
  tabStop,
  path,
  index,
  selected,
  match,
  rel,
  replacer,
  canReplace,
  busy
}: {
  rowKey: string
  tabStop: boolean
  path: string
  index: number
  selected: boolean
  match: SearchMatch
  rel: string
  /** `null` = no preview (replace field closed or invalid regex). */
  replacer: Replacer | null
  canReplace: boolean
  /** Searching or replacing: the replace actions are disabled. */
  busy: boolean
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div
      ref={ref}
      {...treeRowProps(rowKey, tabStop)}
      role="treeitem"
      aria-level={2}
      aria-selected={selected}
      className={`tree-row search-match ${selected ? 'selected' : ''}`}
      title={`${rel}:${match.line}`}
    >
      <MatchLine match={match} replacement={replacer ? replacer(match.text, match) : null} />
      {canReplace && (
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          <IconButton
            icon="codicon-replace"
            label={t.search.view.replace}
            disabled={busy}
            onClick={() => void replaceInResults({ kind: 'match', path, index })}
          />
        </span>
      )}
    </div>
  )
})

const FileRow = memo(function FileRow({
  rowKey,
  tabStop,
  root,
  group,
  open,
  canReplace,
  busy
}: {
  rowKey: string
  tabStop: boolean
  root: string
  group: SearchGroup
  open: boolean
  canReplace: boolean
  busy: boolean
}) {
  const t = useT()
  const { path } = group
  return (
    <FileTreeRow
      {...treeRowProps(rowKey, tabStop)}
      role="treeitem"
      aria-level={1}
      aria-expanded={open}
      className="search-file"
      title={group.rel}
      path={path}
      root={root}
      open={open}
      actions={
        canReplace && (
          <IconButton
            icon="codicon-replace-all"
            label={t.search.view.replaceInFile}
            disabled={busy}
            onClick={() => void replaceInResults({ kind: 'file', path })}
          />
        )
      }
      badge={<span className="count-badge">{group.items.length}</span>}
    />
  )
})

const matchKey = (m: SearchMatch): string => `${m.line}:${m.column}`

export function SearchView() {
  const t = useT()
  const root = useStore((s) => s.root)
  const query = useStore((s) => s.search.query)
  const replace = useStore((s) => s.search.replace)
  const replaceOpen = useStore((s) => s.search.replaceOpen)
  const filtersOpen = useStore((s) => s.search.filtersOpen)
  const options = useStore((s) => s.search.options)
  const answer = useStore((s) => s.search.answer)
  const replacing = useStore((s) => s.search.replacing)
  const loading = useStore(selectSearchLoading)
  const allCollapsed = useStore(
    (s) =>
      !!s.search.answer?.result.files.length && s.search.answer.result.files.every((f) => s.search.collapsed[f.path])
  )
  const [resultsRef, onResultsScroll] = useScrollMemory<HTMLDivElement>(`${root}:search`)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useRequest('searchFocus', () => {
    const target = useStore.getState().search.focusReplace ? replaceRef.current : inputRef.current
    target?.focus()
    target?.select()
    consumeFocusReplace()
  })

  // Without a query the old result is not shown (clearing the field discards it).
  const result = root && query ? (answer?.result ?? null) : null
  const total = result?.totalMatches ?? 0
  // Preview and actions use the query that produced the shown result.
  const replacer = useMemo(
    () => (replaceOpen && answer ? createReplacer(answer.query, replace, answer.options) : null),
    [replaceOpen, answer, replace]
  )
  const canReplace = replaceOpen && !result?.error
  const busy = loading || replacing
  const collapsed = useStore((s) => s.search.collapsed)
  const cursor = useStore((s) => s.search.cursor)
  const groups = useMemo<SearchGroup[]>(
    () =>
      root && result
        ? result.files.map((f) => ({ path: f.path, rel: relativeTo(root, f.path), items: f.matches }))
        : [],
    [root, result]
  )
  const { rows, listProps, tabStop, isOpen } = useGroupedTree({
    groups,
    visible: false,
    itemKey: matchKey,
    collapsed,
    onToggleGroup: toggleResultFile,
    onActivateItem: (group, match) => openSearchMatch(group.path, group.items.indexOf(match))
  })
  const canReplaceAll = canReplace && total > 0 && !busy

  return (
    <div className="sidebar-view">
      <div className="sidebar-title">
        <span>{t.common.search}</span>
        <div className="actions">
          <IconButton
            icon="codicon-refresh"
            label={t.common.refresh}
            disabled={!root || !query}
            onClick={refreshSearch}
          />
          <IconButton
            icon="codicon-clear-all"
            label={t.search.view.clearResults}
            disabled={!query && !answer}
            onClick={clearSearch}
          />
          <IconButton
            icon={allCollapsed ? 'codicon-expand-all' : 'codicon-collapse-all'}
            label={allCollapsed ? t.search.view.expandAll : t.search.view.collapseAll}
            disabled={!result?.files.length}
            onClick={allCollapsed ? expandAllResults : collapseAllResults}
          />
        </div>
      </div>
      <div className="search-box">
        <div className="search-fields">
          <button
            className="search-replace-toggle"
            title={t.search.view.toggleReplace}
            aria-label={t.search.view.toggleReplace}
            aria-expanded={replaceOpen}
            disabled={!root}
            onClick={toggleReplaceOpen}
          >
            <Chevron open={replaceOpen} />
          </button>
          <div className="search-inputs">
            <div className="search-input">
              <input
                ref={inputRef}
                aria-label={t.common.search}
                placeholder={root ? t.common.search : t.search.view.openFolder}
                disabled={!root}
                value={query}
                onChange={(e) => setSearchQuery(e.target.value)}
                spellCheck={false}
              />
              <Toggle
                active={options.caseSensitive}
                label={t.search.view.matchCase}
                icon="codicon-case-sensitive"
                onClick={() => toggleSearchOption('caseSensitive')}
              />
              <Toggle
                active={options.wholeWord}
                label={t.search.view.wholeWord}
                icon="codicon-whole-word"
                onClick={() => toggleSearchOption('wholeWord')}
              />
              <Toggle
                active={options.regex}
                label={t.search.view.regex}
                icon="codicon-regex"
                onClick={() => toggleSearchOption('regex')}
              />
            </div>
            {replaceOpen && (
              <div className="search-input">
                <input
                  ref={replaceRef}
                  aria-label={t.search.view.replace}
                  placeholder={t.search.view.replace}
                  disabled={!root}
                  value={replace}
                  onChange={(e) => setSearchReplace(e.target.value)}
                  onKeyDown={(e) => {
                    // Local shortcut of the field (not an app shortcut).
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      if (canReplaceAll) replaceAllResults()
                    }
                  }}
                  spellCheck={false}
                />
                <IconButton
                  icon="codicon-replace-all"
                  label={t.search.view.replaceAll}
                  disabled={!canReplaceAll}
                  onClick={replaceAllResults}
                />
              </div>
            )}
            <div className="search-filters-toggle">
              <Toggle
                active={filtersOpen}
                label={t.search.view.toggleDetails}
                icon="codicon-ellipsis"
                onClick={toggleFiltersOpen}
              />
            </div>
            {filtersOpen && (
              <>
                <label className="search-filter">
                  <span>{t.search.view.include}</span>
                  <input
                    aria-label={t.search.view.includeLabel}
                    placeholder={t.search.view.includePlaceholder}
                    disabled={!root}
                    value={options.include ?? ''}
                    onChange={(e) => setSearchFilter('include', e.target.value)}
                    spellCheck={false}
                  />
                </label>
                <label className="search-filter">
                  <span>{t.search.view.exclude}</span>
                  <input
                    aria-label={t.search.view.excludeLabel}
                    placeholder={t.search.view.excludePlaceholder}
                    disabled={!root}
                    value={options.exclude ?? ''}
                    onChange={(e) => setSearchFilter('exclude', e.target.value)}
                    spellCheck={false}
                  />
                </label>
              </>
            )}
          </div>
        </div>
        {loading && <div className="search-summary">{t.search.view.searching}</div>}
        {!loading && result?.error && <div className="search-summary error">{result.error}</div>}
        {!loading && result && !result.error && (
          <div className="search-summary">
            {total === 0
              ? t.search.view.noResults
              : t.search.view.summary(total, result.truncated, result.files.length)}
          </div>
        )}
      </div>
      <div className="search-results" ref={resultsRef} onScroll={onResultsScroll}>
        <div {...listProps} role="tree" aria-label={t.search.view.resultsLabel}>
          {root &&
            rows.map((row) => {
              if (!isItemRow(row))
                return (
                  <FileRow
                    key={row.key}
                    rowKey={row.key}
                    tabStop={row.key === tabStop}
                    root={root}
                    group={row.group}
                    open={isOpen(row.group.path)}
                    canReplace={canReplace}
                    busy={busy}
                  />
                )
              const { path } = row.group
              return (
                <MatchRow
                  key={row.key}
                  rowKey={row.key}
                  tabStop={row.key === tabStop}
                  path={path}
                  index={row.index}
                  selected={cursor?.path === path && cursor.index === row.index}
                  match={row.item}
                  rel={row.group.rel}
                  replacer={replacer}
                  canReplace={canReplace}
                  busy={busy}
                />
              )
            })}
        </div>
      </div>
    </div>
  )
}
