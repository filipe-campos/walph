import type { ToastsState } from '../types/toasts'

export function globalToastsState(): ToastsState {
  return { toasts: [] }
}
