// Walph design system's own icons: 16px grid (straight lines on half pixels), 1 screen-pixel stroke, rounded
// caps and duotone (the main shape gets a 16% fill of the same color). They use `currentColor`; the AI ones
// (`spark`, `agent`, `bolt`, `brain`) paint stroke and fill with the `--grad-ai` gradient; inside the primary
// button, `plain` gives them back `currentColor`. The rest of the interface keeps using codicons.
import { useId, type SVGProps } from 'react'

/** Plain stroke (string), duotone shape (`{ d }`) or solid shape (`{ d, solid }`). */
type IconItem = string | { d: string; solid?: boolean }

const D = (d: string): IconItem => ({ d })

const ICONS = {
  close: { items: ['M4.5 4.5L11.5 11.5', 'M11.5 4.5L4.5 11.5'] },
  plus: { items: ['M8.5 4V13', 'M4 8.5H13'] },
  chevron: { items: ['M6.5 4.5L10 8L6.5 11.5'] },
  check: { items: ['M3.5 8.4L6.3 11.2L12.5 5'] },
  alert: {
    items: [
      D('M7.63 3.2A1 1 0 0 1 9.37 3.2L14.87 13A1 1 0 0 1 14 14.5H3A1 1 0 0 1 2.13 13z'),
      'M8.5 6.8V9.8',
      'M8.5 11.9V11.91'
    ]
  },
  error: { items: [D('M8 14.2A6.2 6.2 0 1 0 8 1.8A6.2 6.2 0 0 0 8 14.2z'), 'M6 6L10 10', 'M10 6L6 10'] },
  spark: {
    items: [
      D(
        'M7 1.8L8.2 5.1A2.2 2.2 0 0 0 9.5 6.4L12.8 7.6L9.5 8.8A2.2 2.2 0 0 0 8.2 10.1L7 13.4L5.8 10.1A2.2 2.2 0 0 0 4.5 8.8L1.2 7.6L4.5 6.4A2.2 2.2 0 0 0 5.8 5.1z'
      ),
      { d: 'M12.8 1.2L13.25 2.35L14.4 2.8L13.25 3.25L12.8 4.4L12.35 3.25L11.2 2.8L12.35 2.35z', solid: true },
      { d: 'M13 11.2L13.3 12L14.1 12.3L13.3 12.6L13 13.4L12.7 12.6L11.9 12.3L12.7 12z', solid: true }
    ],
    ai: true
  },
  file: {
    items: [
      D('M4.5 1.5H9.2L12.5 5.1V13.5A1 1 0 0 1 11.5 14.5H4.5A1 1 0 0 1 3.5 13.5V2.5A1 1 0 0 1 4.5 1.5z'),
      'M9.5 1.8V5.5H12.5',
      'M5.8 8.5H10.2',
      'M5.8 11.5H8.6'
    ]
  },
  folder: {
    items: [
      D(
        'M1.5 4.6A1.1 1.1 0 0 1 2.6 3.5H6.1L7.6 4.5H13.4A1.1 1.1 0 0 1 14.5 5.6V12.4A1.1 1.1 0 0 1 13.4 13.5H2.6A1.1 1.1 0 0 1 1.5 12.4z'
      ),
      'M1.8 6.5H14.2'
    ]
  },
  search: { items: [D('M7.1 11.9A4.8 4.8 0 1 0 7.1 2.3A4.8 4.8 0 0 0 7.1 11.9z'), 'M10.6 10.6L14 14'] },
  branch: {
    items: [
      'M4.5 4.6V11.4',
      'M11.5 6.1V6.5A3 3 0 0 1 8.5 9.5H4.5',
      D('M4.5 4.6A1.5 1.5 0 1 0 4.5 1.6A1.5 1.5 0 0 0 4.5 4.6z'),
      D('M11.5 6.1A1.5 1.5 0 1 0 11.5 3.1A1.5 1.5 0 0 0 11.5 6.1z'),
      D('M4.5 14.4A1.5 1.5 0 1 0 4.5 11.4A1.5 1.5 0 0 0 4.5 14.4z')
    ]
  },
  terminal: {
    items: [
      D('M3 2.5H13A1.5 1.5 0 0 1 14.5 4V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4A1.5 1.5 0 0 1 3 2.5z'),
      'M4.8 6.3L6.8 8L4.8 9.7',
      'M8.6 10.5H11.2'
    ]
  },
  send: { items: ['M8.5 12.8V3.6', 'M4.8 7.2L8.5 3.5L12.2 7.2'] },
  command: {
    items: [
      'M6.5 6.5V5A1.5 1.5 0 1 0 5 6.5H6.5zM6.5 6.5H10.5M6.5 6.5V10.5M10.5 6.5V5A1.5 1.5 0 1 1 12 6.5H10.5zM10.5 6.5V10.5M10.5 10.5H12A1.5 1.5 0 1 1 10.5 12V10.5zM10.5 10.5H6.5M6.5 10.5V12A1.5 1.5 0 1 1 5 10.5H6.5z'
    ]
  },
  diff: {
    items: [
      D(
        'M3.6 1.5H12.4A1.1 1.1 0 0 1 13.5 2.6V13.4A1.1 1.1 0 0 1 12.4 14.5H3.6A1.1 1.1 0 0 1 2.5 13.4V2.6A1.1 1.1 0 0 1 3.6 1.5z'
      ),
      'M8.5 4.6V8.4',
      'M6.1 6.5H9.9',
      'M6.1 11.5H9.9'
    ]
  },
  agent: {
    items: [
      D('M8 1.8L13.5 4.9V11.1L8 14.2L2.5 11.1V4.9z'),
      'M8.5 8V14.2',
      'M8 8L13.4 4.9',
      'M8 8L2.6 4.9',
      { d: 'M8 9.4A1.4 1.4 0 1 0 8 6.6A1.4 1.4 0 0 0 8 9.4z', solid: true }
    ],
    ai: true
  },
  layers: { items: [D('M8 2L14 5.2L8 8.4L2 5.2z'), 'M2 8.2L8 11.4L14 8.2', 'M2 11L8 14.2L14 11'] },
  files: {
    items: [
      'M6.2 1.5H10.4L13.5 4.6V11.2A1 1 0 0 1 12.5 12.2',
      D('M3.5 4.5H8.2L11.5 7V13.5A1 1 0 0 1 10.5 14.5H3.5A1 1 0 0 1 2.5 13.5V5.5A1 1 0 0 1 3.5 4.5z'),
      'M8.5 4.2V7.5H11'
    ]
  },
  gear: {
    items: [
      D(
        'M12.76 6.84L14.5 6.93V9.07L12.76 9.16L12.19 10.54L13.14 11.64L11.64 13.14L10.54 12.19L9.16 12.76L9.07 14.5H6.93L6.84 12.76L5.46 12.19L4.36 13.14L2.86 11.64L3.81 10.54L3.24 9.16L1.5 9.07V6.93L3.24 6.84L3.81 5.46L2.86 4.36L4.36 2.86L5.46 3.81L6.84 3.24L6.93 1.5H9.07L9.16 3.24L10.54 3.81L11.64 2.86L13.14 4.36L12.19 5.46z'
      ),
      'M8 10.1A2.1 2.1 0 1 0 8 5.9A2.1 2.1 0 0 0 8 10.1z'
    ]
  },
  clip: {
    items: ['M13 7.6L7.7 12.9A3.1 3.1 0 0 1 3.3 8.5L9 2.8A2.1 2.1 0 0 1 12 5.8L6.5 11.3A1 1 0 0 1 5 9.8L10 4.9']
  },
  more: {
    items: [
      { d: 'M3.6 9.3A1.3 1.3 0 1 0 3.6 6.7A1.3 1.3 0 0 0 3.6 9.3z', solid: true },
      { d: 'M8 9.3A1.3 1.3 0 1 0 8 6.7A1.3 1.3 0 0 0 8 9.3z', solid: true },
      { d: 'M12.4 9.3A1.3 1.3 0 1 0 12.4 6.7A1.3 1.3 0 0 0 12.4 9.3z', solid: true }
    ]
  },
  mic: {
    items: [
      D('M8.2 10.2A2.3 2.3 0 0 0 10.5 7.9V4.1A2.3 2.3 0 1 0 5.5 4.1V7.9A2.3 2.3 0 0 0 7.8 10.2z'),
      'M3.9 7.7A4.1 4.1 0 0 0 12.1 7.7',
      'M8.5 11.9V14.2'
    ]
  },
  star: { items: [D('M8 1.9L9.85 5.65L14 6.25L11 9.17L11.7 13.3L8 11.35L4.3 13.3L5 9.17L2 6.25L6.15 5.65z')] },
  hand: {
    items: [
      D(
        'M5.5 9.9V4.2A1 1 0 0 1 7.5 4.2V7.6V2.9A1 1 0 0 1 9.5 2.9V7.6V3.9A1 1 0 0 1 11.5 3.9V8.8C11.5 11.7 9.8 14 7 14C5.3 14 4.3 13.2 3.4 11.9L2 9.6A1 1 0 0 1 3.5 8.3z'
      )
    ]
  },
  pencil: { items: [D('M10.9 2.5L13.5 5.1L5.7 12.9L2.4 13.6L3.1 10.3z'), 'M9.4 4L12 6.6'] },
  plan: {
    items: [
      'M6.4 4.5H13.5',
      'M6.4 8.5H13.5',
      'M6.4 12.5H11',
      { d: 'M2.4 3.6H4.2V5.4H2.4z', solid: true },
      { d: 'M2.4 7.6H4.2V9.4H2.4z', solid: true },
      { d: 'M2.4 11.6H4.2V13.4H2.4z', solid: true }
    ]
  },
  bolt: { items: [D('M9.2 1.6L3.4 9.5H7.5L6.6 14.4L12.6 6.5H8.4z')], ai: true },
  shield: {
    items: [
      D('M8.5 1.8L13.5 3.7V7.8C13.5 10.8 11.4 13.1 8.5 14.2C5.6 13.1 3.5 10.8 3.5 7.8V3.7z'),
      'M2.7 2.2L14.3 13.8'
    ]
  },
  stop: { items: [{ d: 'M5 5H11V11H5z', solid: true }] },
  // Claude actions (tool row) and favorite command icons.
  eye: {
    items: [
      D('M1.4 8C1.4 8 3.8 3.4 8 3.4C12.2 3.4 14.6 8 14.6 8C14.6 8 12.2 12.6 8 12.6C3.8 12.6 1.4 8 1.4 8z'),
      { d: 'M8 10A2 2 0 1 0 8 6A2 2 0 0 0 8 10z', solid: true }
    ]
  },
  globe: {
    items: [
      D('M8 14.7A6.2 6.2 0 1 0 8 2.3A6.2 6.2 0 0 0 8 14.7z'),
      'M1.8 8.5H14.2',
      'M8 2.3C9.7 4.1 10.6 6.2 10.6 8.5C10.6 10.8 9.7 12.9 8 14.7C6.3 12.9 5.4 10.8 5.4 8.5C5.4 6.2 6.3 4.1 8 2.3z'
    ]
  },
  filePlus: {
    items: [
      D('M4.5 1.5H9.2L12.5 5.1V13.5A1 1 0 0 1 11.5 14.5H4.5A1 1 0 0 1 3.5 13.5V2.5A1 1 0 0 1 4.5 1.5z'),
      'M9.5 1.8V5.5H12.5',
      'M8.5 7.6V11.6',
      'M6 9.5H10'
    ]
  },
  rocket: {
    items: [
      D('M9.8 2C12.2 2 14 3.8 14 6.2C14 8.6 11.4 11 9 12.4L5.6 9C7 6.6 7.4 2 9.8 2z'),
      'M5.6 9L3 9.8L2 13.2L5.4 12.2L6.2 9.6',
      { d: 'M10.4 6.8A1.1 1.1 0 1 0 10.4 4.6A1.1 1.1 0 0 0 10.4 6.8z', solid: true }
    ]
  },
  flask: {
    items: [
      'M5.8 2.5H10.2',
      D('M6.5 2.5V6.2L3.1 12.8A1.1 1.1 0 0 0 4.05 14.5H11.95A1.1 1.1 0 0 0 12.9 12.8L9.5 6.2V2.5z'),
      'M4.6 9.5H11.4'
    ]
  },
  bug: {
    items: [
      D('M8.1 13.9A3.6 3.6 0 0 1 4.5 10.3V7.5A3.6 3.6 0 0 1 11.5 7.5V10.3A3.6 3.6 0 0 1 7.9 13.9z'),
      'M5.8 4.5L4.6 2.9',
      'M10.2 4.5L11.4 2.9',
      'M4.4 8.5H2',
      'M14 8.5H11.6',
      'M4.6 11.5L2.8 12.5',
      'M11.4 11.5L13.2 12.5',
      'M8.5 6.9V13.9'
    ]
  },
  book: {
    items: [
      D('M3.5 2.5H11.1A1.4 1.4 0 0 1 12.5 3.9V13.5H5.1A1.6 1.6 0 0 1 3.5 11.9z'),
      'M3 12.1A1.6 1.6 0 0 1 4.6 10.5H12.4',
      'M6 5.5H9.6'
    ]
  },
  database: {
    items: [
      D('M2.5 4C2.5 2.8 4.8 2 7.7 2C10.6 2 13.5 2.8 13.5 4V12C13.5 13.2 11.2 14 8.3 14C5.4 14 2.5 13.2 2.5 12z'),
      'M2.8 4C2.8 5.2 5.1 6 8 6C10.9 6 13.2 5.2 13.2 4',
      'M2.8 8C2.8 9.2 5.1 10 8 10C10.9 10 13.2 9.2 13.2 8'
    ]
  },
  box: {
    items: [
      D('M2.5 5.5H13.5V12.5H2.5z'),
      'M2.2 5.2L3.8 3.5H12.2L13.8 5.2',
      'M5.5 7.4V10.6',
      'M8.5 7.4V10.6',
      'M10.5 7.4V10.6'
    ]
  },
  play: { items: [D('M5.5 3.1V12.9L13.3 8z')] },
  restart: { items: ['M13.4 8.4A5.1 5.1 0 1 1 11.8 4.3', 'M13.5 2.6V5.5H10.6'] },
  logs: { items: ['M3 4.5H13', 'M3 8.5H9.5', 'M3 12.5H11.5'] },
  external: { items: ['M9.4 2.5H13.5V6.6', 'M13.4 2.6L7.6 8.4', 'M11.5 9.6V13.5H2.5V4.5H6.4'] },
  split: {
    items: [
      D(
        'M2.8 2.5H13.2A1.3 1.3 0 0 1 14.5 3.8V12.2A1.3 1.3 0 0 1 13.2 13.5H2.8A1.3 1.3 0 0 1 1.5 12.2V3.8A1.3 1.3 0 0 1 2.8 2.5z'
      ),
      'M8.5 2.4V13.6'
    ]
  },
  markdown: {
    items: [
      D(
        'M2.6 3.5H13.4A1.1 1.1 0 0 1 14.5 4.6V11.4A1.1 1.1 0 0 1 13.4 12.5H2.6A1.1 1.1 0 0 1 1.5 11.4V4.6A1.1 1.1 0 0 1 2.6 3.5z'
      ),
      'M4.5 10.2V5.8L6.1 8.1L8.5 5.8V10.2',
      'M11.5 5.8V10.1',
      'M9.6 8.8L11 10.2L12.4 8.8'
    ]
  },
  slash: {
    items: [
      D(
        'M3.9 2.5H12.1A1.4 1.4 0 0 1 13.5 3.9V12.1A1.4 1.4 0 0 1 12.1 13.5H3.9A1.4 1.4 0 0 1 2.5 12.1V3.9A1.4 1.4 0 0 1 3.9 2.5z'
      ),
      'M9.7 4.8L6.3 11.2'
    ]
  },
  question: {
    items: [
      D('M8.5 14.2A6.2 6.2 0 1 0 8.5 1.8A6.2 6.2 0 0 0 8.5 14.2z'),
      'M6.7 6.2A1.9 1.9 0 1 1 9.3 8C8.8 8.2 8.5 8.6 8.5 9.1V9.5',
      'M8.5 11.3V11.31'
    ]
  },
  commit: { items: ['M1.6 8.5H5.2', 'M10.8 8.5H14.4', D('M8 11.1A2.6 2.6 0 1 0 8 5.9A2.6 2.6 0 0 0 8 11.1z')] },
  arrowUp: { items: ['M8.5 12.6V3.6', 'M5.1 7L8.5 3.6L11.9 7'] },
  arrowDown: { items: ['M8.5 3.4V12.4', 'M5.1 9L8.5 12.4L11.9 9'] },
  brain: {
    items: [
      D(
        'M7.5 2.6A2.3 2.3 0 0 0 3.9 4.2A2.3 2.3 0 0 0 2.2 7.3A2.4 2.4 0 0 0 2.7 10.9A2.3 2.3 0 0 0 5.4 13.4A2.1 2.1 0 0 0 7.5 14.5z'
      ),
      D(
        'M8.5 2.6A2.3 2.3 0 0 1 12.1 4.2A2.3 2.3 0 0 1 13.8 7.3A2.4 2.4 0 0 1 13.3 10.9A2.3 2.3 0 0 1 10.6 13.4A2.1 2.1 0 0 1 8.5 14.5z'
      ),
      'M4.6 6.4C5.5 6.4 6.2 6.8 6.6 7.5',
      'M3.9 9.6C4.7 9.2 5.7 9.3 6.4 9.9',
      'M11.4 6.4C10.5 6.4 9.8 6.8 9.4 7.5',
      'M12.1 9.6C11.3 9.2 10.3 9.3 9.6 9.9',
      { d: 'M6.6 7.5A0.75 0.75 0 1 0 6.6 6A0.75 0.75 0 0 0 6.6 7.5z', solid: true },
      { d: 'M9.4 7.5A0.75 0.75 0 1 0 9.4 6A0.75 0.75 0 0 0 9.4 7.5z', solid: true },
      { d: 'M6.4 10.7A0.75 0.75 0 1 0 6.4 9.2A0.75 0.75 0 0 0 6.4 10.7z', solid: true },
      { d: 'M9.6 10.7A0.75 0.75 0 1 0 9.6 9.2A0.75 0.75 0 0 0 9.6 10.7z', solid: true }
    ],
    ai: true
  }
} satisfies Record<string, { items: IconItem[]; ai?: boolean }>

