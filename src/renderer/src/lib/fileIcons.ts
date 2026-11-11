// File and folder icon theme of the Walph design system (FileIcon component): each file gets a color and a symbol
// by type, each folder by the role its name indicates. Tables copied from the design system; the drawing lives in
// `components/common/FileIcon.tsx`. Acronyms and generic glyphs, never brand logos.

/** Item of a 16×16 glyph: pure stroke (string), duotone shape (stroke + 20% fill) or solid shape. */
export type GlyphItem = string | { d: string; solid?: boolean }

const D = (d: string): GlyphItem => ({ d })
const CIRCLE = 'M8 14.2A6.2 6.2 0 1 0 8 1.8A6.2 6.2 0 0 0 8 14.2z'

/** Own palette of 17 light tones (all ≥3:1 over `bg-200`). Type colors, never state colors. */
export const FILE_ICON_COLORS = {
  blue: '#5b9dff',
  sky: '#4fd1ff',
  cyan: '#2fd3e0',
  teal: '#3ddcc4',
  green: '#5fdc8a',
  lime: '#a6e05a',
  yellow: '#ffd75e',
  amber: '#f5b951',
  orange: '#ff9a4d',
  coral: '#ff7b5c',
  red: '#ff6b7a',
  pink: '#ff7ac6',
  violet: '#b97cff',
  indigo: '#8b8cff',
  slate: '#9aa3c7',
  gray: '#8a84a3',
  brown: '#d0905a'
} as const

type FileIconColor = keyof typeof FILE_ICON_COLORS

/** The same palette darkened for light themes (≥3.4:1 over the light `bg-200`; white acronym on top). */
const FILE_ICON_COLORS_LIGHT: Record<FileIconColor, string> = {
  blue: '#287fff',
  sky: '#008dbf',
  cyan: '#17929c',
  teal: '#1b9381',
  green: '#219649',
  lime: '#5d901b',
  yellow: '#a57c00',
  amber: '#b2750a',
  orange: '#d75d00',
  coral: '#fa3000',
  red: '#ff293e',
  pink: '#f9008f',
  violet: '#a658ff',
  indigo: '#7173ff',
  slate: '#7682b3',
  gray: '#847e9f',
  brown: '#bc7336'
}

/**
 * Color of the acronym and of the glyph cut out of the folder: dark over the light palette, white over the darkened
 * one.
 */
export const FILE_ICON_CUT = { dark: '#0a090f', light: '#ffffff' } as const

/**
 * CSS variables of the active theme palette (`--fi-<color>`, `--fi-cut`), written on `:root` by appearance. `FileIcon`
 * reads `var(--fi-…)` with the dark palette as fallback, for the first paint.
 */
export function fileIconVars(kind: 'dark' | 'light'): Record<string, string> {
  const palette = kind === 'light' ? FILE_ICON_COLORS_LIGHT : FILE_ICON_COLORS
  const vars: Record<string, string> = { '--fi-cut': FILE_ICON_CUT[kind] }
  for (const [name, value] of Object.entries(palette)) vars[`--fi-${name}`] = value
  return vars
}

/** `[glyph | ':ACRONYM', color]`: a string starting with ':' becomes a badge with the acronym. */
type Hit = [glyph: string, color: FileIconColor]

