import { requestNotificationSound } from '../notifications/sound'
import { on } from './typed'

export function registerNotificationHandlers(): void {
  on('notifications:requestSound', (e) => requestNotificationSound(e.sender))
}
