/** Where the snippet was defined: user data folder or the view folder's `.vscode/`. */
export type SnippetSource = 'user' | 'workspace'

/** A user snippet in the VS Code format, already validated by main. */
export interface UserSnippet {
  /** Object key in the file (displayed name). */
  name: string
  /** Prefixes that trigger it in completion; empty = only through "Insert Snippet". */
  prefixes: string[]
  /** Body in VS Code snippet syntax (lines already joined by `\n`). */
  body: string
  description?: string
  /** VS Code `languageId`s where it applies; `null` = all languages. */
  scopes: string[] | null
  source: SnippetSource
  /** Absolute path of the file that defines it. */
  file: string
}

/**
 * Snippets file: `language` = `<userData>/snippets/<languageId>.json`,
 * `global` = `<userData>/snippets/<name>.code-snippets`, `workspace` = `<folder>/.vscode/<name>.code-snippets`.
 * `name` is the `languageId` or the name without extension.
 */
export type SnippetFileKind = 'language' | 'global' | 'workspace'

export interface SnippetFile {
  kind: SnippetFileKind
  name: string
  path: string
}

export interface SnippetSnapshot {
  /** User snippets followed by the ones of the view's workspace. */
  snippets: UserSnippet[]
  /** Existing files (for "Configure Snippets"). */
  files: SnippetFile[]
  /** Read problems (already translated, with the file name). Empty if none. */
  errors: string[]
}

export interface SnippetsApi {
  /** Snippets of the user and of the view folder (`snippets:list`); starts receiving `onChange` for this view. */
  list(): Promise<SnippetSnapshot>
  /**
   * Path of the snippets file (`snippets:openFile`), created with a commented template if it does not exist yet.
   * `name` is the `languageId` (`language`) or the file name without extension; `workspace` requires an open folder.
   */
  openFile(kind: SnippetFileKind, name: string): Promise<string>
  /** Some snippets file of the view changed on disk (`snippets:changed`). */
  onChange(cb: (snapshot: SnippetSnapshot) => void): () => void
}