export const FILE_ICON_GLYPHS: Record<string, GlyphItem[]> = {
  code: ['M5.6 4.6L2.4 8L5.6 11.4', 'M10.4 4.6L13.6 8L10.4 11.4', 'M9 3.4L7 12.6'],
  braces: [
    'M6.5 2.8C5.1 2.8 4.5 3.4 4.5 4.6V6.2C4.5 7 4 7.6 3.1 8C4 8.4 4.5 9 4.5 9.8V11.4C4.5 12.6 5.1 13.2 6.5 13.2',
    'M10.5 2.8C11.9 2.8 12.5 3.4 12.5 4.6V6.2C12.5 7 13 7.6 13.9 8C13 8.4 12.5 9 12.5 9.8V11.4C12.5 12.6 11.9 13.2 10.5 13.2'
  ],
  hash: ['M6.4 2.6L5 13.4', 'M11 2.6L9.6 13.4', 'M3 5.5H13.6', 'M2.4 10.5H13'],
  angle: [
    'M5.4 4.2L1.8 8L5.4 11.8',
    'M10.6 4.2L14.2 8L10.6 11.8',
    { d: 'M8 9A1 1 0 1 0 8 7A1 1 0 0 0 8 9z', solid: true }
  ],
  layers: [D('M8 2L14 5.2L8 8.4L2 5.2z'), 'M2 8.2L8 11.4L14 8.2', 'M2 11L8 14.2L14 11'],
  grid: [
    D('M2.5 2.5H7.5V7.5H2.5z'),
    D('M9.5 2.5H13.5V7.5H9.5z'),
    D('M2.5 9.5H7.5V13.5H2.5z'),
    D('M9.5 9.5H13.5V13.5H9.5z')
  ],
  page: [
    D('M4.5 1.5H9.2L12.5 5.1V13.5A1 1 0 0 1 11.5 14.5H4.5A1 1 0 0 1 3.5 13.5V2.5A1 1 0 0 1 4.5 1.5z'),
    'M9.5 1.8V5.5H12.5',
    'M5.8 8.5H10.2',
    'M5.8 11.5H8.6'
  ],
  blocks: [
    D('M8 1.6L10.6 4.2L8 6.8L5.4 4.2z'),
    D('M4.2 5.4L6.8 8L4.2 10.6L1.6 8z'),
    D('M11.8 5.4L14.4 8L11.8 10.6L9.2 8z'),
    D('M8 9.2L10.6 11.8L8 14.4L5.4 11.8z')
  ],
  layout: [D('M2.5 2.5H13.5V13.5H2.5z'), 'M2.4 5.5H13.6', 'M6.5 5.8V13.4'],
  hook: [
    'M10.5 2.2V8.8A3.6 3.6 0 0 1 3.5 8.8V7.4',
    'M1.9 9L3.4 7.4L4.9 9',
    { d: 'M10.6 3.4A1.2 1.2 0 1 0 10.6 1A1.2 1.2 0 0 0 10.6 3.4z', solid: true }
  ],
  wrench: [
    D(
      'M13.4 4.4A3.4 3.4 0 0 1 8.8 8.3L4 13.1A1.5 1.5 0 0 1 1.9 11L6.7 6.2A3.4 3.4 0 0 1 10.6 1.6L8.4 3.8L8.9 6.1L11.2 6.6z'
    )
  ],
  server: [
    D('M2.5 2.5H13.5V7.5H2.5z'),
    D('M2.5 9.5H13.5V13.5H2.5z'),
    { d: 'M5 5.6A0.8 0.8 0 1 0 5 4A0.8 0.8 0 0 0 5 5.6z', solid: true },
    { d: 'M5 12A0.8 0.8 0 1 0 5 10.4A0.8 0.8 0 0 0 5 12z', solid: true }
  ],
  plug: ['M5.5 1.5V4.5', 'M10.5 1.5V4.5', D('M3.5 4.5H12.5V7.1A4.4 4.4 0 0 1 3.5 7.1z'), 'M8.5 11.5V13.9'],
  route: ['M8.5 1.8V14.2', D('M8.5 3.5H13.1L14.5 4.8L13.1 6.5H8.5z'), D('M8.5 8.5H3.9L2.5 9.6L3.9 11.5H8.5z')],
  switch: ['M2.4 5.5H12.8', 'M10.2 2.6L12.8 5.2L10.2 7.8', 'M13.6 10.5H3.2', 'M5.8 8.2L3.2 10.8L5.8 13.4'],
  filter: [D('M2.2 2.5H13.8L9.5 8.1V12.5L6.5 13.9V8.1z')],
  cube: [D('M8 1.8L13.5 4.9V11.1L8 14.2L2.5 11.1V4.9z'), 'M8.5 8V14.2', 'M8 8L13.4 4.9', 'M8 8L2.6 4.9'],
  database: [
    D('M2.5 4C2.5 2.8 4.8 2 7.7 2C10.6 2 13.5 2.8 13.5 4V12C13.5 13.2 11.2 14 8.3 14C5.4 14 2.5 13.2 2.5 12z'),
    'M2.8 4C2.8 5.2 5.1 6 8 6C10.9 6 13.2 5.2 13.2 4',
    'M2.8 8C2.8 9.2 5.1 10 8 10C10.9 10 13.2 9.2 13.2 8'
  ],
  migrate: [
    D('M1.5 4.7C1.5 3.7 3.3 3 5.5 3C7.7 3 9.5 3.7 9.5 4.7V12.3C9.5 13.3 7.7 14 5.5 14C3.3 14 1.5 13.3 1.5 12.3z'),
    'M1.5 4.7C1.5 5.7 3.3 6.4 5.5 6.4C7.7 6.4 9.5 5.7 9.5 4.7',
    'M10.5 8.5H14.1',
    'M12.3 6.7L14.1 8.5L12.3 10.3'
  ],
  bag: [D('M2.8 5.5H13.2L12.3 14.5H3.7z'), 'M5.5 5.4V4.4A2.4 2.4 0 0 1 10.5 4.4V5.4'],
  type: [D('M2.5 2.5H13.5V13.5H2.5z'), 'M5.2 5.5H10.8', 'M8.5 5.4V11'],
  gear: [
    D(
      'M12.76 6.84L14.5 6.93V9.07L12.76 9.16L12.19 10.54L13.14 11.64L11.64 13.14L10.54 12.19L9.16 12.76L9.07 14.5H6.93L6.84 12.76L5.46 12.19L4.36 13.14L2.86 11.64L3.81 10.54L3.24 9.16L1.5 9.07V6.93L3.24 6.84L3.81 5.46L2.86 4.36L4.36 2.86L5.46 3.81L6.84 3.24L6.93 1.5H9.07L9.16 3.24L10.54 3.81L11.64 2.86L13.14 4.36L12.19 5.46z'
    ),
    'M8 10.1A2.1 2.1 0 1 0 8 5.9A2.1 2.1 0 0 0 8 10.1z'
  ],
  list: [
    'M6 4.5H13.4',
    'M6 8.5H13.4',
    'M6 12.5H13.4',
    { d: 'M3 5.4A0.9 0.9 0 1 0 3 3.6A0.9 0.9 0 0 0 3 5.4z', solid: true },
    { d: 'M3 9.4A0.9 0.9 0 1 0 3 7.6A0.9 0.9 0 0 0 3 9.4z', solid: true },
    { d: 'M3 13.4A0.9 0.9 0 1 0 3 11.6A0.9 0.9 0 0 0 3 13.4z', solid: true }
  ],
  image: [
    D('M2.5 2.5H13.5V13.5H2.5z'),
    'M2.2 11.2L5.8 7.6L8.4 10.2L10.2 8.4L13.8 12',
    { d: 'M10.6 6.6A1.2 1.2 0 1 0 10.6 4.2A1.2 1.2 0 0 0 10.6 6.6z', solid: true }
  ],
  font: ['M2.8 13.5L8 2.7L13.2 13.5', 'M4.8 9.5H11.2'],
  brush: [
    D('M13 2.2C13.7 2.8 9.6 8.4 8.2 9.6L6.6 8C7.8 6.6 12.3 1.6 13 2.2z'),
    D('M6 9.4C4.4 9.4 3.4 10.4 3.4 11.8C3.4 12.6 2.8 13.2 2 13.4C4.6 14.6 7.6 13.6 7.6 11z')
  ],
  globe: [
    D(CIRCLE),
    'M1.8 8.5H14.2',
    'M8 2.3C9.7 4.1 10.6 6.2 10.6 8.5C10.6 10.8 9.7 12.9 8 14.7C6.3 12.9 5.4 10.8 5.4 8.5C5.4 6.2 6.3 4.1 8 2.3z'
  ],
  flask: [
    'M5.8 2.5H10.2',
    D('M6.5 2.5V6.2L3.1 12.8A1.1 1.1 0 0 0 4.05 14.5H11.95A1.1 1.1 0 0 0 12.9 12.8L9.5 6.2V2.5z'),
    'M4.6 9.5H11.4'
  ],
  book: [
    D('M3.5 2.5H11.1A1.4 1.4 0 0 1 12.5 3.9V13.5H5.1A1.6 1.6 0 0 1 3.5 11.9z'),
    'M3 12.1A1.6 1.6 0 0 1 4.6 10.5H12.4',
    'M6 5.5H9.6'
  ],
  terminal: [
    D('M3 2.5H13A1.5 1.5 0 0 1 14.5 4V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4A1.5 1.5 0 0 1 3 2.5z'),
    'M4.8 6.3L6.8 8L4.8 9.7',
    'M8.6 10.5H11.2'
  ],
  package: [
    D('M8 1.8L13.5 4.8V11.2L8 14.2L2.5 11.2V4.8z'),
    'M2.4 4.8L8 7.8L13.6 4.8',
    'M8.5 7.8V14.2',
    'M5.2 3.3L10.8 6.3'
  ],
  git: [
    'M4.5 4.6V11.4',
    'M11.5 6.1V6.5A3 3 0 0 1 8.5 9.5H4.5',
    D('M4.5 4.6A1.5 1.5 0 1 0 4.5 1.6A1.5 1.5 0 0 0 4.5 4.6z'),
    D('M11.5 6.1A1.5 1.5 0 1 0 11.5 3.1A1.5 1.5 0 0 0 11.5 6.1z'),
    D('M4.5 14.4A1.5 1.5 0 1 0 4.5 11.4A1.5 1.5 0 0 0 4.5 14.4z')
  ],
  brain: [
    D(
      'M7.5 2.6A2.3 2.3 0 0 0 3.9 4.2A2.3 2.3 0 0 0 2.2 7.3A2.4 2.4 0 0 0 2.7 10.9A2.3 2.3 0 0 0 5.4 13.4A2.1 2.1 0 0 0 7.5 14.5z'
    ),
    D(
      'M8.5 2.6A2.3 2.3 0 0 1 12.1 4.2A2.3 2.3 0 0 1 13.8 7.3A2.4 2.4 0 0 1 13.3 10.9A2.3 2.3 0 0 1 10.6 13.4A2.1 2.1 0 0 1 8.5 14.5z'
    ),
    'M4.6 6.4C5.5 6.4 6.2 6.8 6.6 7.5',
    'M3.9 9.6C4.7 9.2 5.7 9.3 6.4 9.9',
    'M11.4 6.4C10.5 6.4 9.8 6.8 9.4 7.5',
    'M12.1 9.6C11.3 9.2 10.3 9.3 9.6 9.9'
  ],
  container: [
    D('M1.5 7.5H14.5V10.5A3 3 0 0 1 11.5 13.5H4.5A3 3 0 0 1 1.5 10.5z'),
    D('M3.5 4.5H6.5V7.5H3.5z'),
    D('M6.5 4.5H9.5V7.5H6.5z'),
    D('M6.5 2.5H9.5V4.5H6.5z'),
    D('M9.5 4.5H12.5V7.5H9.5z')
  ],
  containers: [D('M2.5 8.5H14.5V13.5H2.5z'), D('M2.5 3.5H7.5V7.5H2.5z'), D('M8.5 3.5H14.5V7.5H8.5z'), 'M4.6 10.5H11.4'],
  cloud: [D('M4.6 12.5A3.1 3.1 0 0 1 4.1 6.3A4.1 4.1 0 0 1 11.9 5.5A3.5 3.5 0 0 1 12.3 12.5z')],
  bolt: [D('M9.2 1.6L3.4 9.5H7.5L6.6 14.4L12.6 6.5H8.4z')],
  language: [
    'M2 3.5H9',
    'M5.5 2.2V3.8',
    'M8 3.8C7.4 6.6 5.4 8.8 2.4 10',
    'M4.4 6C5.2 7.6 6.4 8.8 8 9.6',
    'M9 14L11.6 7.6L14.2 14',
    'M9.9 12.5H13.3'
  ],
  logs: ['M3 4.5H13', 'M3 8.5H9.5', 'M3 12.5H11.5'],
  hourglass: [
    D(
      'M4.5 2.5H12.5V4.3C12.5 6 10.9 7.3 9.3 8.5C10.9 9.7 12.5 11 12.5 12.7V14.5H4.5V12.7C4.5 11 6.1 9.7 7.7 8.5C6.1 7.3 4.5 6 4.5 4.3z'
    )
  ],
  shield: [
    D('M8.5 1.8L13.5 3.7V7.8C13.5 10.8 11.4 13.1 8.5 14.2C5.6 13.1 3.5 10.8 3.5 7.8V3.7z'),
    'M6.3 8L7.9 9.6L10.9 6.6'
  ],
  key: [
    D('M5.4 13.4A3.4 3.4 0 1 0 5.4 6.6A3.4 3.4 0 0 0 5.4 13.4z'),
    'M7.8 7.6L13.6 1.8',
    'M11.4 3.8L13.2 5.6',
    'M9.8 5.4L11.2 6.8'
  ],
  mail: [D('M1.5 3.5H14.5V12.5H1.5z'), 'M2 3.8L8 8.6L14 3.8'],
  clock: [D(CIRCLE), 'M8.5 4.6V8L10.9 9.6'],
  graph: [
    'M3.6 4.5H12.4',
    'M3.6 4.5L8 12.7',
    'M12.4 4.5L8 12.7',
    { d: 'M3.6 6.3A1.8 1.8 0 1 0 3.6 2.7A1.8 1.8 0 0 0 3.6 6.3z', solid: true },
    { d: 'M12.4 6.3A1.8 1.8 0 1 0 12.4 2.7A1.8 1.8 0 0 0 12.4 6.3z', solid: true },
    { d: 'M8 14.5A1.8 1.8 0 1 0 8 10.9A1.8 1.8 0 0 0 8 14.5z', solid: true }
  ],
  prism: [D('M8.5 2.1L14.7 13.5H2.3z'), 'M8.5 2.1V13.5'],
  monitor: [D('M1.5 2.5H14.5V11.5H1.5z'), 'M5.6 14.5H10.4', 'M8.5 11.2V14'],
  phone: [D('M4.5 1.5H11.5V14.5H4.5z'), 'M7 12.5H9'],
  play: [D(CIRCLE), { d: 'M7 5.2V10.8L11.4 8z', solid: true }],
  chart: ['M2.2 13.5H13.8', D('M3.5 8.5H5.5V13.5H3.5z'), D('M6.5 4.5H9.5V13.5H6.5z'), D('M10.5 2.5H12.5V13.5H10.5z')],
  puzzle: [
    D(
      'M2.5 4.5H5.4A1.6 1.6 0 1 1 8.6 4.5H11.5V7.3A1.6 1.6 0 1 1 11.5 10.5V13.5H8.6A1.6 1.6 0 1 0 5.4 13.5H2.5V10.5A1.6 1.6 0 1 0 2.5 7.3z'
    )
  ],
  share: [
    'M4.2 8L11.8 4',
    'M4.2 8L11.8 12',
    { d: 'M4.2 10A2 2 0 1 0 4.2 6A2 2 0 0 0 4.2 10z', solid: true },
    { d: 'M11.8 6A2 2 0 1 0 11.8 2A2 2 0 0 0 11.8 6z', solid: true },
    { d: 'M11.8 14A2 2 0 1 0 11.8 10A2 2 0 0 0 11.8 14z', solid: true }
  ],
  lambda: ['M3.4 2.5H5.2C6 2.5 6.6 2.9 6.9 3.7L11.1 13.5H12.7', 'M6.9 6.5L3.8 13.5'],
  signal: ['M1.8 8.5H4.4L6.2 3.9L9.6 13.1L11.4 8.5H14.2'],
  video: [D('M1.5 3.5H10.5V12.5H1.5z'), D('M10.5 7L14.5 4.8V11.2L10.5 9z')],
  audio: [
    'M6.5 12V3.6L13.5 2V10.4',
    D('M4.3 13.9A1.8 1.8 0 1 0 4.3 10.3A1.8 1.8 0 0 0 4.3 13.9z'),
    D('M11.4 12.2A1.8 1.8 0 1 0 11.4 8.6A1.8 1.8 0 0 0 11.4 12.2z')
  ],
  archive: [D('M2.5 2.5H13.5V13.5H2.5z'), 'M8.5 2.2V3.6', 'M8.5 5V6.4', 'M8.5 7.8V9', D('M6.5 9.5H9.5V11.5H6.5z')],
  lock: [D('M3.5 7.5H12.5V14.5H3.5z'), 'M5.5 7.5V5.7A2.8 2.8 0 0 1 10.5 5.7V7.5', 'M8.5 10.1V11.9'],
  text: ['M2.8 3.5H13.2', 'M2.8 6.5H13.2', 'M2.8 10.5H13.2', 'M2.8 13.5H9.2'],
  table: [D('M2.5 2.5H14.5V13.5H2.5z'), 'M2 6.5H14', 'M2 9.5H14', 'M6.5 2.6V13.4'],
  markdown: [
    D(
      'M2.6 3.5H13.4A1.1 1.1 0 0 1 14.5 4.6V11.4A1.1 1.1 0 0 1 13.4 12.5H2.6A1.1 1.1 0 0 1 1.5 11.4V4.6A1.1 1.1 0 0 1 2.6 3.5z'
    ),
    'M4.5 10.2V5.8L6.1 8.1L8.5 5.8V10.2',
    'M11.5 5.8V10.1',
    'M9.6 8.8L11 10.2L12.4 8.8'
  ],
  vector: [
    D('M8.5 1.8L12.5 7.4L8.5 14.2L4.5 7.4z'),
    'M8.5 1.8V8.2',
    { d: 'M8.5 9.2A1.1 1.1 0 1 0 8.5 7A1.1 1.1 0 0 0 8.5 9.2z', solid: true }
  ],
  law: [
    'M8.5 2V13.6',
    'M4.9 13.5H12.1',
    'M3.3 4.5H13.7',
    D('M3.3 4.4L1.7 8.6A1.9 1.9 0 0 0 4.9 8.6z'),
    D('M13.7 4.4L12.1 8.6A1.9 1.9 0 0 0 15.3 8.6z')
  ],
  history: ['M2.8 8.3A5.2 5.2 0 1 0 4.4 4.5', 'M2.5 2.7V5.5H5.2', 'M8.5 5.5V8.3L10 9.7'],
  people: [
    D('M6 7.3A2.4 2.4 0 1 0 6 2.5A2.4 2.4 0 0 0 6 7.3z'),
    D('M1.6 13.5A4.4 4.4 0 0 1 10.4 13.5z'),
    'M10.6 2.7A2.4 2.4 0 0 1 10.6 7.1',
    'M12 9.3A4.4 4.4 0 0 1 14.4 13.5'
  ],
  hammer: [D('M2.2 4.6L6 2L10.2 4.8L8.4 6.6z'), 'M7.6 5.6L13.6 12.8A1.1 1.1 0 0 1 12 14.2L5.8 7.2'],
  bot: [
    D('M2.5 5.5H13.5V13.5H2.5z'),
    'M8.5 5.6V3',
    { d: 'M8 3.2A1 1 0 1 0 8 1.2A1 1 0 0 0 8 3.2z', solid: true },
    { d: 'M5.8 9.6A1 1 0 1 0 5.8 7.6A1 1 0 0 0 5.8 9.6z', solid: true },
    { d: 'M10.2 9.6A1 1 0 1 0 10.2 7.6A1 1 0 0 0 10.2 9.6z', solid: true },
    'M6.4 11.5H9.6'
  ],
  diff: [
    D(
      'M3.6 1.5H12.4A1.1 1.1 0 0 1 13.5 2.6V13.4A1.1 1.1 0 0 1 12.4 14.5H3.6A1.1 1.1 0 0 1 2.5 13.4V2.6A1.1 1.1 0 0 1 3.6 1.5z'
    ),
    'M8.5 4.6V8.4',
    'M6.1 6.5H9.9',
    'M6.1 11.5H9.9'
  ],
  hexagon: [
    D('M8 1.6L13.5 4.8V11.2L8 14.4L2.5 11.2V4.8z'),
    { d: 'M8 9.6A1.6 1.6 0 1 0 8 6.4A1.6 1.6 0 0 0 8 9.6z', solid: true }
  ],
  camera: [
    D('M1.5 5.5H4.6L5.8 3.5H10.2L11.4 5.5H14.5V13.5H1.5z'),
    D('M8 11.6A2.4 2.4 0 1 0 8 6.8A2.4 2.4 0 0 0 8 11.6z')
  ],
  notebook: [D('M3.5 1.5H12.5V14.5H3.5z'), 'M1.9 4.5H4.9', 'M1.9 8.5H4.9', 'M1.9 11.5H4.9', 'M7.1 5.5H10.5'],
  spark: [
    D(
      'M7 1.8L8.2 5.1A2.2 2.2 0 0 0 9.5 6.4L12.8 7.6L9.5 8.8A2.2 2.2 0 0 0 8.2 10.1L7 13.4L5.8 10.1A2.2 2.2 0 0 0 4.5 8.8L1.2 7.6L4.5 6.4A2.2 2.2 0 0 0 5.8 5.1z'
    ),
    { d: 'M12.8 1.2L13.25 2.35L14.4 2.8L13.25 3.25L12.8 4.4L12.35 3.25L11.2 2.8L12.35 2.35z', solid: true }
  ],
  gauge: [
    'M2.4 11.8A5.8 5.8 0 1 1 13.6 11.8',
    'M8 10.6L10.8 7',
    { d: 'M8 11.8A1.2 1.2 0 1 0 8 9.4A1.2 1.2 0 0 0 8 11.8z', solid: true }
  ],
  rocket: [
    D('M9.8 2C12.2 2 14 3.8 14 6.2C14 8.6 11.4 11 9 12.4L5.6 9C7 6.6 7.4 2 9.8 2z'),
    'M5.6 9L3 9.8L2 13.2L5.4 12.2L6.2 9.6',
    { d: 'M10.4 6.8A1.1 1.1 0 1 0 10.4 4.6A1.1 1.1 0 0 0 10.4 6.8z', solid: true }
  ],
  wheel: [D(CIRCLE), 'M8.5 3.7V13.3', 'M3.7 8.5H13.3', 'M5.1 5.1L11.9 11.9', 'M11.9 5.1L5.1 11.9'],
  check: [D(CIRCLE), 'M5.4 8.2L7.2 10L10.6 6.4'],
  trash: ['M2.6 4.5H13.4', 'M6.5 4.2V2.5H9.5V4.2', D('M3.8 4.5H12.2L11.5 13.5H4.5z')],
  star: [D('M8 1.9L9.85 5.65L14 6.25L11 9.17L11.7 13.3L8 11.35L4.3 13.3L5 9.17L2 6.25L6.15 5.65z')],
  heart: [D('M8 13.6C8 13.6 2 10 2 6A3 3 0 0 1 8 5A3 3 0 0 1 14 6C14 10 8 13.6 8 13.6z')],
  download: ['M8.5 2.3V10.3', 'M5.3 7.3L8.5 10.5L11.7 7.3', 'M3.1 13.5H13.9'],
  cpu: [
    D('M4.5 4.5H11.5V11.5H4.5z'),
    'M6.5 1.8V4.2',
    'M9.5 1.8V4.2',
    'M6.5 11.8V14.2',
    'M9.5 11.8V14.2',
    'M1.8 6.5H4.2',
    'M1.8 9.5H4.2',
    'M11.8 6.5H14.2',
    'M11.8 9.5H14.2'
  ],
  eye: [
    D('M1.4 8C1.4 8 3.8 3.4 8 3.4C12.2 3.4 14.6 8 14.6 8C14.6 8 12.2 12.6 8 12.6C3.8 12.6 1.4 8 1.4 8z'),
    { d: 'M8 10A2 2 0 1 0 8 6A2 2 0 0 0 8 10z', solid: true }
  ],
  vial: [D('M5.6 1.5H10.4'), D('M6.5 1.5V11.4A1.6 1.6 0 0 0 9.5 11.4V1.5z'), 'M6.4 7.5H9.6']
}

