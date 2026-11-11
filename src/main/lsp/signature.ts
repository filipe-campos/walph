import { isRecord } from '@shared/guards'
import type { LspParameterInformation, LspSignatureHelp, LspSignatureInformation } from '@shared/types'
import { normalizeMarkup } from './markup'
import { isNonNegInt } from './shape'

function parameter(raw: unknown, signatureLabel: string): LspParameterInformation {
  if (!isRecord(raw)) return { label: '' }
  let label: string | [number, number] = ''
  if (typeof raw.label === 'string') label = raw.label
  else if (
    Array.isArray(raw.label) &&
    raw.label.length === 2 &&
    isNonNegInt(raw.label[0]) &&
    isNonNegInt(raw.label[1]) &&
    raw.label[0] <= raw.label[1] &&
    raw.label[1] <= signatureLabel.length
  ) {
    label = [raw.label[0], raw.label[1]]
  }
  const documentation = normalizeMarkup(raw.documentation, true)
  return documentation ? { label, documentation } : { label }
}

function signature(raw: unknown): LspSignatureInformation | null {
  if (!isRecord(raw) || typeof raw.label !== 'string') return null
  const label = raw.label
  const result: LspSignatureInformation = {
    label,
    // Parameter indices matter (`activeParameter`): invalid ones become empty instead of disappearing.
    parameters: Array.isArray(raw.parameters) ? raw.parameters.map((p) => parameter(p, label)) : []
  }
  const documentation = normalizeMarkup(raw.documentation, true)
  if (documentation) result.documentation = documentation
  if (isNonNegInt(raw.activeParameter)) result.activeParameter = raw.activeParameter
  return result
}

export function normalizeSignatureHelp(raw: unknown): LspSignatureHelp | null {
  if (!isRecord(raw) || !Array.isArray(raw.signatures)) return null
  const signatures = raw.signatures.map(signature).filter((s): s is LspSignatureInformation => s !== null)
  if (signatures.length === 0) return null
  const activeSignature =
    isNonNegInt(raw.activeSignature) && raw.activeSignature < signatures.length ? raw.activeSignature : 0
  const activeParameter = isNonNegInt(raw.activeParameter) ? raw.activeParameter : 0
  return { signatures, activeSignature, activeParameter }
}
