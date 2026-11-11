export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // Removes the prefix Electron adds to errors coming from ipcMain.handle.
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
