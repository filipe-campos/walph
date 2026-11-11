import { isContextKey, type WhenContext } from './when'

// Shortcut context per webContents (the renderer reports `window:setContext`). WeakMap: goes away with the window.
const contexts = new WeakMap<object, WhenContext>()

/** Stores a value; an invalid key or value (the renderer is not trusted) is ignored. Returns whether it applied. */
export function setContext(owner: object, key: unknown, value: unknown): boolean {
  if (!isContextKey(key) || typeof value !== 'boolean') return false
  contexts.set(owner, { ...contexts.get(owner), [key]: value })
  return true
}

export function getContext(owner: object): WhenContext {
  return contexts.get(owner) ?? {}
}

/** Reloading the page drops the renderer state: the context goes back to empty (everything `false`). */
export function resetContext(owner: object): void {
  contexts.delete(owner)
}
