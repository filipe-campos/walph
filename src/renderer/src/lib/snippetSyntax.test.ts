import { describe, expect, it } from 'vitest'
import {
  applyTransform,
  parseSnippet,
  resolveVariables,
  snippetPlainText,
  snippetToCodeMirror,
  usesVariable
} from './snippetSyntax'

const none = (): undefined => undefined
const convert = (src: string, vars: Record<string, string> = {}): string =>
  snippetToCodeMirror(src, (name) => vars[name]).template

describe('snippetToCodeMirror', () => {
  it('keeps text without fields', () => {
    expect(convert('console.log')).toBe('console.log')
  })

  it('converts simple fields and the final $0', () => {
    expect(convert('for ($1; $2; $3) {\n\t$0\n}')).toBe('for (${1}; ${2}; ${3}) \\{\n\t${0}\n\\}')
  })

  it('without $0, the cursor ends at the end', () => {
    expect(convert('foo(${1:a}, ${2:b})')).toBe('foo(${1:a}, ${2:b})${0}')
    expect(convert('no fields')).toBe('no fields')
  })

  it('escapes literal braces of the text', () => {
    expect(convert('if (x) { ${1:y} }$0')).toBe('if (x) \\{ ${1:y} \\}${0}')
  })

  it('choices become the first value and come out in `choices`', () => {
    const out = snippetToCodeMirror('${1|public,private,a\\,b|} x$0', none)
    expect(out.template).toBe('${1:public} x${0}')
    expect(out.choices.get(1)).toEqual(['public', 'private', 'a,b'])
  })

  it('mirrors repeat the text of the first placeholder', () => {
    expect(convert('${1:name} = $1;$0')).toBe('${1:name} = ${1:name};${0}')
  })

  it('flattens nested fields into the default of the outer field', () => {
    expect(convert('${1:a ${2:b} c}$0')).toBe('${1:a b c}${0}')
  })

  it('strips braces and line breaks from the default', () => {
    expect(convert('${1:{ a \\}}$0')).toBe('${1: a }${0}')
    expect(convert('${1:a\nb}$0')).toBe('${1:a b}${0}')
  })

  it('known variables become the value; empty ones use the default', () => {
    expect(convert('// $TM_FILENAME ${TM_SELECTED_TEXT:none}', { TM_FILENAME: 'a.ts', TM_SELECTED_TEXT: '' })).toBe(
      '// a.ts none'
    )
  })

  it('an unknown variable becomes a placeholder with the name (or the default)', () => {
    expect(convert('$FOO ${BAR:default} $FOO')).toBe('${1:FOO} ${2:default} ${1:FOO}${0}')
    expect(convert('$1 $NOPE')).toBe('${1} ${2:NOPE}${0}')
  })

  it('applies variable transforms', () => {
    expect(convert('${TM_FILENAME/(.*)\\..+$/$1/}', { TM_FILENAME: 'comp.test.tsx' })).toBe('comp.test')
    expect(convert('${TM_FILENAME_BASE/(.*)/${1:/upcase}/}', { TM_FILENAME_BASE: 'abc' })).toBe('ABC')
  })

  it('a tabstop transform becomes a simple mirror', () => {
    expect(convert('${1:a} ${1/(.*)/${1:/upcase}/}$0')).toBe('${1:a} ${1:a}${0}')
  })

  it('respects escapes', () => {
    expect(convert('\\$1 \\} \\\\')).toBe('$1 \\} \\')
    expect(convert('price: $')).toBe('price: $')
  })

  it('a malformed field becomes text', () => {
    expect(convert('a ${ b')).toBe('a $\\{ b')
    expect(convert('${1:open')).toBe('$\\{1:open')
    expect(convert('${1|a,b}')).toBe('$\\{1|a,b\\}')
  })

  it('Tab order: ascending numbers and $0 last', () => {
    expect(snippetToCodeMirror('$0 $2 $1', none).order).toEqual([1, 2, 0])
  })
})

describe('applyTransform', () => {
  const transformOf = (src: string): Parameters<typeof applyTransform>[1] => {
    const node = parseSnippet(src)[0]
    if (node?.type !== 'variable' || !node.transform) throw new Error('no transform')
    return node.transform
  }

  it('without `g` replaces only the first match; with `g`, all', () => {
    expect(applyTransform('a-b-c', transformOf('${X/-/_/}'))).toBe('a_b-c')
    expect(applyTransform('a-b-c', transformOf('${X/-/_/g}'))).toBe('a_b_c')
  })

  it('modifiers and conditionals', () => {
    expect(applyTransform('my-file', transformOf('${X/(.*)/${1:/pascalcase}/}'))).toBe('MyFile')
    expect(applyTransform('my-file', transformOf('${X/(.*)/${1:/camelcase}/}'))).toBe('myFile')
    expect(applyTransform('abc', transformOf('${X/(.*)/${1:/capitalize}/}'))).toBe('Abc')
    expect(applyTransform('x', transformOf('${X/(y)?x/${1:+yes}${1:-no}/}'))).toBe('no')
    expect(applyTransform('yx', transformOf('${X/(y)?x/${1:?yes:no}/}'))).toBe('yes')
  })

  it('an invalid regex changes nothing', () => {
    expect(applyTransform('abc', transformOf('${X/(/x/}'))).toBe('abc')
  })
})

describe('utilities', () => {
  it('plain text for the preview', () => {
    expect(snippetPlainText(resolveVariables(parseSnippet('log(${1:x}, $NAME)$0'), none))).toBe('log(x, NAME)')
  })

  it('detects the use of a variable, including nested', () => {
    expect(usesVariable(parseSnippet('${1:$CLIPBOARD}'), 'CLIPBOARD')).toBe(true)
    expect(usesVariable(parseSnippet('$TM_FILENAME'), 'CLIPBOARD')).toBe(false)
  })
})
