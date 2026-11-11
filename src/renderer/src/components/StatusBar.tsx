import { useMemo, useSyncExternalStore } from 'react'
import { findActiveTab } from '../lib/findActiveTab'
import { useShallow } from 'zustand/react/shallow'
import { selectGitOperation, useStore } from '../store'
import type { Messages } from '@shared/i18n'
import type { LspServerState, LspServerStatus } from '@shared/types'
import { executeCommand } from '../commands/registry'
import { useShortcutLabel } from './common/useShortcutLabel'
import { useNow } from './common/useNow'
import { encodingLabel } from '../lib/encodings'
import { languageName } from '../lib/language'
import { serverForPath } from '../lib/lspServer'
import { countProblems } from '../lib/problems'
import { formatDate, relativeTime } from '../lib/relativeTime'
import { authorInitials, selectedLabel, syncTooltip } from '../lib/syncLabel'
import { formatIndent, type Indent } from '../lib/textFormat'
import { revealLabel, splitPathParts, tildePath } from '../lib/tildePath'
import { useT } from '../i18n'
import { Icon } from './common/Icon'
import type { MenuEntry } from './common/MenuList'
import { StatusMenu } from './common/StatusMenu'
import { copyPathToClipboard, revealPath } from '../explorerFsActions'
import { GIT_OPERATION_LABELS, openBranchPicker, syncChanges } from '../gitActions'
import { showCommitInHistory } from '../gitHistoryActions'
import { blameVersion, subscribeBlameVersion } from '../gitBlameActions'
import { blameAtLine } from './editor/gitBlame'
import { currentState } from './editor/groupViews'
import { showPanel, toggleTerminal, togglePanelView } from '../terminalActions'
import {
  convertTabIndent,
  openEncodingPicker,
  openLanguagePicker,
  setTabIndent,
  toggleActiveEol
} from '../tabFormatActions'

const { platform, homeDir } = window.api

const SERVER_ICON: Record<LspServerState, string> = {
  starting: 'codicon-sync codicon-modifier-spin',
  ready: 'codicon-check',
  error: 'codicon-error'
}

function serverTitle(t: Messages, server: LspServerStatus): string {
  const m = t.app.statusBar
  return m.serverTitle(server.name, m.server[server.state], server.message ?? null)
}

/**
 * Project path: `~` instead of the home, upper folders dimmed (cut from the start with `direction: rtl`) and the
 * whole project name. The final separator goes between LRM marks: without them, in rtl text, it would be drawn on the
 * wrong side (neutral character). The tooltip has the full path; the click opens the reveal/copy menu.
 */
function ProjectPath({ root }: { root: string }) {
  const t = useT()
  const { parent, leaf } = splitPathParts(tildePath(root, homeDir, platform))
  const items: MenuEntry[] = [
    { id: 'reveal', label: revealLabel(platform), onSelect: () => revealPath(root) },
    { id: 'copyPath', label: t.app.copyPath, onSelect: () => copyPathToClipboard(root) }
  ]
  return (
    <StatusMenu status="path" label={t.app.statusBar.projectPath(root)} title={root} itemClass="s-path" items={items}>
      <Icon name="folder" />
      {parent && <span className="status-path-parent">{`‎${parent}‎`}</span>}
      <span className="status-path-leaf">{leaf}</span>
    </StatusMenu>
  )
}

function LastCommit() {
  const t = useT()
  const commit = useStore((s) => s.lastCommit)
  const now = useNow(60_000)
  if (!commit) return null
  const detail = commit.message?.trim() || commit.subject
  const when = relativeTime(commit.date, now)
  return (
    <button
      type="button"
      className="status-item status-commit s-commit"
      data-status="commit"
      title={t.app.statusBar.commitTitle(commit.shortHash, commit.hash, commit.author, formatDate(commit.date), detail)}
      aria-label={t.app.statusBar.lastCommit(commit.shortHash, commit.author, when, commit.subject)}
      onClick={() => showCommitInHistory(commit.hash)}
    >
      <span className="status-avatar" aria-hidden>
        {authorInitials(commit.author)}
      </span>
      <span className="status-commit-author s-commit-author">
        {t.app.statusBar.commitAuthorWhen(commit.author, when)}
      </span>
      <span className="status-commit-message s-commit-message">{commit.subject}</span>
    </button>
  )
}

/** Blame of the cursor line (`git.blame.statusBar`); the click shows the commit in History. */
function BlameItem({ tabId, line }: { tabId: string; line: number }) {
  const t = useT()
  const m = t.git.blame
  // Rereads when a new blame arrives; moving the cursor already redraws through `line`.
  useSyncExternalStore(subscribeBlameVersion, blameVersion)
  const now = useNow(60_000)
  const state = currentState(tabId)
  const blame = state ? blameAtLine(state, line) : null
  if (!blame) return null
  if (blame === 'uncommitted') {
    return (
      <span className="status-item status-blame" data-status="blame">
        <i className="codicon codicon-git-commit" aria-hidden /> {m.uncommitted}
      </span>
    )
  }
  const when = relativeTime(blame.date, now)
  return (
    <button
      type="button"
      className="status-item status-blame"
      data-status="blame"
      title={m.title(blame.hash.slice(0, 7), blame.author, formatDate(blame.date), blame.summary)}
      aria-label={m.statusAria(blame.author, when, blame.summary)}
      onClick={() => showCommitInHistory(blame.hash)}
    >
      <i className="codicon codicon-git-commit" aria-hidden /> {m.status(blame.author, when)}
    </button>
  )
}

