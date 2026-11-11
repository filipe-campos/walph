// VS Code `languageId` from the editor language (`@codemirror/language-data` name): it is the key of the snippet
// files (`typescript.json`), of `scope` and of `emmet.includeLanguages`.
import { findLanguage, languages } from './language'

const BY_NAME: Record<string, string> = {
  'C++': 'cpp',
  'C#': 'csharp',
  'F#': 'fsharp',
  JSX: 'javascriptreact',
  TSX: 'typescriptreact',
  Shell: 'shellscript',
  'Objective-C': 'objective-c',
  'Objective-C++': 'objective-cpp',
  'Properties files': 'properties',
  'VB.NET': 'vb',
  'Angular Template': 'html',
  'MariaDB SQL': 'sql',
  'MS SQL': 'sql',
  MySQL: 'sql',
  PostgreSQL: 'sql',
  PLSQL: 'sql',
  SQLite: 'sql',
  CQL: 'sql'
}

/** `languageId` of an editor language name (`TypeScript` → `typescript`, `TSX` → `typescriptreact`). */
export function languageIdOfName(name: string): string {
  return (
    BY_NAME[name] ??
    name
      .toLowerCase()
      .replace(/[^a-z0-9+]+/g, '-')
      .replace(/^-|-$/g, '')
  )
}

/** `languageId` of the tab: the chosen language or the one of the file name; `plaintext` without a language. */
export function languageIdOf(path: string, chosen?: string | null): string {
  const desc = findLanguage(path, chosen)
  return desc ? languageIdOfName(desc.name) : 'plaintext'
}

/** Known languages, one per `languageId` (the first name wins), for the "Configure Snippets" picker. */
export function knownLanguages(): { id: string; name: string }[] {
  const byId = new Map<string, string>()
  for (const l of languages) {
    const id = languageIdOfName(l.name)
    if (!byId.has(id)) byId.set(id, l.name)
  }
  return [...byId].map(([id, name]) => ({ id, name }))
}
