import { t } from '@shared/i18n'
import { UserError } from '../errors'

const CONTAINER_ID = /^[0-9a-f]{12,64}$/

/**
 * Container reference from the renderer → what becomes an argument (always after `--`): a hex id of 12–64 digits,
 * or the name of a container from the last `list()` (converted into its short id). Anything else throws.
 */
export function resolveContainerRef(ref: unknown, known: readonly { id: string; name: string }[]): string {
  if (typeof ref === 'string') {
    if (CONTAINER_ID.test(ref)) return ref
    const byName = known.find((c) => c.name === ref)
    if (byName) return byName.id
  }
  throw new UserError(t().containers.errors.unknownContainer)
}

/** Compose project name accepted as the `-p` argument (lowercase, digits, `-` and `_`). */
export const COMPOSE_PROJECT = /^[a-z0-9][a-z0-9_-]*$/