const EXTENSIONS: Record<string, Hit> = {
  ts: [':TS', 'blue'],
  mts: [':TS', 'blue'],
  cts: [':TS', 'blue'],
  tsx: [':TSX', 'sky'],
  js: [':JS', 'yellow'],
  mjs: [':JS', 'yellow'],
  cjs: [':JS', 'yellow'],
  jsx: [':JSX', 'amber'],
  json: ['braces', 'amber'],
  jsonc: ['braces', 'amber'],
  json5: ['braces', 'amber'],
  md: ['markdown', 'sky'],
  markdown: ['markdown', 'sky'],
  mdx: [':MDX', 'amber'],
  rst: ['text', 'slate'],
  adoc: ['text', 'coral'],
  css: ['hash', 'blue'],
  scss: ['hash', 'pink'],
  sass: ['hash', 'pink'],
  less: ['hash', 'indigo'],
  styl: ['hash', 'lime'],
  pcss: ['hash', 'coral'],
  html: ['code', 'orange'],
  htm: ['code', 'orange'],
  xml: ['angle', 'amber'],
  xhtml: ['code', 'orange'],
  svg: ['vector', 'amber'],
  vue: [':VUE', 'green'],
  svelte: [':SV', 'coral'],
  astro: [':AST', 'violet'],
  hbs: ['code', 'amber'],
  ejs: ['code', 'yellow'],
  pug: ['code', 'brown'],
  njk: ['code', 'green'],
  liquid: ['code', 'teal'],
  twig: ['code', 'lime'],
  py: [':PY', 'sky'],
  pyi: [':PYI', 'sky'],
  pyc: [':PY', 'slate'],
  ipynb: ['notebook', 'orange'],
  go: [':GO', 'cyan'],
  rs: [':RS', 'orange'],
  java: [':JV', 'red'],
  class: [':JV', 'slate'],
  jar: ['archive', 'red'],
  kt: [':KT', 'violet'],
  kts: [':KTS', 'violet'],
  swift: [':SW', 'coral'],
  c: [':C', 'blue'],
  h: [':H', 'violet'],
  cpp: [':C++', 'blue'],
  cc: [':C++', 'blue'],
  cxx: [':C++', 'blue'],
  hpp: [':H++', 'violet'],
  cs: [':C#', 'green'],
  csproj: ['gear', 'green'],
  sln: ['layers', 'violet'],
  fs: [':F#', 'sky'],
  vb: [':VB', 'indigo'],
  php: [':PHP', 'indigo'],
  rb: [':RB', 'red'],
  erb: ['code', 'red'],
  dart: [':DT', 'sky'],
  lua: [':LUA', 'indigo'],
  r: [':R', 'blue'],
  rmd: [':RMD', 'blue'],
  scala: [':SC', 'red'],
  sc: [':SC', 'red'],
  ex: [':EX', 'violet'],
  exs: [':EXS', 'violet'],
  erl: [':ERL', 'red'],
  hs: [':HS', 'violet'],
  clj: [':CLJ', 'green'],
  cljs: [':CLJ', 'sky'],
  elm: [':ELM', 'cyan'],
  zig: [':ZIG', 'amber'],
  nim: [':NIM', 'yellow'],
  sol: [':SOL', 'slate'],
  jl: [':JL', 'violet'],
  pl: [':PL', 'indigo'],
  pm: [':PM', 'indigo'],
  groovy: [':GR', 'teal'],
  gradle: ['hammer', 'teal'],
  m: [':M', 'blue'],
  mm: [':MM', 'blue'],
  v: [':V', 'blue'],
  cr: [':CR', 'slate'],
  ml: [':ML', 'orange'],
  asm: [':ASM', 'red'],
  s: [':ASM', 'red'],
  sh: ['terminal', 'green'],
  bash: ['terminal', 'green'],
  zsh: ['terminal', 'green'],
  fish: ['terminal', 'green'],
  ps1: ['terminal', 'blue'],
  psm1: ['terminal', 'blue'],
  bat: ['terminal', 'slate'],
  cmd: ['terminal', 'slate'],
  sql: ['database', 'amber'],
  sqlite: ['database', 'sky'],
  db: ['database', 'slate'],
  prisma: ['prism', 'indigo'],
  graphql: ['graph', 'pink'],
  gql: ['graph', 'pink'],
  proto: ['plug', 'teal'],
  avsc: ['braces', 'teal'],
  yml: ['list', 'red'],
  yaml: ['list', 'red'],
  toml: ['gear', 'slate'],
  ini: ['gear', 'slate'],
  cfg: ['gear', 'slate'],
  conf: ['gear', 'slate'],
  properties: ['gear', 'slate'],
  env: ['key', 'yellow'],
  lock: ['lock', 'slate'],
  log: ['logs', 'slate'],
  txt: ['text', 'slate'],
  csv: ['table', 'green'],
  tsv: ['table', 'green'],
  xlsx: ['table', 'green'],
  xls: ['table', 'green'],
  ods: ['table', 'green'],
  parquet: ['table', 'teal'],
  doc: [':DOC', 'blue'],
  docx: [':DOC', 'blue'],
  odt: [':DOC', 'blue'],
  ppt: [':PPT', 'coral'],
  pptx: [':PPT', 'coral'],
  key: ['key', 'amber'],
  pdf: [':PDF', 'red'],
  rtf: ['text', 'blue'],
  epub: ['book', 'teal'],
  png: ['image', 'teal'],
  jpg: ['image', 'teal'],
  jpeg: ['image', 'teal'],
  gif: ['image', 'teal'],
  webp: ['image', 'teal'],
  avif: ['image', 'teal'],
  bmp: ['image', 'teal'],
  tiff: ['image', 'teal'],
  heic: ['image', 'teal'],
  ico: ['image', 'yellow'],
  psd: ['image', 'blue'],
  fig: ['vector', 'pink'],
  sketch: ['vector', 'amber'],
  ai: ['vector', 'orange'],
  blend: ['cube', 'orange'],
  glb: ['cube', 'lime'],
  gltf: ['cube', 'lime'],
  obj: ['cube', 'slate'],
  fbx: ['cube', 'slate'],
  mp4: ['video', 'pink'],
  mov: ['video', 'pink'],
  webm: ['video', 'pink'],
  mkv: ['video', 'pink'],
  avi: ['video', 'pink'],
  mp3: ['audio', 'violet'],
  wav: ['audio', 'violet'],
  flac: ['audio', 'violet'],
  ogg: ['audio', 'violet'],
  m4a: ['audio', 'violet'],
  ttf: ['font', 'coral'],
  otf: ['font', 'coral'],
  woff: ['font', 'coral'],
  woff2: ['font', 'coral'],
  eot: ['font', 'coral'],
  zip: ['archive', 'amber'],
  tar: ['archive', 'amber'],
  gz: ['archive', 'amber'],
  tgz: ['archive', 'amber'],
  rar: ['archive', 'amber'],
  '7z': ['archive', 'amber'],
  bz2: ['archive', 'amber'],
  xz: ['archive', 'amber'],
  dmg: ['archive', 'slate'],
  iso: ['archive', 'slate'],
  wasm: [':WA', 'indigo'],
  wat: [':WAT', 'indigo'],
  tf: [':TF', 'violet'],
  tfvars: [':TF', 'violet'],
  hcl: [':HCL', 'violet'],
  nix: ['hexagon', 'sky'],
  dockerfile: ['container', 'blue'],
  pem: ['key', 'green'],
  crt: ['shield', 'green'],
  cer: ['shield', 'green'],
  p12: ['key', 'green'],
  pub: ['key', 'green'],
  gpg: ['lock', 'green'],
  asc: ['lock', 'green'],
  diff: ['diff', 'green'],
  patch: ['diff', 'green'],
  http: ['globe', 'teal'],
  rest: ['globe', 'teal'],
  webmanifest: ['globe', 'sky'],
  map: ['logs', 'gray'],
  snap: ['camera', 'slate'],
  tmp: ['hourglass', 'gray'],
  bak: ['history', 'gray'],
  exe: ['cpu', 'slate'],
  dll: ['cpu', 'slate'],
  so: ['cpu', 'slate'],
  bin: ['cpu', 'slate'],
  apk: ['phone', 'green'],
  ipa: ['phone', 'slate'],
  ics: ['clock', 'red'],
  vim: [':VIM', 'green'],
  plist: ['gear', 'slate'],
  xcconfig: ['gear', 'blue'],
  hurl: ['globe', 'pink'],
  bru: ['globe', 'amber'],
  k6: ['gauge', 'violet'],
  drawio: ['share', 'orange'],
  mermaid: ['share', 'pink'],
  mmd: ['share', 'pink'],
  puml: ['share', 'amber'],
  excalidraw: ['vector', 'violet']
}

