// Notification sound: a single audio element, reused (the file is loaded once, on the first play).
import soundUrl from '../assets/sounds/notification.mp3'

const VOLUME = 0.6

let audio: HTMLAudioElement | null = null

export function playNotificationSound(): void {
  audio ??= Object.assign(new Audio(soundUrl), { volume: VOLUME })
  // A new play restarts from the beginning instead of waiting for the previous one to end.
  audio.currentTime = 0
  // No audio output or blocked by the system: the visual notice is enough.
  audio.play().catch(() => undefined)
}
