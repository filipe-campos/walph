import { LanguageDescription, LanguageSupport } from '@codemirror/language'
import { styleTags, tags } from '@lezer/highlight'
import { yamlScalars } from './yamlScalars'

/**
 * YAML with colored values: Lezer only marks the key; the loose text (`Literal`) stayed without color, like the key.
 */
export const yamlDescription = LanguageDescription.of({
  name: 'YAML',
  alias: ['yml'],
  extensions: ['yaml', 'yml'],
  load: async () => {
    const { yamlLanguage } = await import('@codemirror/lang-yaml')
    // Simple values are strings; number and boolean get their own color via `yamlScalars` (Lezer does not separate
    // them).
    const language = yamlLanguage.configure({ props: [styleTags({ Literal: tags.string })] })
    return new LanguageSupport(language, [yamlScalars])
  }
})
