// Session file writes: normally asynchronous (does not block main on every 400 ms `session:save` from the renderer),
// serialized per file and "the last one wins"; `flushSync` writes whatever is still pending synchronously (view close,
// read of the same session, app exit). Always atomic (`writeFileAtomic`).

import { writeFileAtomic, writeFileAtomicSync } from '../fs/atomicWrite'
import { createLog } from '../log'

const log = createLog('session')

interface Slot {
  latest: string
  version: number
  written: number
  running: boolean
}

export class AtomicWriter {
  private readonly slots = new Map<string, Slot>()

  /** Schedules writing `data` to `path`; a newer write replaces one that has not started yet. */
  write(path: string, data: unknown): void {
    const json = JSON.stringify(data)
    let slot = this.slots.get(path)
    if (!slot) this.slots.set(path, (slot = { latest: json, version: 0, written: 0, running: false }))
    slot.latest = json
    slot.version++
    if (!slot.running) void this.run(path, slot)
  }

  /** Is there a pending or in-flight write for the path? */
  isPending(path: string): boolean {
    const slot = this.slots.get(path)
    return !!slot && slot.written < slot.version
  }

  /** Writes whatever is pending now, synchronously (one path or all of them). */
  flushSync(path?: string): void {
    for (const [p, slot] of path ? [[path, this.slots.get(path)] as const] : this.slots) {
      if (!slot || slot.written >= slot.version) continue
      const version = slot.version
      try {
        writeFileAtomicSync(p, slot.latest, { mkdirp: true })
        slot.written = version
      } catch (err) {
        log.error('Could not save the session:', err)
        // Does not retry forever: the next normal write tries again.
        slot.written = version
      }
      // An in-flight `run` deletes the slot when it finishes; without one, delete it here.
      if (!slot.running) this.slots.delete(p)
    }
  }

  private async run(path: string, slot: Slot): Promise<void> {
    slot.running = true
    try {
      while (slot.written < slot.version) {
        const version = slot.version
        const json = slot.latest
        try {
          // A `flushSync` may have written something newer during the `await`: the veto runs with the rename
          // (synchronously) so this write does not overwrite the newer data.
          if (await writeFileAtomic(path, json, { mkdirp: true, beforeRename: () => slot.written < version })) {
            slot.written = version
          }
        } catch (err) {
          log.error('Could not save the session:', err)
          slot.written = version
        }
      }
    } finally {
      slot.running = false
      // Nothing pending: release the slot (otherwise it would keep the last JSON of every folder until the app closes).
      if (slot.written >= slot.version && this.slots.get(path) === slot) this.slots.delete(path)
    }
  }
}
