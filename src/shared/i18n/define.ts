import type { Locale } from './locale'

/** A message: fixed text or a function of the parameters (interpolation, plural, agreement). */
type Message = string | ((...args: never[]) => string)
export type MessageTree = { [key: string]: Message | MessageTree }

/**
 * A message namespace with the three translations. pt-BR defines the shape; `en` and `es` must have exactly the
 * same keys and signatures (`NoInfer`), so a missing or extra translation is a type error.
 */
export function defineMessages<T extends MessageTree>(messages: {
  'pt-BR': T
  en: NoInfer<T>
  es: NoInfer<T>
}): Record<Locale, T> {
  return messages
}

/** Singular for exactly 1 (rule shared by the three languages for integer counts). */
export const plural = (n: number, one: string, other: string): string => (n === 1 ? one : other)