/** Compound suffixes, checked before the simple extension (longest first). */
const SUFFIXES: [suffix: string, glyph: string, color: FileIconColor][] = [
  ['.d.ts', ':DTS', 'indigo'],
  ['.test.ts', 'flask', 'teal'],
  ['.spec.ts', 'flask', 'teal'],
  ['.test.tsx', 'flask', 'teal'],
  ['.spec.tsx', 'flask', 'teal'],
  ['.test.js', 'flask', 'yellow'],
  ['.spec.js', 'flask', 'yellow'],
  ['.test.jsx', 'flask', 'yellow'],
  ['.e2e.ts', 'flask', 'green'],
  ['.e2e-spec.ts', 'flask', 'green'],
  ['.cy.ts', 'flask', 'green'],
  ['_test.go', 'flask', 'cyan'],
  ['_test.py', 'flask', 'sky'],
  ['.bench.ts', 'gauge', 'violet'],
  ['.stories.tsx', 'book', 'pink'],
  ['.stories.ts', 'book', 'pink'],
  ['.stories.jsx', 'book', 'pink'],
  ['.stories.mdx', 'book', 'pink'],
  ['.module.css', 'hash', 'sky'],
  ['.module.scss', 'hash', 'pink'],
  ['.controller.ts', 'switch', 'blue'],
  ['.service.ts', 'server', 'amber'],
  ['.module.ts', 'cube', 'red'],
  ['.entity.ts', 'database', 'amber'],
  ['.dto.ts', 'type', 'teal'],
  ['.guard.ts', 'shield', 'green'],
  ['.middleware.ts', 'filter', 'violet'],
  ['.resolver.ts', 'graph', 'pink'],
  ['.interceptor.ts', 'signal', 'orange'],
  ['.pipe.ts', 'filter', 'teal'],
  ['.strategy.ts', 'key', 'yellow'],
  ['.decorator.ts', 'spark', 'violet'],
  ['.repository.ts', 'database', 'sky'],
  ['.schema.ts', 'cube', 'teal'],
  ['.model.ts', 'cube', 'violet'],
  ['.store.ts', 'bag', 'violet'],
  ['.hook.ts', 'hook', 'violet'],
  ['.routes.ts', 'route', 'orange'],
  ['.router.ts', 'route', 'orange'],
  ['.adapter.ts', 'plug', 'teal'],
  ['.config.ts', 'gear', 'blue'],
  ['.config.js', 'gear', 'yellow'],
  ['.config.mjs', 'gear', 'yellow'],
  ['.config.cjs', 'gear', 'yellow'],
  ['.worker.ts', 'cpu', 'amber'],
  ['.mock.ts', 'flask', 'slate'],
  ['.min.js', ':JS', 'gray'],
  ['.min.css', 'hash', 'gray'],
  ['.env.local', 'key', 'yellow'],
  ['.code-workspace', 'layers', 'blue'],
  ['.blade.php', 'code', 'coral']
]

