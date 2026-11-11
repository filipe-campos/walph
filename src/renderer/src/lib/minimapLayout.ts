// Geometry of the minimap and of the overview ruler: all in numbers, without DOM or CodeMirror (testable).
// The minimap draws `lineHeight` px per line; a document shorter than the minimap stays at the top, a taller one
// scrolls
// proportionally to the editor scroll (as in VS Code).

export interface MinimapInput {
  /** Document lines. */
  lineCount: number
  /** Height of a line in the minimap (px). */
  lineHeight: number
  /** Available minimap height (px). */
  height: number
  /** Current editor scroll, total content height and visible height (editor px). */
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export interface MinimapLayout {
  /** Height of the whole document in the minimap. */
  contentHeight: number
  /** Offset (px) of the drawn content: 0 when the document fits. */
  offset: number
  /** First line (0-based) and one past the last visible in the minimap. */
  firstLine: number
  endLine: number
  /** Slider rectangle (the visible editor window), in minimap coordinates. */
  sliderTop: number
  sliderHeight: number
}

const MIN_SLIDER = 6

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), Math.max(min, max))

/** Scroll fraction (0–1) of the editor. */
function scrollRatio(i: Pick<MinimapInput, 'scrollTop' | 'scrollHeight' | 'clientHeight'>): number {
  const range = i.scrollHeight - i.clientHeight
  return range > 0 ? clamp(i.scrollTop / range, 0, 1) : 0
}

export function minimapLayout(i: MinimapInput): MinimapLayout {
  const contentHeight = i.lineCount * i.lineHeight
  const scrollHeight = Math.max(i.scrollHeight, 1)
  const ratio = scrollRatio(i)
  const tall = contentHeight > i.height
  const offset = tall ? (contentHeight - i.height) * ratio : 0
  const rawSlider = (contentHeight * i.clientHeight) / scrollHeight
  const sliderHeight = clamp(rawSlider, Math.min(MIN_SLIDER, i.height), i.height)
  // In a tall document the top is linear in the scroll fraction (the content offset was already subtracted).
  const sliderTop = tall
    ? ratio * (i.height - sliderHeight)
    : clamp((i.scrollTop / scrollHeight) * contentHeight, 0, i.height - sliderHeight)
  const firstLine = Math.max(0, Math.floor(offset / i.lineHeight))
  const endLine = Math.min(i.lineCount, Math.ceil((offset + i.height) / i.lineHeight))
  return { contentHeight, offset, firstLine, endLine, sliderTop, sliderHeight }
}

/** Y position (in the minimap) of a 0-based line. */
export function lineToY(line: number, layout: Pick<MinimapLayout, 'offset'>, lineHeight: number): number {
  return line * lineHeight - layout.offset
}

/** Editor `scrollTop` that puts the slider top at `sliderTopWanted` (minimap coordinates). */
export function scrollTopForSlider(sliderTopWanted: number, i: MinimapInput): number {
  const maxScroll = Math.max(0, i.scrollHeight - i.clientHeight)
  const { sliderHeight, contentHeight } = minimapLayout(i)
  if (contentHeight > i.height) {
    const room = i.height - sliderHeight
    const ratio = room > 0 ? clamp(sliderTopWanted / room, 0, 1) : 0
    return ratio * maxScroll
  }
  const scrollHeight = Math.max(i.scrollHeight, 1)
  return clamp((sliderTopWanted / Math.max(contentHeight, 1)) * scrollHeight, 0, maxScroll)
}

/** Vertical position (0–`height`) of a 1-based line in the overview ruler. */
export function rulerY(line: number, lineCount: number, height: number): number {
  if (lineCount <= 1) return 0
  return ((line - 1) / lineCount) * height
}
