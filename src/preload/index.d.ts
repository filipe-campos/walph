import type { WalphApi } from '@shared/types'

declare global {
  interface Window {
    api: WalphApi
  }
}

export {}
