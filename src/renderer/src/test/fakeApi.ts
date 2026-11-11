import { isRecord } from '@shared/guards'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { WalphApi } from '@shared/types'

type Fn = (...args: never[]) => unknown
type Listener = (...args: unknown[]) => void

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Fn ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

type FakeApi = Spied<WalphApi>
type Spied<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : T[K] extends object
      ? Spied<T[K]>
      : T[K]
}

type Emitter<T> = {
  [
    K in keyof T as K extends `on${string}` ? K : T[K] extends Fn ? never : T[K] extends object ? K : never
  ]: T[K] extends (cb: (...args: infer A) => unknown, ...rest: never[]) => unknown
    ? (...args: A) => void
    : Emitter<T[K]>
}

export interface FakeApiHandle {
  api: FakeApi
  /** Fires the `on*` channel for whoever subscribed via the default implementation: `emit.claude.onEvent(event)`. */
  emit: Emitter<WalphApi>
  /** Forgets the subscriptions made so far. */
  reset(): void
}

type NamespaceKey = {
  [K in keyof WalphApi]: WalphApi[K] extends Fn ? never : WalphApi[K] extends object ? K : never
}[keyof WalphApi]
type PrimitiveKey = { [K in keyof WalphApi]: WalphApi[K] extends Fn | object ? never : K }[keyof WalphApi]

type SyncKey<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => infer R
    ? K extends `on${string}`
      ? never
      : [R] extends [Promise<unknown>]
        ? never
        : K
    : never
}[keyof T]
type SyncDefaults = {
  [N in NamespaceKey as [SyncKey<WalphApi[N]>] extends [never] ? never : N]: {
    [K in SyncKey<WalphApi[N]>]: WalphApi[N][K] extends (...args: never[]) => infer R ? () => R : never
  }
}

const NAMESPACES: Record<NamespaceKey, true> = {
  window: true,
  dialog: true,
  settings: true,
  snippets: true,
  tabs: true,
  workspace: true,
  recent: true,
  session: true,
  fs: true,
  files: true,
  search: true,
  git: true,
  lsp: true,
  debug: true,
  claude: true,
  workspaces: true,
  notifications: true,
  docker: true,
  terminal: true,
  update: true,
  cli: true
}
const PRIMITIVES: Pick<WalphApi, PrimitiveKey> = {
  platform: 'linux',
  isPackaged: false,
  homeDir: '/home/test',
  locale: ''
}

// Synchronous contract methods: returning a Promise here would become a truthy value (`pathForFile`) or an
// unexpected return.
const SYNC_DEFAULTS: SyncDefaults = {
  window: {
    run: () => undefined,
    setContext: () => undefined,
    setDirty: () => undefined,
    confirmClose: () => undefined,
    cancelClose: () => undefined,
    openExternal: () => undefined
  },
  fs: { copyPath: () => undefined, reveal: () => undefined },
  files: { pathForFile: () => '' },
  docker: { startStats: () => undefined, stopStats: () => undefined, stopLogs: () => undefined },
  lsp: {
    open: () => undefined,
    change: () => undefined,
    save: () => undefined,
    close: () => undefined,
    applyEditResult: () => undefined
  },
  debug: { setBreakpoints: () => undefined },
  claude: { setEditorContext: () => undefined, markRead: () => undefined },
  update: { install: () => undefined },
  terminal: { write: () => undefined, resize: () => undefined, kill: () => undefined, ack: () => undefined },
  git: { cancelClone: () => undefined },
  session: { save: () => undefined },
  notifications: { requestSound: () => undefined },
  workspaces: {
    activate: () => undefined,
    move: () => undefined,
    setMuted: () => undefined,
    reportBranch: () => undefined
  }
}

const isSubscription = (key: string): boolean => /^on[A-Z]/.test(key)
const isNamespace = (key: string): key is NamespaceKey => Object.hasOwn(NAMESPACES, key)
const isPrimitive = (key: string): key is PrimitiveKey => Object.hasOwn(PRIMITIVES, key)

// Library probes (await, matchers, React, JSON) that must not find an invented method.
const PROBES = new Set(['then', 'asymmetricMatch', '$$typeof', 'toJSON'])

function lazyObject(member: (key: string) => unknown): Record<string, unknown> {
  const cache = new Map<string, unknown>()
  return new Proxy<Record<string, unknown>>(
    {},
    {
      get(_, key) {
        if (typeof key === 'symbol' || PROBES.has(key)) return undefined
        if (!cache.has(key)) cache.set(key, member(key))
        return cache.get(key)
      }
    }
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/**
 * Installs a fake API on `window.api`: each method is a `vi.fn` that resolves `undefined` (the synchronous contract
 * methods return the neutral value: `undefined`, or `''` for `pathForFile`; the `on*` ones store the callback and
 * return the disposer). `overrides` replaces methods or values; an `on*` override still subscribes. `platform` is
 * `'linux'` by default (the strictest path comparison): pass `'darwin'` or `'win32'` where the test needs it. Call
 * BEFORE importing the modules that read `window.api` on load (`await import(...)`).
 */
export function installFakeApi(overrides: DeepPartial<WalphApi> = {}): FakeApiHandle {
  const listeners = new Map<string, Set<Listener>>()

  const subscribe = (channel: string, cb: Listener): (() => void) => {
    const set = listeners.get(channel) ?? new Set<Listener>()
    listeners.set(channel, set)
    set.add(cb)
    return () => void set.delete(cb)
  }

  const method = (channel: string, key: string, override: unknown, sync: unknown): unknown => {
    if (isSubscription(key)) {
      const impl = typeof override === 'function' ? (override as Fn) : undefined
      return vi.fn((cb: unknown, ...rest: unknown[]) => {
        if (typeof cb !== 'function') throw new TypeError(`${channel} expects the callback as the first argument`)
        const off = subscribe(channel, cb as Listener)
        const own = impl ? (impl as (...a: unknown[]) => unknown)(cb, ...rest) : undefined
        return () => {
          off()
          if (typeof own === 'function') (own as () => void)()
        }
      })
    }
    if (typeof override === 'function') return vi.isMockFunction(override) ? override : vi.fn(override as Fn)
    if (typeof sync === 'function') return vi.fn(sync as Fn)
    return vi.fn(() => Promise.resolve(undefined))
  }

  const root = asRecord(overrides)
  const api = lazyObject((key) => {
    if (isPrimitive(key)) return root[key] ?? PRIMITIVES[key]
    if (!isNamespace(key)) return method(key, key, root[key], undefined)
    const own = asRecord(root[key])
    const sync = asRecord((SYNC_DEFAULTS as Record<string, unknown>)[key])
    return lazyObject((name) => method(`${key}.${name}`, name, own[name], sync[name]))
  })

  const fire = (channel: string, args: unknown[]): void => {
    const subscribers = [...(listeners.get(channel) ?? [])]
    if (subscribers.length === 0) throw new Error(`emit ${channel} without subscribers`)
    for (const cb of subscribers) cb(...args)
  }
  const emit = lazyObject((key) =>
    isNamespace(key)
      ? lazyObject(
          (name) =>
            (...args: unknown[]) =>
              fire(`${key}.${name}`, args)
        )
      : (...args: unknown[]) => fire(key, args)
  )

  ;(window as unknown as { api: unknown }).api = api
  return { api: api as unknown as FakeApi, emit: emit as unknown as Emitter<WalphApi>, reset: () => listeners.clear() }
}
