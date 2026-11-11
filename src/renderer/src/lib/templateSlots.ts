export type TemplatePart = string | { slot: string }

/** Splits a translated text with `{name}` into spans and slots, so the language decides the order of the elements. */
export function splitTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = []
  let last = 0
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    if (match.index > last) parts.push(template.slice(last, match.index))
    parts.push({ slot: match[1] ?? '' })
    last = match.index + match[0].length
  }
  if (last < template.length) parts.push(template.slice(last))
  return parts
}
