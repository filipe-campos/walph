import { get } from '../store'

/** Titles of the toasts visible now, in the order they were shown. */
export function toastTitles(): string[] {
  return get().toasts.map((toast) => toast.title)
}