function IndentItem({ tabId, indent }: { tabId: string; indent: Indent }) {
  const t = useT()
  const m = t.app.statusBar
  // "Starting" size when switching to spaces: the tab's, otherwise `editor.tabSize`.
  const startSize = (): number =>
    indent.kind === 'spaces' ? indent.size : useStore.getState().settings['editor.tabSize']
  const spaces = indent.kind === 'spaces'
  const items: MenuEntry[] = [
    {
      id: 'indentSpaces',
      label: m.indentSpaces,
      checked: spaces,
      onSelect: () => setTabIndent(tabId, { kind: 'spaces', size: startSize() })
    },
    {
      id: 'indentTabs',
      label: m.indentTabs,
      checked: !spaces,
      onSelect: () => setTabIndent(tabId, { kind: 'tabs' })
    },
    ...[2, 4, 8].map((size, i) => ({
      id: `size${size}`,
      label: m.indentSize(size),
      checked: spaces && indent.size === size,
      // The size only exists for spaces; with tabs the width comes from `editor.tabSize`.
      disabled: !spaces,
      separator: i === 0,
      onSelect: () => setTabIndent(tabId, { kind: 'spaces', size })
    })),
    {
      id: 'convertSpaces',
      label: m.convertToSpaces,
      separator: true,
      onSelect: () => convertTabIndent(tabId, 'spaces')
    },
    { id: 'convertTabs', label: m.convertToTabs, onSelect: () => convertTabIndent(tabId, 'tabs') }
  ]
  const text = formatIndent(indent)
  return (
    <StatusMenu
      status="indent"
      label={m.indent(text)}
      title={m.indentTitle(text)}
      itemClass="s-indent"
      align="right"
      items={items}
    >
      {text}
    </StatusMenu>
  )
}

