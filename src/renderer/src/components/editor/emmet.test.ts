import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { findLanguage } from '../../lib/language'
import { languageIdOf } from '../../lib/languageId'
import { abbreviationAt } from './emmet'
import { lspTabId } from './lspHost'
import { bindSnippetHost, type SnippetHost } from './snippetHost'

let languageId = 'html'
let settings: ReturnType<SnippetHost['settings']> = {
  'editor.snippetSuggestions': 'inline',
  'emmet.enabled': true,
  'emmet.triggerExpansionOnTab': true,
  'emmet.includeLanguages': {}
}

bindSnippetHost({
  languageId: () => languageId,
  filePath: () => null,
  root: () => null,
  snippetsFor: () => [],
  settings: () => settings
})

afterEach(() => {
  settings = { ...settings, 'emmet.enabled': true, 'emmet.includeLanguages': {} }
})

/** State with the file language and the cursor at the `|` of the text. */
async function stateFor(path: string, text: string): Promise<{ state: EditorState; pos: number }> {
  const pos = text.indexOf('|')
  const doc = text.replace('|', '')
  languageId = languageIdOf(path)
  const support = await findLanguage(path)?.load()
  const state = EditorState.create({ doc, extensions: [lspTabId.of('t'), support ?? []] })
  return { state, pos }
}

async function found(path: string, text: string): Promise<string | null> {
  const { state, pos } = await stateFor(path, text)
  return abbreviationAt(state, pos, true)?.abbreviation ?? null
}

describe('abbreviationAt', () => {
  it('HTML: in text, not in an attribute or comment', async () => {
    expect(await found('/a.html', '<div>\n  ul>li*2|\n</div>')).toBe('ul>li*2')
    expect(await found('/a.html', '<div class="ul>li|"></div>')).toBeNull()
    expect(await found('/a.html', '<!-- ul>li| -->')).toBeNull()
    expect(await found('/a.html', '<p>olá foo|</p>')).toBeNull()
  })

  it('CSS: only at the start of a declaration inside a block', async () => {
    expect(await found('/a.css', 'a {\n  m10|\n}')).toBe('m10')
    expect(await found('/a.css', 'm10|')).toBeNull()
    expect(await found('/a.css', 'a { color: red| }')).toBeNull()
  })

  it('CSS inside <style> in an HTML', async () => {
    const { state, pos } = await stateFor('/a.html', '<style>\na {\n  p10|\n}\n</style>')
    expect(abbreviationAt(state, pos, true)).toMatchObject({ abbreviation: 'p10', syntax: { type: 'stylesheet' } })
  })

  it('TSX: in the JSX content and where an element fits', async () => {
    expect(await found('/a.tsx', 'const x = <div>span.a|</div>')).toBe('span.a')
    expect(await found('/a.tsx', 'const f = () => (\n  div.card|')).toBe('div.card')
    expect(await found('/a.tsx', 'foo.bar|')).toBeNull()
    expect(await found('/a.tsx', 'items.map((x) =>\n  x.id|')).toBeNull()
    expect(await found('/a.tsx', 'const f = () => (\n  Card.big|')).toBe('Card.big')
    expect(await found('/a.tsx', 'const s = "div.a|"')).toBeNull()
  })

  it('TypeScript without JSX has no Emmet, unless `emmet.includeLanguages` maps it', async () => {
    expect(await found('/a.ts', 'const f = () => (\n  div.card|')).toBeNull()
    settings = { ...settings, 'emmet.includeLanguages': { typescript: 'typescriptreact' } }
    expect(await found('/a.ts', 'const f = () => (\n  div.card|')).toBe('div.card')
  })

  it('Vue: in the template', async () => {
    expect(await found('/a.vue', '<template>\n  ul>li|\n</template>')).toBe('ul>li')
  })

  it('turned off by `emmet.enabled`', async () => {
    settings = { ...settings, 'emmet.enabled': false }
    expect(await found('/a.html', 'ul>li|')).toBeNull()
  })

  it('the command accepts words Tab would not expand', async () => {
    const { state, pos } = await stateFor('/a.html', '<p>foo|</p>')
    expect(abbreviationAt(state, pos, false)?.snippet).toBe('<foo>${1}</foo>')
  })
})
