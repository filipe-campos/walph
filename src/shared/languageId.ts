const LANGUAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/

/** `languageId` in VS Code format (`typescriptreact`, `objective-cpp`…): becomes a file name, so no separators. */
export function isLanguageId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && LANGUAGE_ID.test(value)
}
