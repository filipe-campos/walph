import { iconForSymbolKind } from '../../lib/symbolKinds'

/** Icon of an LSP `SymbolKind`, in the group color (function, variable, type). */
export function SymbolIcon({ kind, className }: { kind: number; className?: string }) {
  const { icon, group } = iconForSymbolKind(kind)
  return (
    <i className={['codicon', icon, 'symbol-icon', `kind-${group}`, className].filter(Boolean).join(' ')} aria-hidden />
  )
}