/** Exact names (lowercase). */
const NAMES: Record<string, Hit> = {
  'package.json': ['package', 'green'],
  'package-lock.json': ['lock', 'red'],
  'yarn.lock': ['lock', 'sky'],
  'pnpm-lock.yaml': ['lock', 'amber'],
  'pnpm-workspace.yaml': ['layers', 'amber'],
  'bun.lockb': ['lock', 'brown'],
  'bun.lock': ['lock', 'brown'],
  'tsconfig.json': ['gear', 'blue'],
  'jsconfig.json': ['gear', 'yellow'],
  '.gitignore': ['git', 'orange'],
  '.gitattributes': ['git', 'orange'],
  '.gitmodules': ['git', 'orange'],
  '.gitkeep': ['git', 'gray'],
  '.git-blame-ignore-revs': ['git', 'gray'],
  '.env': ['key', 'yellow'],
  '.env.example': ['key', 'gray'],
  '.env.sample': ['key', 'gray'],
  '.env.template': ['key', 'gray'],
  dockerfile: ['container', 'blue'],
  containerfile: ['container', 'blue'],
  '.dockerignore': ['container', 'slate'],
  'docker-compose.yml': ['containers', 'blue'],
  'docker-compose.yaml': ['containers', 'blue'],
  'compose.yml': ['containers', 'blue'],
  'compose.yaml': ['containers', 'blue'],
  'readme.md': ['book', 'sky'],
  readme: ['book', 'sky'],
  'readme.txt': ['book', 'sky'],
  'changelog.md': ['history', 'green'],
  changelog: ['history', 'green'],
  'history.md': ['history', 'green'],
  license: ['law', 'amber'],
  'license.md': ['law', 'amber'],
  'license.txt': ['law', 'amber'],
  copying: ['law', 'amber'],
  'contributing.md': ['people', 'teal'],
  'code_of_conduct.md': ['heart', 'pink'],
  'security.md': ['shield', 'red'],
  'support.md': ['heart', 'sky'],
  authors: ['people', 'violet'],
  codeowners: ['people', 'orange'],
  'claude.md': ['brain', 'violet'],
  'claude.local.md': ['brain', 'violet'],
  'agents.md': ['bot', 'violet'],
  '.mcp.json': ['plug', 'violet'],
  'todo.md': ['check', 'amber'],
  makefile: ['hammer', 'orange'],
  gnumakefile: ['hammer', 'orange'],
  justfile: ['hammer', 'amber'],
  'taskfile.yml': ['hammer', 'teal'],
  procfile: ['terminal', 'violet'],
  'cmakelists.txt': ['hammer', 'blue'],
  'build.gradle': ['hammer', 'teal'],
  '.editorconfig': ['gear', 'slate'],
  '.prettierrc': ['brush', 'pink'],
  '.prettierrc.json': ['brush', 'pink'],
  '.prettierrc.js': ['brush', 'pink'],
  'prettier.config.js': ['brush', 'pink'],
  '.prettierignore': ['brush', 'gray'],
  '.eslintrc': ['check', 'violet'],
  '.eslintrc.json': ['check', 'violet'],
  '.eslintrc.js': ['check', 'violet'],
  '.eslintrc.cjs': ['check', 'violet'],
  'eslint.config.js': ['check', 'violet'],
  'eslint.config.mjs': ['check', 'violet'],
  '.eslintignore': ['check', 'gray'],
  'biome.json': ['check', 'sky'],
  '.stylelintrc': ['check', 'pink'],
  '.markdownlint.json': ['check', 'sky'],
  'commitlint.config.js': ['check', 'teal'],
  '.lintstagedrc': ['check', 'teal'],
  'vite.config.ts': ['bolt', 'violet'],
  'vite.config.js': ['bolt', 'violet'],
  'vitest.config.ts': ['flask', 'green'],
  'jest.config.js': ['flask', 'red'],
  'jest.config.ts': ['flask', 'red'],
  'playwright.config.ts': ['flask', 'green'],
  'cypress.config.ts': ['flask', 'teal'],
  'next.config.js': ['gear', 'slate'],
  'next.config.mjs': ['gear', 'slate'],
  'next.config.ts': ['gear', 'slate'],
  'nuxt.config.ts': ['gear', 'green'],
  'astro.config.mjs': ['gear', 'violet'],
  'svelte.config.js': ['gear', 'coral'],
  'tailwind.config.js': ['gear', 'cyan'],
  'tailwind.config.ts': ['gear', 'cyan'],
  'postcss.config.js': ['gear', 'coral'],
  'postcss.config.mjs': ['gear', 'coral'],
  'babel.config.js': ['gear', 'yellow'],
  '.babelrc': ['gear', 'yellow'],
  'webpack.config.js': ['gear', 'blue'],
  'rollup.config.js': ['gear', 'red'],
  'tsup.config.ts': ['gear', 'amber'],
  'nodemon.json': ['gear', 'green'],
  'nest-cli.json': ['gear', 'red'],
  'angular.json': ['gear', 'red'],
  'ormconfig.ts': ['database', 'amber'],
  'ormconfig.json': ['database', 'amber'],
  'drizzle.config.ts': ['database', 'lime'],
  'knexfile.js': ['database', 'orange'],
  'schema.prisma': ['prism', 'indigo'],
  'turbo.json': ['bolt', 'pink'],
  'nx.json': ['layers', 'sky'],
  'lerna.json': ['layers', 'violet'],
  '.nvmrc': ['hexagon', 'green'],
  '.node-version': ['hexagon', 'green'],
  '.npmrc': ['package', 'red'],
  '.npmignore': ['package', 'gray'],
  '.yarnrc.yml': ['package', 'sky'],
  '.tool-versions': ['list', 'slate'],
  '.python-version': [':PY', 'sky'],
  'go.mod': [':GO', 'cyan'],
  'go.sum': ['lock', 'cyan'],
  'go.work': [':GO', 'cyan'],
  'cargo.toml': [':RS', 'orange'],
  'cargo.lock': ['lock', 'orange'],
  'requirements.txt': ['package', 'sky'],
  'pyproject.toml': ['gear', 'sky'],
  pipfile: ['package', 'sky'],
  'poetry.lock': ['lock', 'sky'],
  'uv.lock': ['lock', 'sky'],
  gemfile: ['package', 'red'],
  'gemfile.lock': ['lock', 'red'],
  'composer.json': ['package', 'indigo'],
  'composer.lock': ['lock', 'indigo'],
  'pubspec.yaml': ['package', 'sky'],
  'mix.exs': ['package', 'violet'],
  'deno.json': ['gear', 'slate'],
  'vercel.json': ['rocket', 'slate'],
  'netlify.toml': ['rocket', 'teal'],
  'fly.toml': ['rocket', 'violet'],
  'render.yaml': ['rocket', 'green'],
  'railway.json': ['rocket', 'pink'],
  'app.yaml': ['rocket', 'blue'],
  'serverless.yml': ['lambda', 'amber'],
  jenkinsfile: ['rocket', 'red'],
  '.gitlab-ci.yml': ['rocket', 'orange'],
  '.travis.yml': ['rocket', 'amber'],
  'azure-pipelines.yml': ['rocket', 'blue'],
  'bitbucket-pipelines.yml': ['rocket', 'blue'],
  'renovate.json': ['bot', 'teal'],
  'dependabot.yml': ['bot', 'blue'],
  'openapi.yaml': ['plug', 'green'],
  'openapi.json': ['plug', 'green'],
  'swagger.json': ['plug', 'green'],
  'swagger.yaml': ['plug', 'green'],
  'robots.txt': ['bot', 'slate'],
  'sitemap.xml': ['share', 'teal'],
  'manifest.json': ['globe', 'sky'],
  'favicon.ico': ['star', 'yellow'],
  '.htaccess': ['gear', 'red'],
  'nginx.conf': ['server', 'green'],
  caddyfile: ['server', 'teal'],
  'chart.yaml': ['wheel', 'blue'],
  'values.yaml': ['wheel', 'sky'],
  'kustomization.yaml': ['wheel', 'blue'],
  'skaffold.yaml': ['wheel', 'teal'],
  'main.tf': [':TF', 'violet'],
  'variables.tf': [':TF', 'violet'],
  'terraform.tfstate': ['lock', 'violet'],
  '.terraform.lock.hcl': ['lock', 'violet'],
  vagrantfile: ['cube', 'blue'],
  brewfile: ['package', 'amber'],
  '.ds_store': ['eye', 'gray'],
  'thumbs.db': ['eye', 'gray'],
  '.mailmap': ['mail', 'orange']
}

