// Icon and color per LSP completion item kind (`CompletionItemKind`) and symbol kind (`SymbolKind`). The key is the
// kind name ("method", "class"…): the CodeMirror completion keeps it in `Completion.type`, and the language's own
// completion sources (keywords, variables) already use similar names, so the same map serves them all.

/** Color group: each has a token (`--symbol-*`); the rest use the subtle gray. */
type SymbolGroup = 'function' | 'variable' | 'type' | 'other'

export interface SymbolIcon {
  /** Codicon class (`codicon-symbol-method`). */
  icon: string
  group: SymbolGroup
}

const ic = (icon: string, group: SymbolGroup): SymbolIcon => ({ icon, group })

// `Map`: an object literal would have the `constructor` key colliding with `Object.prototype`.
const ICONS = new Map<string, SymbolIcon>(
  Object.entries({
    method: ic('codicon-symbol-method', 'function'),
    function: ic('codicon-symbol-function', 'function'),
    constructor: ic('codicon-symbol-constructor', 'function'),
    field: ic('codicon-symbol-field', 'variable'),
    variable: ic('codicon-symbol-variable', 'variable'),
    property: ic('codicon-symbol-property', 'variable'),
    constant: ic('codicon-symbol-constant', 'variable'),
    value: ic('codicon-symbol-value', 'variable'),
    'enum-member': ic('codicon-symbol-enum-member', 'variable'),
    class: ic('codicon-symbol-class', 'type'),
    interface: ic('codicon-symbol-interface', 'type'),
    struct: ic('codicon-symbol-struct', 'type'),
    enum: ic('codicon-symbol-enum', 'type'),
    'type-parameter': ic('codicon-symbol-type-parameter', 'type'),
    module: ic('codicon-symbol-module', 'type'),
    namespace: ic('codicon-symbol-namespace', 'type'),
    package: ic('codicon-symbol-package', 'type'),
    keyword: ic('codicon-symbol-keyword', 'other'),
    snippet: ic('codicon-symbol-snippet', 'other'),
    operator: ic('codicon-symbol-operator', 'other'),
    event: ic('codicon-symbol-event', 'other'),
    unit: ic('codicon-symbol-unit', 'other'),
    color: ic('codicon-symbol-color', 'other'),
    file: ic('codicon-symbol-file', 'other'),
    folder: ic('codicon-symbol-folder', 'other'),
    reference: ic('codicon-symbol-reference', 'other'),
    text: ic('codicon-symbol-text', 'other'),
    string: ic('codicon-symbol-string', 'other'),
    number: ic('codicon-symbol-numeric', 'other'),
    boolean: ic('codicon-symbol-boolean', 'other'),
    array: ic('codicon-symbol-array', 'other'),
    object: ic('codicon-symbol-object', 'other'),
    key: ic('codicon-symbol-key', 'other'),
    null: ic('codicon-symbol-null', 'other')
  })
)

const FALLBACK: SymbolIcon = { icon: 'codicon-symbol-misc', group: 'other' }

// Index = LSP enum value (position 0 is unused).
const COMPLETION_KINDS = [
  '',
  'text',
  'method',
  'function',
  'constructor',
  'field',
  'variable',
  'class',
  'interface',
  'module',
  'property',
  'unit',
  'value',
  'enum',
  'keyword',
  'snippet',
  'color',
  'file',
  'reference',
  'folder',
  'enum-member',
  'constant',
  'struct',
  'event',
  'operator',
  'type-parameter'
]

const SYMBOL_KINDS = [
  '',
  'file',
  'module',
  'namespace',
  'package',
  'class',
  'method',
  'property',
  'field',
  'constructor',
  'enum',
  'interface',
  'function',
  'variable',
  'constant',
  'string',
  'number',
  'boolean',
  'array',
  'object',
  'key',
  'null',
  'enum-member',
  'struct',
  'event',
  'operator',
  'type-parameter'
]

/** Kind name (`Completion.type`) for a `CompletionItemKind`; `text` for unknown values. */
export function completionKindName(kind: number | undefined): string {
  return (kind !== undefined && COMPLETION_KINDS[kind]) || 'text'
}

/** Kind name for a `SymbolKind`; empty for unknown values. */
export function symbolKindName(kind: number): string {
  return SYMBOL_KINDS[kind] ?? ''
}

/** Icon by kind name. Also accepts the CodeMirror completion kinds (`type`, `namespace`, `text`…). */
export function iconForType(type: string | undefined): SymbolIcon {
  if (!type) return FALLBACK
  // The CodeMirror kinds that do not exist in LSP: "type" is interface/class, "label" is like text.
  const key = type === 'type' ? 'class' : type === 'label' ? 'text' : type
  return ICONS.get(key) ?? FALLBACK
}

export function iconForSymbolKind(kind: number): SymbolIcon {
  return iconForType(symbolKindName(kind))
}
