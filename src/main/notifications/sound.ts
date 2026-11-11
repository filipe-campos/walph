// Conversation notice sound: the renderer asks, main decides (the view's setting + one play per burst) and sends back
// `notifications:playSound` for the view itself to play (main has no way to play audio).

import { type WebContents } from 'electron'
import { send } from '../window/send'
import { countTestEvent, hiddenWindows } from '../window/hiddenMode'
import { getEffectiveSettings } from '../settings/state'
import { createSoundGate } from './soundGate'

// Global on purpose: notices from different windows in the same burst also play only once.
const gate = createSoundGate()

/** Plays the notice sound in view `wc`, if enabled in its settings and outside a burst. */
export function requestNotificationSound(wc: WebContents): void {
  if (wc.isDestroyed() || !getEffectiveSettings(wc)['claude.notifications.sound']) return
  if (!gate.allow(Date.now())) return
  // Tests run without sound: only records the request for the spec to check.
  if (hiddenWindows) {
    countTestEvent('notificationSound')
    return
  }
  send(wc, 'notifications:playSound')
}
