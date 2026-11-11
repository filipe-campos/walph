import { useMemo, useRef, type RefObject } from 'react'
import { layoutRects, layoutSashes, type LayoutRect, type LayoutSash } from '@shared/editorLayout'
import { useStore } from '../../store'
import { Resizer } from '../Resizer'
import { EditorGroup } from './EditorGroup'
import { resizeEditorGroups } from '../../tabActions'

const percent = (fraction: number): string => `${fraction * 100}%`

const boxStyle = (rect: LayoutRect): React.CSSProperties => ({
  left: percent(rect.x),
  top: percent(rect.y),
  width: percent(rect.w),
  height: percent(rect.h)
})

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6

function Sash({ sash, areaRef }: { sash: LayoutSash; areaRef: RefObject<HTMLDivElement | null> }) {
  const row = sash.direction === 'row'
  const style: React.CSSProperties = row
    ? { left: percent(sash.at), top: percent(sash.from), height: percent(sash.length) }
    : { top: percent(sash.at), left: percent(sash.from), width: percent(sash.length) }
  return (
    <div className={`editor-sash editor-sash-${sash.direction}`} style={style}>
      <Resizer
        axis={row ? 'x' : 'y'}
        onDrag={(delta) => {
          const area = areaRef.current
          const total = (row ? area?.clientWidth : area?.clientHeight) ?? 0
          if (total > 0 && sash.extent > 0) resizeEditorGroups(sash.path, sash.index, delta / (total * sash.extent))
        }}
      />
    </div>
  )
}

/**
 * The editor groups in the split grid, with a draggable divider on each boundary. The groups sit in a flat
 * list positioned by the grid: changing the grid never remounts a group (its EditorView survives).
 */
export function EditorArea() {
  const layout = useStore((s) => s.editorLayout)
  const areaRef = useRef<HTMLDivElement>(null)
  const rects = useMemo(() => layoutRects(layout), [layout])
  const sashes = useMemo(() => layoutSashes(layout), [layout])
  const split = rects.length > 1
  // The Claude button sits in the top right group, the closest to the panel.
  const corner = rects.find(({ rect }) => near(rect.x + rect.w, 1) && near(rect.y, 0))?.group

  return (
    <div className={`editor-area${split ? ' split' : ''}`} ref={areaRef}>
      {rects.map(({ group, rect }) => (
        <div key={group} className="editor-group-slot" style={split ? boxStyle(rect) : undefined}>
          <EditorGroup groupId={group} last={group === corner} />
        </div>
      ))}
      {sashes.map((sash) => (
        <Sash key={`${sash.path.join('.')}:${sash.index}`} sash={sash} areaRef={areaRef} />
      ))}
    </div>
  )
}
