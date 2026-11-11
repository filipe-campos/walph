import { isRecord } from '@shared/guards'
import type { LspInlayHint, LspInlayHintPart } from '@shared/types'
import { asPosition, comparePositions } from './shape'

const INLAY_HINT_LIMIT = 2000
const LABEL_LIMIT = 200
const PARTS_LIMIT = 20
const TOOLTIP_LIMIT = 2000

/** `string | MarkupContent` → plain text (the renderer shows it in the `title`, no markdown). */
function tooltipOf(v: unknown): string | undefined {
  const text = typeof v === 'string' ? v : isRecord(v) && typeof v.value === 'string' ? v.value : undefined
  const trimmed = text?.trim()
  return trimmed ? trimmed.slice(0, TOOLTIP_LIMIT) : undefined
}

function partsOf(label: unknown): LspInlayHintPart[] {
  if (typeof label === 'string') return label ? [{ value: label.slice(0, LABEL_LIMIT) }] : []
  if (!Array.isArray(label)) return []
  const parts: LspInlayHintPart[] = []
  let room = LABEL_LIMIT
  for (const raw of label.slice(0, PARTS_LIMIT)) {
    if (!isRecord(raw) || typeof raw.value !== 'string' || !raw.value || room <= 0) continue
    const value = raw.value.slice(0, room)
    room -= value.length
    const tooltip = tooltipOf(raw.tooltip)
    parts.push(tooltip ? { value, tooltip } : { value })
  }
  return parts
}

function normalizeInlayHint(raw: unknown): LspInlayHint | null {
  if (!isRecord(raw)) return null
  const position = asPosition(raw.position)
  const label = partsOf(raw.label)
  if (!position || label.length === 0) return null
  const kind = raw.kind === 1 ? 'type' : raw.kind === 2 ? 'parameter' : undefined
  const tooltip = tooltipOf(raw.tooltip)
  return {
    position,
    label,
    paddingLeft: raw.paddingLeft === true,
    paddingRight: raw.paddingRight === true,
    ...(kind ? { kind } : {}),
    ...(tooltip ? { tooltip } : {})
  }
}

/** `InlayHint[] | null`: malformed ones dropped, at most `INLAY_HINT_LIMIT`, in document order. */
export function normalizeInlayHints(raw: unknown): LspInlayHint[] {
  if (!Array.isArray(raw)) return []
  const hints: LspInlayHint[] = []
  for (const item of raw) {
    if (hints.length >= INLAY_HINT_LIMIT) break
    const hint = normalizeInlayHint(item)
    if (hint) hints.push(hint)
  }
  return hints.sort((a, b) => comparePositions(a.position, b.position))
}
