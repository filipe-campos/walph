/**
 * Error with an already translated message (`t()`), ready for the user: the IPC boundary passes it on as is.
 * `name` stays `Error` on purpose: Electron serializes `${name}: ${message}` and the renderer strips that prefix.
 */
export class UserError extends Error {}
