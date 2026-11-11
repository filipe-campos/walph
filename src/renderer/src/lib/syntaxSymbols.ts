// Symbol tree taken from the document's Lezer tree, for files without a language server. Generic: it recognizes
// the definition nodes by the names the `@lezer/*` grammars use (JS/TS, Python, Rust, Go, Java, C/C++, PHP, CSS,
// JSON, YAML, Markdown). An unknown grammar (legacy modes) simply produces no symbols.
import { syntaxTree } from '@codemirror/language'
import type { EditorState, Text } from '@codemirror/state'
import type { LspDocumentSymbol, LspRange } from '@shared/types'
import { offsetToLspPosition } from '@shared/lspPosition'

/** Lezer tree node (without depending on `@lezer/common` directly). */
type SyntaxNode = ReturnType<typeof syntaxTree>['topNode']

const SYMBOL_LIMIT = 5000
const MAX_DEPTH = 256
const MAX_NAME = 100

// LSP `SymbolKind`.
const K = {
  module: 2,
  namespace: 3,
  class: 5,
  method: 6,
  property: 7,
  field: 8,
  constructor: 9,
  enum: 10,
  interface: 11,
  function: 12,
  variable: 13,
  constant: 14,
  string: 15,
  number: 16,
  boolean: 17,
  array: 18,
  null: 21,
  enumMember: 22,
  struct: 23,
  typeParameter: 26
} as const

/**
 * `header`: the name is the text from the start of the node up to the body (CSS selector, `impl X for Y`). `data`:
 * JSON/YAML key.
 */
interface Rule {
  kind: number
  name?: 'header' | 'data'
}

const RULES = new Map<string, Rule>(
  Object.entries({
    ClassDeclaration: { kind: K.class },
    ClassDefinition: { kind: K.class },
    ClassSpecifier: { kind: K.class },
    StructSpecifier: { kind: K.struct },
    StructItem: { kind: K.struct },
    UnionSpecifier: { kind: K.struct },
    UnionItem: { kind: K.struct },
    InterfaceDeclaration: { kind: K.interface },
    TraitItem: { kind: K.interface },
    TraitDeclaration: { kind: K.interface },
    EnumDeclaration: { kind: K.enum },
    EnumItem: { kind: K.enum },
    EnumSpecifier: { kind: K.enum },
    EnumVariant: { kind: K.enumMember },
    Enumerator: { kind: K.enumMember },
    EnumConstant: { kind: K.enumMember },
    TypeAliasDeclaration: { kind: K.typeParameter },
    TypeItem: { kind: K.typeParameter },
    TypeSpec: { kind: K.typeParameter },
    NamespaceDeclaration: { kind: K.namespace },
    NamespaceDefinition: { kind: K.namespace },
    ModuleDeclaration: { kind: K.module },
    ModItem: { kind: K.module },
    ImplItem: { kind: K.class, name: 'header' },
    FunctionDeclaration: { kind: K.function },
    FunctionDefinition: { kind: K.function },
    FunctionItem: { kind: K.function },
    FunctionDecl: { kind: K.function },
    MacroDefinition: { kind: K.function },
    MethodDeclaration: { kind: K.method },
    MethodDecl: { kind: K.method },
    MethodType: { kind: K.method },
    MethodElem: { kind: K.method },
    ConstructorDeclaration: { kind: K.constructor },
    PropertyDeclaration: { kind: K.property },
    PropertyType: { kind: K.property },
    FieldDeclaration: { kind: K.field },
    FieldDecl: { kind: K.field },
    VariableDeclaration: { kind: K.variable },
    AssignStatement: { kind: K.variable },
    VarSpec: { kind: K.variable },
    ConstSpec: { kind: K.constant },
    ConstItem: { kind: K.constant },
    StaticItem: { kind: K.constant },
    Property: { kind: K.property, name: 'data' },
    Pair: { kind: K.property, name: 'data' },
    RuleSet: { kind: K.class, name: 'header' },
    MediaStatement: { kind: K.module, name: 'header' }
  })
)

