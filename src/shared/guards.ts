/** Plain object: arrays and `null` are left out. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** Number without `NaN` and without infinities. */
export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
