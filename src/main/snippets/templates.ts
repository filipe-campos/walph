import { t } from '@shared/i18n'
import type { SnippetFileKind } from '@shared/types'

const comment = (text: string): string =>
  text
    .split('\n')
    .map((line) => `// ${line}`)
    .join('\n')

/** Initial content of a snippet file: the header and an example, all commented out. */
export function snippetFileTemplate(kind: SnippetFileKind, name: string): string {
  const m = t().snippets.templates
  const header = kind === 'language' ? m.language(name) : kind === 'global' ? m.global : m.workspace
  const example = [
    '"Print to console": {',
    ...(kind === 'language' ? [] : ['  "scope": "javascript,typescript",']),
    '  "prefix": "log",',
    '  "body": [',
    `    "console.log('$1');",`,
    '    "$2"',
    '  ],',
    `  "description": ${JSON.stringify(m.exampleDescription)}`,
    '}'
  ]
  return `${comment(header)}
{
${example.map((line) => `  // ${line}`).join('\n')}
}
`
}