export type IconName = keyof typeof ICONS

export function Icon({
  name,
  plain,
  ...props
}: { name: IconName; /** AI icon without the gradient (e.g. over the primary gradient). */ plain?: boolean } & Omit<
  SVGProps<SVGSVGElement>,
  'name'
>) {
  // The useId id has characters that are not valid inside `url(#…)`.
  const gradientId = `wicon-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const icon: { items: IconItem[]; ai?: boolean } = ICONS[name]
  const ai = !!icon.ai && !plain
  const paint = ai ? `url(#${gradientId})` : 'currentColor'
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke={paint}
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
      className={['wicon', props.className].filter(Boolean).join(' ')}
    >
      {ai && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="wicon-stop-1" />
            <stop offset=".55" className="wicon-stop-2" />
            <stop offset="1" className="wicon-stop-3" />
          </linearGradient>
        </defs>
      )}
      {icon.items.map((item, i) =>
        typeof item === 'string' ? (
          <path key={i} d={item} />
        ) : item.solid ? (
          <path key={i} d={item.d} fill={paint} stroke="none" />
        ) : (
          [
            <path key={`${i}f`} d={item.d} fill={paint} fillOpacity={ai ? 0.28 : 0.16} stroke="none" />,
            <path key={i} d={item.d} />
          ]
        )
      )}
    </svg>
  )
}
