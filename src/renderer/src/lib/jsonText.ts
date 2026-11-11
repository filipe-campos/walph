// The TS types say `string`, but JSON does not represent `undefined`, functions and symbols.
const serialize: (value: unknown, replacer: null, space?: number) => string | undefined = JSON.stringify

/**
 * `JSON.stringify` that returns '' for what JSON does not represent and `String(value)` for what does not serialize
 * (cycle, BigInt).
 */
export function jsonText(value: unknown, space?: number): string {
  try {
    return serialize(value, null, space) ?? ''
  } catch {
    return String(value)
  }
}
