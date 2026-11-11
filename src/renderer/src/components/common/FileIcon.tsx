// Drawing of the file and folder icon theme (tables and resolution in `lib/fileIcons.ts`). The colors are the type
// palette of the icon theme itself, not UI tokens: appearance publishes the active theme palette in `--fi-<color>` (the
// dark one, or the darkened one in light themes) and the drawing uses `currentColor`, since SVG attributes do not
// accept `var()`.
import { memo, type CSSProperties } from 'react'
import { FILE_ICON_COLORS, FILE_ICON_CUT, FILE_ICON_GLYPHS, fileIconFor, type GlyphItem } from '../../lib/fileIcons'

// Initials and cut-out glyph: dark over the light palette, white over the darkened one (fallback = dark theme).
const CUT = `var(--fi-cut, ${FILE_ICON_CUT.dark})`
const FOLDER_BACK =
  'M1 3.3A1.3 1.3 0 0 1 2.3 2H6.1L7.7 4H13.7A1.3 1.3 0 0 1 15 5.3V13.7A1.3 1.3 0 0 1 13.7 15H2.3A1.3 1.3 0 0 1 1 13.7z'
const FOLDER_FRONT = 'M1 6H15V13.7A1.3 1.3 0 0 1 13.7 15H2.3A1.3 1.3 0 0 1 1 13.7z'
const FOLDER_OPEN =
  'M2.9 6H15.3A0.8 0.8 0 0 1 16.06 7.05L14.16 14.15A1.3 1.3 0 0 1 12.92 15H1.6A0.8 0.8 0 0 1 0.84 13.95L2.14 6.75A1 1 0 0 1 2.9 6z'

/** Glyph in `currentColor`: duotone (stroke + 20% fill) or, cut out of the folder, stroke only. */
function glyphPaths(glyph: string, cut: boolean) {
  const items: GlyphItem[] = FILE_ICON_GLYPHS[glyph] ?? FILE_ICON_GLYPHS.page ?? []
  return items.map((item, i) => {
    if (typeof item === 'string') return <path key={i} d={item} />
    if (item.solid) return <path key={i} d={item.d} fill="currentColor" stroke="none" />
    return cut ? (
      <path key={i} d={item.d} />
    ) : (
      [
        <path key={`${i}f`} d={item.d} fill="currentColor" fillOpacity={0.2} stroke="none" />,
        <path key={i} d={item.d} />
      ]
    )
  })
}

/** File or folder icon by name (only the last segment counts). Decorative: the name is already beside it. */
export const FileIcon = memo(function FileIcon({
  name,
  folder,
  open,
  size = 16,
  className
}: {
  name: string
  folder?: boolean | undefined
  open?: boolean | undefined
  size?: number
  className?: string
}) {
  const spec = fileIconFor(name, { folder, open })
  const color = `var(--fi-${spec.color}, ${FILE_ICON_COLORS[spec.color]})`
  const classes = `ficon ${className ?? ''}`

  if (spec.kind === 'file' && spec.label) {
    // Initials via a pseudo-element (`attr`), not `<text>`: real text would enter the textContent of the row beside it.
    const label = spec.label
    const fontSize = ((label.length >= 3 ? 5.3 : label.length === 2 ? 6.8 : 8.6) * size) / 16
    const style = {
      width: size,
      height: size,
      fontSize,
      letterSpacing: (label.length >= 3 ? -0.2 : -0.1) * (size / 16),
      '--ficon-color': color,
      '--ficon-cut': CUT
    } as CSSProperties
    return <span aria-hidden className={`${classes} ficon-badge`} data-label={label} style={style} />
  }

  const base = { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, className: classes }

  if (spec.kind === 'folder') {
    return (
      <svg {...base} style={{ color }}>
        <path d={FOLDER_BACK} fill="currentColor" opacity={spec.open ? 0.55 : 0.62} />
        <path d={spec.open ? FOLDER_OPEN : FOLDER_FRONT} fill="currentColor" />
        {spec.glyph && (
          <g
            transform="translate(5.4 5.4) scale(.66)"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: CUT }}
            opacity={0.78}
          >
            {glyphPaths(spec.glyph, true)}
          </g>
        )}
      </svg>
    )
  }

  return (
    <svg
      {...base}
      style={{ color }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${classes} ficon-crisp`}
    >
      {glyphPaths(spec.glyph ?? 'page', false)}
    </svg>
  )
})
