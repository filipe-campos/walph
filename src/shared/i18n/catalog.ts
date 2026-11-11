import { LOCALES, type Locale } from './locale'
import { app } from './messages/app'
import { claude } from './messages/claude'
import { claudeHost } from './messages/claudeHost'
import { commands } from './messages/commands'
import { common } from './messages/common'
import { containers } from './messages/containers'
import { debug } from './messages/debug'
import { debugUi } from './messages/debugUi'
import { editor } from './messages/editor'
import { files } from './messages/files'
import { git } from './messages/git'
import { lsp } from './messages/lsp'
import { lspNavigation } from './messages/lspNavigation'
import { menu } from './messages/menu'
import { quickInput } from './messages/quickInput'
import { search } from './messages/search'
import { settings } from './messages/settings'
import { snippets } from './messages/snippets'
import { terminal } from './messages/terminal'

// One namespace per domain (file in `messages/`); new namespace = new file + one line here.
const NAMESPACES = {
  common,
  app,
  commands,
  menu,
  settings,
  quickInput,
  files,
  git,
  search,
  editor,
  lsp,
  snippets,
  lspNavigation,
  debug,
  debugUi,
  terminal,
  containers,
  claudeHost,
  claude
}

type Namespaces = typeof NAMESPACES
export type Messages = { [K in keyof Namespaces]: Namespaces[K]['pt-BR'] }

function catalogFor(locale: Locale): Messages {
  const entries = Object.entries(NAMESPACES).map(([name, ns]) => [name, ns[locale]])
  return Object.fromEntries(entries) as Messages
}

export const CATALOGS: Record<Locale, Messages> = Object.fromEntries(
  LOCALES.map((locale) => [locale, catalogFor(locale)])
) as Record<Locale, Messages>
