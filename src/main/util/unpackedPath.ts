// In the packaged app, files executed by another process live outside the .asar (see `asarUnpack`). Only the `app.asar`
// path segment counts: a user directory named `my-app.asar` must not be rewritten.
export function unpackedPath(path: string): string {
  return path.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}
