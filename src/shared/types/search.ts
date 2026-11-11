export interface SearchOptions {
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
  /**
   * "Files to include": comma-separated globs (a comma inside `{a,b}` does not separate). Empty = all. Without `/`
   * the pattern applies at any level (`*.ts`, `src` = the `src` folder anywhere); with `/` in the middle it is relative
   * to the root (`src/lib`); `./x` or `/x` anchors at the root. A folder includes everything inside it. As in VS Code,
   * a file matched by the include is searched even if `.gitignore` ignores it (but ignored folders stay out).
   */
  include?: string
  /** "Files to exclude": same syntax as `include`, added to `files.exclude` + `search.exclude` (read in main). */
  exclude?: string
}

export interface SearchMatch {
  /** 1-based line. */
  line: number
  /** 0-based column in UTF-16 units (like the editor), within `text`. */
  column: number
  /** Match length in UTF-16 units. */
  length: number
  /** Whole line where the match is, without the terminator (`\n`/`\r\n`). */
  text: string
}

export interface SearchFileResult {
  path: string
  matches: SearchMatch[]
}

export interface SearchResult {
  files: SearchFileResult[]
  totalMatches: number
  truncated: boolean
  error?: string | undefined
  /**
   * The search was interrupted by a newer search of the same window (its rg was killed). The renderer must ignore
   * this response: the partial result is not the one of the current query.
   */
  cancelled?: boolean
}

/** Matches (coming from a `SearchResult`) to replace in a file. */
export interface ReplaceFileRequest {
  path: string
  matches: SearchMatch[]
}

export interface ReplaceRequest {
  /** Query and options of the search that produced the matches (needed to expand `$1` in regex mode). */
  query: string
  options: SearchOptions
  /** Replacement text; in regex mode accepts `$1`…`$99`, `$<name>`, `$&` and `$$`. Literal outside regex mode. */
  replacement: string
  files: ReplaceFileRequest[]
}

export interface ReplaceFileOutcome {
  path: string
  /** How many matches were replaced. */
  replaced: number
  /**
   * Indices (in `ReplaceFileRequest.matches`) of the matches NOT replaced because the text no longer matches (the file
   * changed since the search) or the JS regex does not reproduce the ripgrep match.
   */
  skipped: number[]
  /**
   * Failure of the whole file (unreadable, non-UTF-8 encoding, outside the folder); nothing in it was changed.
   * Translated message (`t()`).
   */
  error?: string
}

export interface ReplaceResult {
  files: ReplaceFileOutcome[]
}

export interface SearchApi {
  /**
   * Search with ripgrep in the window folder (`search:find`; main rejects another root). Respects `.gitignore`,
   * `files.exclude` + `search.exclude` (the window's effective configuration) and `options.include`/`exclude`. A new
   * search of the same window kills the previous one's rg, which resolves with `cancelled: true`; closing/reloading the
   * window also kills it.
   */
  find(root: string, query: string, options: SearchOptions): Promise<SearchResult>
  /**
   * Replaces the requested matches on disk (`search:replace`), file by file, only inside the window folder. Each
   * match is only replaced if the line on disk is still equal to `match.text` and the span reproduces the match;
   * otherwise it goes to `skipped`. A file that is not valid UTF-8 is refused whole (`error`), including UTF-16 (with
   * BOM) and Windows-1252/Latin-1 with accents (batch replace does not re-encode). Writes preserving EOL and BOM.
   * Dirty tabs do not go through here: the renderer applies it to the editor buffer.
   */
  replace(root: string, request: ReplaceRequest): Promise<ReplaceResult>
}