const NAME_NODES = new Set([
  'VariableDefinition',
  'PropertyDefinition',
  'TypeDefinition',
  'Definition',
  'DefName',
  'VariableName',
  'BoundIdentifier',
  'Identifier',
  'Name',
  'NamespaceIdentifier',
  'FieldIdentifier',
  'FieldName',
  'PropertyName',
  'ScopedIdentifier',
  'Key'
])

// Where the name may be one level below (C `int f()`, Java `int x;`, destructuring); never in parameters.
const NAME_WRAPPER = /Declarator$|Pattern$/

const BODY_NODES = new Set([
  'Block',
  'DeclarationList',
  'ClassBody',
  'Body',
  'CompoundStatement',
  'FieldDeclarationList'
])

const FUNCTION_KINDS = new Set<number>([K.method, K.constructor, K.function])
// Inside functions only definitions go in (classes, functions): local variables and object properties are noise.
const DATA_KINDS = new Set<number>([K.property, K.field, K.variable, K.constant])
// JSON/YAML keys and object properties only count at the root of a data file or inside a value.
const DATA_PARENTS = new Set<number>([K.module, K.property, K.variable, K.constant, K.array])
const DATA_ROOTS = new Set(['JsonText', 'Stream'])

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/

/**
 * Name node: a direct name child, then inside a declarator (up to two levels) and only then a direct `TypeIdentifier`,
 * which in C/C++ is usually the return or field type (`Foo make()`, `Foo bar;`).
 */
function findName(node: SyntaxNode, depth = 0): SyntaxNode | null {
  for (let c = node.firstChild; c; c = c.nextSibling) if (NAME_NODES.has(c.name)) return c
  if (depth < 2) {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      const found = NAME_WRAPPER.test(c.name) ? findName(c, depth + 1) : null
      if (found) return found
    }
  }
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === 'TypeIdentifier') return c
  return null
}

const hasChild = (node: SyntaxNode, names: readonly string[]): boolean => {
  for (let c = node.firstChild; c; c = c.nextSibling) if (names.includes(c.name)) return true
  return false
}

/** Adjusts the kind by the node content (value of a key, `const`, assigned function, method inside a class). */
function refineKind(node: SyntaxNode, kind: number, parentKind: number | null): number {
  switch (node.name) {
    case 'Property':
    case 'Pair': {
      if (hasChild(node, ['ParamList'])) return K.method
      if (hasChild(node, ['Object', 'BlockMapping', 'FlowMapping', 'ObjectExpression'])) return K.module
      if (hasChild(node, ['Array', 'BlockSequence', 'FlowSequence', 'ArrayExpression'])) return K.array
      if (hasChild(node, ['String'])) return K.string
      if (hasChild(node, ['Number'])) return K.number
      if (hasChild(node, ['True', 'False'])) return K.boolean
      if (hasChild(node, ['Null'])) return K.null
      return kind
    }
    case 'VariableDeclaration':
      if (hasChild(node, ['ArrowFunction', 'FunctionExpression'])) return K.function
      return hasChild(node, ['const']) ? K.constant : kind
    case 'TypeSpec':
      if (hasChild(node, ['StructType'])) return K.struct
      return hasChild(node, ['InterfaceType']) ? K.interface : kind
    case 'FunctionDefinition':
      return parentKind === K.class || parentKind === K.struct ? K.method : kind
    case 'FieldDeclaration':
      return hasChild(node, ['FunctionDeclarator']) ? K.method : kind
    default:
      return kind
  }
}

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)