/** Folder categories: `[glyph, color, names…]`. */
const FOLDERS: [glyph: string, color: FileIconColor, ...names: string[]][] = [
  ['code', 'green', 'src', 'source', 'sources', 'code'],
  ['layers', 'teal', 'lib', 'libs', 'library', 'libraries', 'core', 'shared', 'common'],
  ['grid', 'violet', 'app', 'apps', 'application'],
  ['page', 'pink', 'pages', 'views', 'screens', 'routes-pages', 'content', 'posts', 'blog', 'articles'],
  [
    'blocks',
    'sky',
    'components',
    'component',
    'widgets',
    'ui',
    'elements',
    'atoms',
    'molecules',
    'organisms',
    'design-system'
  ],
  ['layout', 'indigo', 'layouts', 'layout', 'templates', 'template', 'partials'],
  ['hook', 'violet', 'hooks', 'composables', 'use'],
  ['wrench', 'amber', 'utils', 'util', 'utilities', 'helpers', 'helper', 'tools', 'tooling', 'support'],
  ['server', 'indigo', 'services', 'service', 'server', 'servers', 'backend', 'api-server'],
  ['plug', 'teal', 'api', 'apis', 'endpoints', 'rest', 'adapters', 'adapter', 'integrations', 'connectors', 'clients'],
  ['route', 'orange', 'routes', 'router', 'routers', 'routing', 'navigation'],
  ['switch', 'blue', 'controllers', 'controller', 'handlers', 'handler', 'resolvers'],
  ['filter', 'amber', 'middleware', 'middlewares', 'interceptors', 'pipes', 'filters'],
  [
    'cube',
    'violet',
    'models',
    'model',
    'domain',
    'domains',
    'modules',
    'module',
    'features',
    'feature',
    'schemas',
    'schema'
  ],
  [
    'database',
    'amber',
    'database',
    'databases',
    'db',
    'sql',
    'entities',
    'entity',
    'repositories',
    'repository',
    'repos',
    'orm',
    'typeorm'
  ],
  ['migrate', 'green', 'migrations', 'migration', 'seeds', 'seeders', 'seed', 'fixtures-db'],
  ['bag', 'violet', 'store', 'stores', 'state', 'redux', 'zustand', 'pinia', 'atoms-state', 'slices'],
  ['type', 'blue', 'types', 'typings', '@types', 'interfaces', 'dto', 'dtos', 'contracts', 'typedefs'],
  ['gear', 'slate', 'config', 'configs', 'configuration', 'settings', 'environments', 'environment', 'env', '.config'],
  ['list', 'slate', 'constants', 'const', 'enums', 'enum'],
  [
    'image',
    'teal',
    'images',
    'img',
    'imgs',
    'icons',
    'icon',
    'pictures',
    'photos',
    'screenshots',
    'illustrations',
    'svg',
    'svgs'
  ],
  [
    'archive',
    'amber',
    'assets',
    'static',
    'resources',
    'res',
    'files',
    'uploads',
    'archive',
    'archives',
    'backup',
    'backups'
  ],
  ['font', 'coral', 'fonts', 'font', 'typography'],
  ['brush', 'pink', 'styles', 'style', 'css', 'scss', 'sass', 'less', 'theme', 'themes', 'design', 'tokens'],
  ['globe', 'sky', 'public', 'www', 'wwwroot', 'web', 'site', 'website', 'html'],
  [
    'flask',
    'green',
    'test',
    'tests',
    '__tests__',
    'spec',
    'specs',
    'e2e',
    'integration',
    'unit',
    'cypress',
    'playwright',
    'testing',
    'qa'
  ],
  ['vial', 'slate', '__mocks__', 'mocks', 'mock', 'fixtures', 'fixture', 'stubs', 'fakes', '__fixtures__'],
  ['camera', 'slate', '__snapshots__', 'snapshots'],
  ['book', 'sky', 'docs', 'doc', 'documentation', 'wiki', 'guides', 'manual', 'adr', 'rfcs'],
  ['book', 'pink', 'stories', 'storybook', '.storybook'],
  ['terminal', 'green', 'scripts', 'script', 'bin', 'cli', 'commands', 'tasks', 'shell'],
  [
    'package',
    'orange',
    'dist',
    'build',
    'builds',
    'out',
    'output',
    'release',
    'releases',
    'target',
    '.next',
    '.nuxt',
    '.output',
    '.svelte-kit',
    '.turbo',
    '.vercel',
    'artifacts',
    'bundle'
  ],
  [
    'package',
    'green',
    'node_modules',
    'vendor',
    'vendors',
    'packages',
    '.pnpm',
    'bower_components',
    'third_party',
    'deps',
    'external'
  ],
  ['git', 'orange', '.git', '.husky', '.githooks', 'git', 'hooks-git'],
  [
    'rocket',
    'slate',
    '.github',
    '.gitlab',
    '.circleci',
    'workflows',
    'pipelines',
    'ci',
    'cd',
    '.buildkite',
    'deploy',
    'deployment',
    'deployments',
    'release-please'
  ],
  ['gear', 'blue', '.vscode', '.idea', '.devcontainer', '.fleet', '.zed', '.cursor', '.walph'],
  [
    'brain',
    'violet',
    '.claude',
    'claude',
    'prompts',
    'prompt',
    'agents',
    'agent',
    'ai',
    'llm',
    'ml',
    'models-ai',
    'mcp'
  ],
  ['container', 'blue', 'docker', '.docker', 'containers', 'compose'],
  ['wheel', 'blue', 'k8s', 'kubernetes', 'helm', 'charts', 'manifests', 'kustomize'],
  [
    'cloud',
    'indigo',
    'infra',
    'infrastructure',
    'terraform',
    '.terraform',
    'cloud',
    'aws',
    'gcp',
    'azure',
    'oci',
    'pulumi',
    'cdk',
    'iac',
    'ops',
    'devops',
    'ansible'
  ],
  ['language', 'teal', 'i18n', 'locales', 'locale', 'lang', 'langs', 'languages', 'translations', 'l10n', 'messages'],
  ['logs', 'slate', 'logs', 'log', 'logging'],
  ['hourglass', 'gray', 'tmp', 'temp', '.tmp', 'cache', '.cache', '.parcel-cache'],
  [
    'shield',
    'red',
    'auth',
    'authentication',
    'authorization',
    'security',
    'permissions',
    'guards',
    'policies',
    'acl',
    'iam'
  ],
  ['key', 'yellow', 'keys', 'certs', 'certificates', 'secrets', 'ssl', 'tls', '.ssh', 'credentials'],
  ['mail', 'pink', 'mail', 'mails', 'email', 'emails', 'mailers', 'notifications', 'notification', 'newsletters'],
  [
    'clock',
    'amber',
    'jobs',
    'job',
    'queues',
    'queue',
    'workers',
    'worker',
    'cron',
    'crons',
    'schedulers',
    'scheduler',
    'bullmq'
  ],
  ['bolt', 'yellow', 'events', 'event', 'listeners', 'subscribers', 'emitters', 'signals'],
  ['graph', 'pink', 'graphql', 'gql', 'apollo'],
  ['prism', 'indigo', 'prisma', 'drizzle'],
  ['monitor', 'sky', 'client', 'clients-web', 'frontend', 'front', 'desktop', 'electron', 'renderer'],
  ['phone', 'green', 'mobile', 'android', 'ios', 'native', 'expo', 'app-mobile'],
  ['play', 'sky', 'examples', 'example', 'samples', 'sample', 'demo', 'demos', 'playground', 'sandbox'],
  ['chart', 'green', 'coverage', 'reports', 'report', 'analytics', 'metrics', 'stats', 'dashboards'],
  ['gauge', 'violet', 'benchmarks', 'benchmark', 'bench', 'perf', 'performance', 'load-tests'],
  ['puzzle', 'teal', 'plugins', 'plugin', 'extensions', 'extension', 'addons', 'addon', 'mods'],
  ['share', 'indigo', 'providers', 'provider', 'context', 'contexts', 'di', 'container-di'],
  ['lambda', 'amber', 'functions', 'function', 'lambda', 'lambdas', 'serverless', 'edge', 'netlify', 'supabase'],
  [
    'signal',
    'teal',
    'socket',
    'sockets',
    'websocket',
    'websockets',
    'ws',
    'realtime',
    'gateway',
    'gateways',
    'streams'
  ],
  ['video', 'pink', 'video', 'videos', 'movies', 'media'],
  ['audio', 'violet', 'audio', 'sounds', 'sound', 'music'],
  ['table', 'green', 'data', 'datasets', 'dataset', 'csv', 'exports', 'imports'],
  ['notebook', 'orange', 'notebooks', 'jupyter'],
  ['spark', 'violet', 'generated', '__generated__', 'gen', 'codegen', 'autogen'],
  ['download', 'slate', 'downloads', 'download'],
  ['trash', 'gray', 'trash', '.trash', 'deprecated', 'old', 'legacy'],
  ['cpu', 'slate', 'native-modules', 'wasm', 'rust', 'go', 'cmd', 'internal', 'pkg'],
  ['people', 'teal', 'users', 'user', 'accounts', 'account', 'customers', 'members', 'profiles', 'teams'],
  ['history', 'green', 'versions', 'changelog', 'changesets', '.changeset', 'history'],
  ['eye', 'sky', 'preview', 'previews', 'review', 'reviews'],
  ['heart', 'pink', 'favorites', 'health', 'healthcheck']
]

