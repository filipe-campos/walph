import { LanguageDescription, LanguageSupport } from '@codemirror/language'
import { languages as dataLanguages } from '@codemirror/language-data'
import { styleTags } from '@lezer/highlight'
import { dotenvLanguage } from './dotenvLanguage'
import { yamlDescription } from './yamlLanguage'
import { markdownWrap } from './markdownWrap'
import { markdownMark } from './markdownMark'
import { basename } from './path'
import { t } from '@shared/i18n'

/**
 * Editor languages: those from language-data plus our own (`.env` and YAML come first: the first that matches wins).
 */
export const languages: readonly LanguageDescription[] = [
  dotenvLanguage,
  yamlDescription,
  ...dataLanguages.filter((l) => l.name !== yamlDescription.name)
]

/**
 * Id of the "no language" mode chosen by the user. It is saved in the session, so it does not change with the
 * language; the
 * displayed name comes from `languageLabel`.
 */
export const PLAIN_TEXT = 'Texto'

/**
 * Language description of a tab: the one chosen by the user (language-data `name`, or `PLAIN_TEXT` = none) or,
 * without a choice (or with an unknown name, e.g. an old session), the one that matches the file name.
 */
export function findLanguage(path: string, chosen?: string | null): LanguageDescription | null {
  if (chosen === PLAIN_TEXT) return null
  if (chosen) {
    const byName = languages.find((l) => l.name === chosen)
    if (byName) return byName
  }
  return LanguageDescription.matchFilename(languages, basename(path))
}

export function languageName(path: string, chosen?: string | null): string {
  return findLanguage(path, chosen)?.name ?? t().editor.language.plainText
}

/** Displayed name of a `languageChoices` choice (plain text in the current language). */
export function languageLabel(name: string): string {
  return name === PLAIN_TEXT ? t().editor.language.plainText : name
}

let markdownSupport: Promise<LanguageSupport> | null = null

async function loadMarkdown(): Promise<LanguageSupport> {
  const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')
  // Markers with their own tag (the global `processingInstruction` would catch `#include`, `<?xml` etc.).
  const marks = styleTags({
    'HeaderMark QuoteMark ListMark LinkMark EmphasisMark CodeMark StrikethroughMark TaskMarker': markdownMark
  })
  // `addKeymap: false`: Markdown's Enter continued the list (typing ":" and Enter inserted "-"); here it is just a line
  // break.
  const support = markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    addKeymap: false,
    extensions: [{ props: [marks] }]
  })
  // The `LanguageSupport` carries the extensions along: wrap only exists in Markdown tabs.
  return new LanguageSupport(support.language, [support.support, markdownWrap])
}

/** Loads (on demand) the language support suited to the file or the user's choice. */
export async function loadLanguage(path: string, chosen?: string | null): Promise<LanguageSupport | null> {
  const desc = findLanguage(path, chosen)
  if (!desc) return null
  // language-data's Markdown is plain CommonMark without colored code blocks: uses GFM (strikethrough, tables, tasks)
  // and the language-data languages in the fenced blocks.
  if (desc.name === 'Markdown') {
    return (markdownSupport ??= loadMarkdown().catch((err: unknown) => {
      markdownSupport = null
      throw err
    }))
  }
  return desc.load()
}

/** Names for the language mode picker: "Texto" first, the rest in alphabetical order. */
export function languageChoices(): string[] {
  const names = languages.map((l) => l.name).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  return [PLAIN_TEXT, ...names]
}
