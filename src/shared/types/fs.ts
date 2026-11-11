import type { ExplorerAction } from './window'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface FileList {
  /** Paths relative to the root, always with `/` as separator (on any OS), without a leading `./`. */
  files: string[]
  /** `true` when the list was cut at main's file limit. */
  truncated: boolean
}

/**
 * Encoding of a text file. `utf8bom`/`utf16le`/`utf16be` are detected by the BOM; `windows1252` and
 * `iso88591` only when the user chooses them ("Reopen with encoding"). Without a BOM, the default is `utf8`.
 */
export type TextEncoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be' | 'windows1252' | 'iso88591'

/** Decoded text (without the BOM) and the encoding used to read it. */
export interface TextFile {
  text: string
  encoding: TextEncoding
}

export interface FsApi {
  readDir(dir: string): Promise<DirEntry[]>
  /** Text decoded by the BOM (UTF-8 without BOM by default), BOM already removed. Binary (no UTF-16 BOM) → error. */
  readFile(path: string): Promise<string>
  /**
   * Reads the text with the encoding detected by the BOM, or with `encoding` when given ("Reopen with
   * encoding": forces it, ignoring the BOM, which stays in the text if present and not matching). Same limits as
   * `readFile` (10 MB, binary refused; a file with a UTF-16 BOM is not binary).
   */
  readText(path: string, encoding?: TextEncoding): Promise<TextFile>
  /**
   * Local image (Markdown preview and viewer) as a `data:` URL (the CSP only accepts `'self'`/`data:`). Any
   * absolute path, like `readFile` (reading is free); a regular file with an image extension (png, jpg, jpeg, gif,
   * webp, svg, bmp, ico, avif) and up to 10 MB; any other case rejects with a translated message (`t()`).
   */
  readImage(path: string): Promise<string>
  /**
   * Writes the text exactly as received (EOL is the renderer's responsibility); recreates missing folders.
   * `encoding` (default `utf8` without BOM) writes the BOM of `utf8bom`/`utf16le`/`utf16be`; a character that does not
   * exist in `windows1252`/`iso88591` → error with a translated message (`t()`), nothing is written.
   */
  writeFile(path: string, content: string, encoding?: TextEncoding): Promise<void>
  createFile(dir: string, name: string): Promise<string>
  createDir(dir: string, name: string): Promise<string>
  rename(path: string, newName: string): Promise<string>
  /**
   * Moves `path` (file or folder) into `targetDir`, keeping the name; returns the new path. Both must be inside the
   * window folder; a folder into itself, an existing destination or another volume → error with a translated message
   * (`t()`). Same source folder → no-op (returns `path`).
   */
  move(path: string, targetDir: string): Promise<string>
  trash(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  /**
   * Copies `src` (file or folder, recursive) into `destDir` and returns the created path. `src` can be any absolute
   * path (e.g. copied in Finder); `destDir` must be inside the window folder. A name already existing in the
   * destination → automatic free name ("a copy.ts", "a copy 2.ts"); never overwrites. A folder into itself or into a
   * descendant, a missing source or a destination that is not a folder → error with a translated message (`t()`).
   */
  copy(src: string, destDir: string): Promise<string>
  /**
   * Absolute paths of the files in the native clipboard (copied in Finder/Explorer). macOS reads several; Windows and
   * Linux, best effort. Only returns what exists; `[]` when there are no files. Does not read text.
   */
  clipboardFiles(): Promise<string[]>
  /**
   * Puts `paths` (absolute) in the native clipboard as files, to paste in Finder. macOS only: returns `false`
   * on the other OSes or if any path is invalid. Replaces the clipboard text.
   */
  writeClipboardFiles(paths: string[]): Promise<boolean>
  /**
   * `canPaste`: enables "Paste" (the renderer knows whether something was copied); `canCompare`: enables "Compare with
   * Selected" (there is another file selected to compare). The compare items only appear on files.
   * `selectionCount` > 1: the menu acts on several items, so rename, create and compare are disabled.
   */
  showContextMenu(
    isDirectory: boolean,
    options?: { canPaste?: boolean; canCompare?: boolean; selectionCount?: number }
  ): Promise<ExplorerAction | null>
  copyPath(path: string): void
  reveal(path: string): void
}

export interface FilesApi {
  /**
   * Project files (`rg --files`: respects `.gitignore`, includes hidden files, ignores `.git`), for Quick Open.
   * Cached in main per root; the watcher invalidates the cache when files/folders are created, removed or renamed.
   */
  list(root: string): Promise<FileList>
  /**
   * Absolute path of a dragged `File` (`webUtils.getPathForFile` in the preload); empty if the `File` did not
   * come from disk. Only a path: main decides whether it can be read.
   */
  pathForFile(file: File): string
}
