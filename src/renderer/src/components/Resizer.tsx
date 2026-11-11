import { useRef } from 'react'

/** Drag handle to resize panels. `onDrag` receives the offset in px since the last event. */
export function Resizer({ axis, onDrag }: { axis: 'x' | 'y'; onDrag: (delta: number) => void }) {
  const last = useRef<number | null>(null)

  return (
    <div
      className={`resizer resizer-${axis}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        last.current = axis === 'x' ? e.clientX : e.clientY
        document.body.classList.add(`resizing-${axis}`)
      }}
      onPointerMove={(e) => {
        if (last.current === null) return
        const pos = axis === 'x' ? e.clientX : e.clientY
        onDrag(pos - last.current)
        last.current = pos
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        last.current = null
        document.body.classList.remove(`resizing-${axis}`)
      }}
    />
  )
}
