// Signature text highlighting the active parameter (signature help). Pure.
import type { LspParameterInformation, LspSignatureHelp, LspSignatureInformation } from '@shared/types'

export interface SignatureParts {
  before: string
  active: string
  after: string
}

/** `[start, end)` range of the parameter inside the signature `label`, or `null`. */
function parameterRange(label: string, param: LspParameterInformation | undefined): [number, number] | null {
  if (!param) return null
  if (Array.isArray(param.label)) {
    const [a, b] = param.label
    return a >= 0 && b <= label.length && a < b ? [a, b] : null
  }
  if (!param.label) return null
  const at = label.indexOf(param.label)
  return at < 0 ? null : [at, at + param.label.length]
}

/** Active signature and the index of the active parameter (the signature one wins over the list one). */
export function activeSignature(
  help: LspSignatureHelp
): { signature: LspSignatureInformation; parameter: number } | null {
  const signature = help.signatures[help.activeSignature] ?? help.signatures[0]
  if (!signature) return null
  return { signature, parameter: signature.activeParameter ?? help.activeParameter }
}

/**
 * Splits the label into before / active parameter / after. Without a valid active parameter, everything goes in
 * `before`.
 */
export function splitSignature(signature: LspSignatureInformation, parameter: number): SignatureParts {
  const label = signature.label
  const range = parameterRange(label, signature.parameters[parameter])
  if (!range) return { before: label, active: '', after: '' }
  return { before: label.slice(0, range[0]), active: label.slice(range[0], range[1]), after: label.slice(range[1]) }
}