export function StatusBar() {
  const t = useT()
  const m = t.app.statusBar
  const terminalShortcut = useShortcutLabel('terminal.toggle')
  const goToLineShortcut = useShortcutLabel('editor.goToLine')
  const git = useStore((s) => s.git)
  const dirty = useStore((s) => (s.git?.files.length ?? 0) > 0)
  const operation = useStore(selectGitOperation)
  const gitBusy = useStore((s) => s.gitBusy)
  const hasCommit = useStore((s) => !!s.lastCommit)
  // Primitive strings/numbers: the selector does not trigger a render on every edit, only when the value changes.
  const line = useStore((s) => s.cursor?.line ?? 0)
  const column = useStore((s) => s.cursor?.column ?? 0)
  const selected = useStore((s) => s.cursor?.selected ?? 0)
  const root = useStore((s) => s.root)
  const hasRoot = !!root
  const blameOn = useStore((s) => s.settings['git.blame.statusBar'])
  const problemsShortcut = useShortcutLabel('view.problems')
  const errors = useStore((s) => countProblems(s.diagnostics).errors)
  const warnings = useStore((s) => countProblems(s.diagnostics).warnings)
  // The active tab is found only once; the result is compared field by field (the object only changes if a field does).
  // Server of the active file (by extension): the object only changes when main publishes a new status.
  const { server, activePath, activeId, loaded, isFile, indent, eol, encoding, chosenLanguage } = useStore(
    useShallow((s) => {
      const tab = findActiveTab(s)
      const file = tab?.kind === 'file' ? tab : null
      return {
        server: file ? serverForPath(s.lspStatuses, file.path) : null,
        activePath: tab?.path,
        activeId: tab?.id,
        // `eol` only exists after the file is read: a tab that failed to load does not show the previous cursor.
        loaded: !!file && file.eol !== null,
        isFile: !!file,
        indent: file ? file.indent : null,
        eol: file ? file.eol : null,
        encoding: file ? file.encoding : null,
        chosenLanguage: file ? file.language : null
      }
    })
  )
  const language = useMemo(
    () => (activePath ? languageName(activePath, chosenLanguage) : null),
    [activePath, chosenLanguage]
  )

  const cursorText = selected > 0 ? m.cursorSelection(line, column, selectedLabel(selected)) : m.cursor(line, column)
  const goToLineTitle = goToLineShortcut ? t.common.withShortcut(m.goToLine, goToLineShortcut) : m.goToLine
  const otherEol = eol === 'CRLF' ? 'LF' : 'CRLF'

  return (
    <footer className="status-bar">
      <div className="status-left">
        {root && <ProjectPath root={root} />}
        {git?.isRepo && (
          <>
            <button
              className="status-item status-branch"
              data-status="branch"
              title={dirty ? m.changeBranchDirty : m.changeBranch}
              disabled={gitBusy}
              onClick={openBranchPicker}
            >
              <Icon name="branch" /> <span className="status-branch-name">{git.branch ?? m.detachedHead}</span>
              {dirty && (
                // Outside the name: the name's ellipsis must not eat the asterisk.
                <span className="status-branch-dirty" role="img" aria-label={m.dirty}>
                  *
                </span>
              )}
            </button>
            {git.branch && git.upstream ? (
              // Stays visible during the operation: the arrows "breathe" (CSS) and the text goes to screen readers.
              <button
                className={`status-item status-sync${operation ? ' syncing' : ''}`}
                data-status="sync"
                data-operation={operation ?? undefined}
                title={
                  operation
                    ? `${GIT_OPERATION_LABELS[operation]} ${syncTooltip(git.ahead, git.behind, git.upstream)}`
                    : m.syncTitle(syncTooltip(git.ahead, git.behind, git.upstream))
                }
                aria-label={
                  operation
                    ? GIT_OPERATION_LABELS[operation]
                    : m.syncAria(git.upstream, syncTooltip(git.ahead, git.behind, git.upstream))
                }
                disabled={gitBusy || !!operation}
                onClick={() => void syncChanges()}
              >
                <span className={git.behind > 0 ? 'pending' : undefined}>
                  <Icon name="arrowDown" />
                  {git.behind}
                </span>
                <span className={git.ahead > 0 ? 'pending' : undefined}>
                  <Icon name="arrowUp" />
                  {git.ahead}
                </span>
                {operation && (
                  <span className="sr-only" role="status">
                    {GIT_OPERATION_LABELS[operation]}
                  </span>
                )}
              </button>
            ) : operation ? (
              <span className="status-item" data-status="sync" role="status">
                <i className="codicon codicon-sync codicon-modifier-spin" /> {GIT_OPERATION_LABELS[operation]}
              </span>
            ) : (
              git.branch && (
                <button
                  className="status-item"
                  data-status="sync"
                  title={m.publishBranchTitle}
                  disabled={gitBusy}
                  onClick={() => void syncChanges()}
                >
                  <i className="codicon codicon-cloud-upload" /> {m.publishBranch}
                </button>
              )
            )}
          </>
        )}
        {hasRoot && (
          <button
            className="status-item"
            data-status="problems"
            title={problemsShortcut ? t.common.withShortcut(m.problems, problemsShortcut) : m.problems}
            onClick={() => togglePanelView('problems')}
          >
            <i className="codicon codicon-error" /> {errors} <i className="codicon codicon-warning" /> {warnings}
          </button>
        )}
        {git?.isRepo && hasCommit && <LastCommit />}
      </div>
      <div className="status-right">
        {git?.isRepo && blameOn && isFile && loaded && activeId && line > 0 && (
          <BlameItem tabId={activeId} line={line} />
        )}
        {isFile && loaded && line > 0 && (
          <button
            className="status-item"
            data-status="cursor"
            title={goToLineTitle}
            aria-label={`${cursorText}. ${goToLineTitle}`}
            onClick={() => void executeCommand('editor.goToLine')}
          >
            {cursorText}
          </button>
        )}
        {loaded && activeId && indent && <IndentItem tabId={activeId} indent={indent} />}
        {loaded && encoding && (
          <button
            className="status-item s-encoding"
            data-status="encoding"
            title={m.encodingTitle}
            aria-label={m.encodingAria(encodingLabel(encoding))}
            onClick={openEncodingPicker}
          >
            {encodingLabel(encoding)}
          </button>
        )}
        {loaded && eol && (
          <button
            className="status-item s-eol"
            data-status="eol"
            title={m.eolTitle(eol, otherEol)}
            aria-label={m.eolAria(eol, otherEol)}
            onClick={toggleActiveEol}
          >
            {eol}
          </button>
        )}
        {server && (
          <button
            className={`status-item ${server.state === 'error' ? 'lsp-error' : ''}`}
            data-status="lsp"
            title={serverTitle(t, server)}
            onClick={() => showPanel('output')}
          >
            <i className={`codicon ${SERVER_ICON[server.state]}`} /> {server.name}
          </button>
        )}
        {language &&
          (loaded ? (
            <button
              className="status-item status-language"
              data-status="language"
              title={m.languageTitle}
              aria-label={m.languageAria(language)}
              onClick={openLanguagePicker}
            >
              <span className="status-language-mark" aria-hidden>
                {'{ }'}
              </span>
              {language}
            </button>
          ) : (
            <span className="status-item status-language" data-status="language">
              <span className="status-language-mark" aria-hidden>
                {'{ }'}
              </span>
              {language}
            </span>
          ))}
        <button
          className="status-item"
          data-status="terminal"
          title={terminalShortcut ? t.common.withShortcut(m.toggleTerminal, terminalShortcut) : m.toggleTerminal}
          onClick={toggleTerminal}
        >
          <Icon name="terminal" />
        </button>
      </div>
    </footer>
  )
}
