export const ZOOM_MIN = 0.05
export const ZOOM_MAX = 16

export const clampZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))

/** Scale that fits the whole image in the area, without enlarging beyond 100%. */
export function fitScale(view: { width: number; height: number }, image: { width: number; height: number }): number {
  if (image.width <= 0 || image.height <= 0 || view.width <= 0 || view.height <= 0) return 1
  return Math.min(1, view.width / image.width, view.height / image.height)
}

/** Size in bytes of the content of a base64 data URL (the read goes through main, which only returns data URLs). */
export function dataUrlBytes(url: string): number | null {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0) return null
  const body = url.slice(comma + 1)
  if (!url.slice(0, comma).endsWith(';base64')) return decodeURIComponent(body).length
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.floor((body.length * 3) / 4) - padding
}

/** Zoom factor per button/shortcut step: each step multiplies by 1.25. */
export const stepZoom = (zoom: number, direction: 1 | -1): number => clampZoom(zoom * 1.25 ** direction)

/** Wheel/pinch zoom (`ctrlKey` + `deltaY`): smooth and proportional to the movement. */
export const wheelZoom = (zoom: number, deltaY: number): number => clampZoom(zoom * Math.exp(-deltaY * 0.01))
