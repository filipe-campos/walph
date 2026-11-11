import type { QuickInputState } from '../types/quickInput'

// An open branch picker would get stuck on "loading" in the new folder.
export function scopedQuickInputState(): QuickInputState {
  return { quickInput: null }
}
