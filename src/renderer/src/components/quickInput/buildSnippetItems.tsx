// Items of the snippet and Emmet pickers: Insert Snippet, Configure Snippets, new file name and
// "Wrap with Abbreviation". Pure functions over the received context.
import { compareText, t } from '@shared/i18n'
import type { SnippetFile, UserSnippet } from '@shared/types'
import { rankByLabel } from '../../lib/rankByLabel'
import { knownLanguages, languageIdOf } from '../../lib/languageId'
import { basename } from '../../lib/path'
import { snippetsForLanguage } from '../../lib/userSnippets'
import { askSnippetFileName, emmetWrap, insertSnippet, openSnippetFile } from '../../snippetActions'
import type { QuickItem, QuickList } from './buildItems'
import { highlight } from './highlight'

export function buildInsertSnippetList(
  text: string,
  ctx: { path: string | null; chosen: string | null; snippets: readonly UserSnippet[] }
): QuickList {
  const m = t().snippets.pick
  if (!ctx.path) return { items: [], message: m.openFile }
  const available = snippetsForLanguage(ctx.snippets, languageIdOf(ctx.path, ctx.chosen))
  if (available.length === 0) return { items: [], message: m.none }
  const items = rankByLabel(available, text, (s) => s.name, {
    sort: true,
    tiebreak: (a, b) => compareText(a.name, b.name)
  }).map(({ entry, matches }): QuickItem => ({
    key: `${entry.file}:${entry.name}`,
    icon: 'codicon-symbol-snippet',
    label: highlight(entry.name, new Set(matches), 0),
    tag: [entry.prefixes.join(', '), entry.source === 'workspace' ? m.workspace : ''].filter(Boolean).join(' · '),
    run: () => insertSnippet(entry)
  }))
  return { items, message: m.noMatch }
}

interface ConfigureEntry {
  key: string
  label: string
  group: string
  icon: string
  tag?: string
  run: () => void
}

export function buildConfigureSnippetsList(
  text: string,
  ctx: { files: readonly SnippetFile[]; root: string | null; path: string | null; chosen: string | null }
): QuickList {
  const m = t().snippets.pick
  const existing = new Set(ctx.files.filter((f) => f.kind === 'language').map((f) => f.name))
  const current = ctx.path ? languageIdOf(ctx.path, ctx.chosen) : null
  const languages = [{ id: 'plaintext', name: t().editor.language.plainText }, ...knownLanguages()]
    .sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : compareText(a.name, b.name)))
    .map((l): ConfigureEntry => ({
      key: `language:${l.id}`,
      label: `${l.name} (${l.id})`,
      group: m.languages,
      icon: existing.has(l.id) ? 'codicon-file-code' : 'codicon-symbol-snippet',
      ...(l.id === current && { tag: t().quickInput.current }),
      run: () => void openSnippetFile('language', l.id)
    }))
  const files = ctx.files
    .filter((f) => f.kind !== 'language')
    .map((f): ConfigureEntry => ({
      key: `file:${f.path}`,
      label: basename(f.path),
      group: m.existing,
      icon: 'codicon-file-code',
      tag: f.kind === 'workspace' ? m.workspace : m.user,
      run: () => void openSnippetFile(f.kind, f.name)
    }))
  const create: ConfigureEntry[] = [
    {
      key: 'new:global',
      label: m.newGlobal,
      group: m.newFile,
      icon: 'codicon-new-file',
      run: () => askSnippetFileName('global')
    },
    ...(ctx.root
      ? [
          {
            key: 'new:workspace',
            label: m.newWorkspace(basename(ctx.root)),
            group: m.newFile,
            icon: 'codicon-new-file',
            run: () => askSnippetFileName('workspace')
          }
        ]
      : [])
  ]
  // Without sorting by score: the sections must stay contiguous for the headers.
  const items = rankByLabel([...files, ...create, ...languages], text, (e) => e.label, { sort: false }).map(
    ({ entry, matches }): QuickItem => ({
      key: entry.key,
      icon: entry.icon,
      group: entry.group,
      label: highlight(entry.label, new Set(matches), 0),
      tag: entry.tag,
      run: entry.run
    })
  )
  return { items, message: m.noMatch }
}

export function buildSnippetFileNameList(text: string, kind: 'global' | 'workspace'): QuickList {
  const name = text.trim().replace(/\.code-snippets$/i, '')
  const m = t().snippets.pick
  if (!name) return { items: [], message: m.fileName }
  return {
    items: [
      {
        key: 'create',
        icon: 'codicon-new-file',
        label: m.createFile(`${name}.code-snippets`),
        run: () => void openSnippetFile(kind, name)
      }
    ]
  }
}

export function buildEmmetWrapList(text: string): QuickList {
  const abbreviation = text.trim()
  const m = t().snippets.emmet
  if (!abbreviation) return { items: [], message: m.wrapPrompt }
  return {
    items: [
      {
        key: 'wrap',
        icon: 'codicon-symbol-snippet',
        label: m.wrapWith(abbreviation),
        run: () => emmetWrap(abbreviation)
      }
    ]
  }
}
