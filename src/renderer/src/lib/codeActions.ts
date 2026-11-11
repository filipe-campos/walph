// Ordering and labels of code actions (light bulb and quick fix menu). Pure.
import type { LspCodeAction } from '@shared/types'

/** Preferred first, disabled last; the server order breaks ties. */
export function sortCodeActions(actions: LspCodeAction[]): LspCodeAction[] {
  const rank = (a: LspCodeAction): number => (a.disabled ? 2 : a.isPreferred ? 0 : 1)
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => rank(a.action) - rank(b.action) || a.index - b.index)
    .map((x) => x.action)
}

/** `true` if there is a preferred fix from the server: the light bulb gets the "auto fix" icon. */
export function hasAutoFix(actions: LspCodeAction[]): boolean {
  return actions.some((a) => a.isPreferred && !a.disabled && (a.kind ?? 'quickfix').startsWith('quickfix'))
}
