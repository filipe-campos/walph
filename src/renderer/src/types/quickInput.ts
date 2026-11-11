/** Quick input pickers besides files/commands/line. */
export type QuickPicker =
  | 'theme'
  | 'recent'
  | 'branch'
  | 'createBranch'
  | 'stashMessage'
  | 'stashPick'
  | 'terminalProfile'
  | 'language'
  | 'encoding'
  | 'cloneUrl'
  | 'compareFile'
  | 'insertSnippet'
  | 'configureSnippets'
  | 'snippetFileGlobal'
  | 'snippetFileWorkspace'
  | 'emmetWrap'
  | 'debugConfig'
export type StashAction = 'apply' | 'pop' | 'drop'

export interface QuickInputState {
  /**
   * Open quick input (null = closed). The mode comes from the `query` prefix: `>` commands, `:` line, otherwise files.
   * `picker` opens a dedicated picker (themes, recent folders), which ignores the prefixes.
   */
  quickInput: {
    query: string
    picker?: QuickPicker
    stashAction?: StashAction
    /** ⌘K palette: without a prefix searches workspaces, commands and files; with a prefix acts like the others. */
    unified?: boolean
    session: number
  } | null
}
