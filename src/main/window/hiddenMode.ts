import { app } from 'electron'

/**
 * Windows never shown (`WALPH_HIDDEN_WINDOWS=1`): E2E tests and app-testing run in the background, without opening
 * windows on screen or stealing focus. Ignored in the packaged app.
 */
export const hiddenWindows = !app.isPackaged && process.env.WALPH_HIDDEN_WINDOWS === '1'

/**
 * On Linux (X11/Xvfb) a window never shown gets frames at ~1/s: `requestAnimationFrame`, the CSS animation clock and
 * the minimap/xterm drawing run in slow motion and the E2E tests measure wrong times. Without the rate limit the
 * compositor produces frames normally. Call before `app.whenReady()`.
 */
export function applyHiddenModeSwitches(): void {
  if (hiddenWindows && process.platform === 'linux') app.commandLine.appendSwitch('disable-frame-rate-limit')
}

/**
 * Counter of internal main events read by the E2E tests (`electronApp.evaluate` on `globalThis.__walphTestEvents`), to
 * wait for work that produces nothing visible (e.g. the watcher rereading an unchanged file). Test mode only.
 */
export function countTestEvent(name: string): void {
  if (!hiddenWindows) return
  const g = globalThis as { __walphTestEvents?: Record<string, number> }
  const events = (g.__walphTestEvents ??= {})
  events[name] = (events[name] ?? 0) + 1
}