const FOLDER_INDEX = new Map<string, [string, FileIconColor]>()
for (const [glyph, color, ...names] of FOLDERS) {
  for (const n of names) if (!FOLDER_INDEX.has(n)) FOLDER_INDEX.set(n, [glyph, color])
}

/** Monorepo/microservice repos (`billing-api`, `shop-web`, `club-app`) inherit the category icon by suffix. */
const FOLDER_SUFFIXES: [string, string][] = [
  ['-api', 'api'],
  ['-web', 'public'],
  ['-app', 'mobile']
]

function folderBySuffix(n: string): [string, FileIconColor] | undefined {
  for (const [suffix, base] of FOLDER_SUFFIXES)
    if (n.length > suffix.length && n.endsWith(suffix)) return FOLDER_INDEX.get(base)
  return undefined
}

export type FileIconSpec =
  | { kind: 'folder'; glyph: string | null; color: FileIconColor; open: boolean }
  | { kind: 'file'; glyph: string; color: FileIconColor; label?: undefined }
  | { kind: 'file'; label: string; color: FileIconColor; glyph?: undefined }

/**
 * Icon of a name or path (only the last segment counts). Files: exact name → compound suffix → extension → generic
 * `gray` page. Folders: category by name (also without leading `.`/`_`), else `slate` without a glyph.
 */
