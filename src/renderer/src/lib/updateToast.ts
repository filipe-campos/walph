import { t } from '@shared/i18n'
import type { UpdateNotice } from '@shared/types'
import type { Toast } from '../types/toasts'

/** Fixed key: each update notice replaces the previous one. */
export const UPDATE_TOAST_KEY = 'update'

/**
 * Update notice -> toast options. Progress (`checking`/`downloading`) stays until the next notice, without a bar to
 * stay dismissible; a short
 * result goes away by itself; `downloaded` waits for the user's decision (no `duration`); an error stays longer.
 */
export function updateToast(notice: UpdateNotice, actions: { install: () => void }): Omit<Toast, 'id'> {
  const base = { key: UPDATE_TOAST_KEY, title: notice.message }
  switch (notice.kind) {
    case 'checking':
    case 'downloading':
      return { ...base, tone: 'info' }
    case 'upToDate':
      return { ...base, tone: 'done', duration: 4000 }
    case 'downloaded':
      return {
        ...base,
        tone: 'done',
        description: t().app.update.restartDescription,
        actions: [{ label: t().app.update.restartAndUpdate, onClick: actions.install }]
      }
    case 'error':
      return { ...base, tone: 'error', duration: 8000 }
  }
}