const unquote = (text: string): string => (/^(["']).*\1$/s.test(text) ? text.slice(1, -1) : text)

function headingName(doc: Text, node: SyntaxNode): string {
  const text = doc.sliceString(node.from, node.to).split('\n')[0] ?? ''
  return clean(text.replace(/^\s*#{1,6}\s*/, '').replace(/\s+#+\s*$/, ''))
}

interface Draft {
  symbol: LspDocumentSymbol
  /** Heading level (Markdown); 0 for the others. */
  level: number
}

/** Document symbols from the syntax tree the state already has (the parser runs in the background). */
export function syntaxSymbols(state: EditorState): LspDocumentSymbol[] {
  const tree = syntaxTree(state)
  const doc = state.doc
  const top = tree.topNode
  const dataRoot = DATA_ROOTS.has(top.name)
  const range = (from: number, to: number): LspRange => ({
    start: offsetToLspPosition(doc, from),
    end: offsetToLspPosition(doc, to)
  })
  let count = 0
  const roots: LspDocumentSymbol[] = []
  const headings: { level: number; from: number; to: number; name: string }[] = []

  const symbolFor = (node: SyntaxNode, parent: Draft | null, inFunction: boolean): LspDocumentSymbol | null => {
    const rule = RULES.get(node.name)
    if (!rule) return null
    const parentKind = parent?.symbol.kind ?? null
    if (rule.name === 'data' && !(parentKind === null ? dataRoot : DATA_PARENTS.has(parentKind))) return null
    const kind = refineKind(node, rule.kind, parentKind)
    if (inFunction && DATA_KINDS.has(kind)) return null
    let name: string
    let nameFrom = node.from
    let nameTo: number
    if (rule.name === 'header') {
      let body: SyntaxNode | null = null
      for (let c = node.firstChild; c && !body; c = c.nextSibling) if (BODY_NODES.has(c.name)) body = c
      const end = body?.from ?? node.to
      name = clean(doc.sliceString(node.from, end))
      nameTo = end
    } else {
      const nameNode = findName(node)
      if (!nameNode) return null
      name = clean(unquote(doc.sliceString(nameNode.from, nameNode.to)))
      nameFrom = nameNode.from
      nameTo = nameNode.to
    }
    if (!name) return null
    return { name, kind, range: range(node.from, node.to), selectionRange: range(nameFrom, nameTo), children: [] }
  }

  const visit = (node: SyntaxNode, parent: Draft | null, inFunction: boolean, depth: number): void => {
    if (depth > MAX_DEPTH) return
    for (let c = node.firstChild; c && count < SYMBOL_LIMIT; c = c.nextSibling) {
      const heading = HEADING.exec(c.name)
      if (heading) {
        const name = headingName(doc, c)
        if (name) headings.push({ level: Number(heading[1]), from: c.from, to: c.to, name })
        continue
      }
      const symbol = symbolFor(c, parent, inFunction)
      if (!symbol) {
        visit(c, parent, inFunction, depth + 1)
        continue
      }
      count++
      ;(parent ? parent.symbol.children : roots).push(symbol)
      visit(c, { symbol, level: 0 }, inFunction || FUNCTION_KINDS.has(symbol.kind), depth + 1)
    }
  }
  visit(top, null, false, 0)
  if (headings.length === 0) return roots

  // Markdown: each heading is the parent of the higher-level ones that follow it; the section runs until the next one
  // of an equal or lower level.
  const stack: Draft[] = []
  const close = (level: number, at: number): void => {
    while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) {
      const done = stack.pop()
      if (done) done.symbol.range = { ...done.symbol.range, end: offsetToLspPosition(doc, at) }
    }
  }
  for (const h of headings) {
    const lineStart = doc.lineAt(h.from).from
    close(h.level, Math.max(lineStart - 1, 0))
    const symbol: LspDocumentSymbol = {
      name: h.name,
      kind: K.string,
      range: range(h.from, h.to),
      selectionRange: range(h.from, h.to),
      children: []
    }
    ;(stack.at(-1)?.symbol.children ?? roots).push(symbol)
    stack.push({ symbol, level: h.level })
  }
  close(0, doc.length)
  return roots
}