export function fileIconFor(
  name: string,
  opts: { folder?: boolean | undefined; open?: boolean | undefined } = {}
): FileIconSpec {
  const n = (name.split(/[\\/]/).pop() ?? '').toLowerCase()
  if (opts.folder) {
    const f = FOLDER_INDEX.get(n) ?? FOLDER_INDEX.get(n.replace(/^[._]+/, '')) ?? folderBySuffix(n)
    return { kind: 'folder', glyph: f ? f[0] : null, color: f ? f[1] : 'slate', open: !!opts.open }
  }
  let hit: Hit | undefined = Object.hasOwn(NAMES, n) ? NAMES[n] : undefined
  if (!hit && /^\.env(\.|$)/.test(n)) hit = ['key', 'yellow']
  if (!hit && /^dockerfile\./.test(n)) hit = ['container', 'blue']
  if (!hit && /^tsconfig\..*json$/.test(n)) hit = ['gear', 'blue']
  if (!hit && /^readme\./.test(n)) hit = ['book', 'sky']
  if (!hit && /^license/.test(n)) hit = ['law', 'amber']
  if (!hit) {
    const s = SUFFIXES.find(([suffix]) => n.length > suffix.length && n.endsWith(suffix))
    if (s) hit = [s[1], s[2]]
  }
  if (!hit) {
    const dot = n.lastIndexOf('.')
    if (dot >= 0) {
      const ext = n.slice(dot + 1)
      if (Object.hasOwn(EXTENSIONS, ext)) hit = EXTENSIONS[ext]
    }
  }
  if (!hit) return { kind: 'file', glyph: 'page', color: 'gray' }
  return hit[0].startsWith(':')
    ? { kind: 'file', label: hit[0].slice(1), color: hit[1] }
    : { kind: 'file', glyph: hit[0], color: hit[1] }
}
