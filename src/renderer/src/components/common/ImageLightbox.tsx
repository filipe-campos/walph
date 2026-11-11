import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { fitScale, stepZoom, wheelZoom } from '../../lib/imageView'
import { Modal } from './Modal'

/**
 * Enlarged image in a modal: fits the area by default; the mouse wheel and `+`/`-` zoom, `0` fits again and `1` shows
 * it at 100%; a click on the backdrop or Esc close.
 */
export function ImageLightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const t = useT()
  const stageRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ width: 0, height: 0 })
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  // `null` = fit the area; number = fixed zoom.
  const [zoom, setZoom] = useState<number | null>(null)
  const scale = zoom ?? (natural ? fitScale(view, natural) : 1)
  const scaleRef = useRef(scale)
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setView((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(stage)
    // Native and non-passive: React does not allow cancelling the wheel, and the list behind would scroll along.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      setZoom(wheelZoom(scaleRef.current, e.deltaY))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      stage.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <Modal title={name} className="image-lightbox" testId="image-lightbox" onClose={onClose}>
      <div
        ref={stageRef}
        className="image-lightbox-stage"
        tabIndex={-1}
        data-autofocus=""
        aria-label={t.common.imagePreview}
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey || e.altKey) return
          if (e.key === '+' || e.key === '=') setZoom(stepZoom(scale, 1))
          else if (e.key === '-') setZoom(stepZoom(scale, -1))
          else if (e.key === '0') setZoom(null)
          else if (e.key === '1') setZoom(1)
        }}
      >
        <img
          className="image-lightbox-img"
          src={src}
          alt={name}
          draggable={false}
          style={natural ? { width: natural.width * scale, height: natural.height * scale } : undefined}
          onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          onClick={() => setZoom(zoom === null ? 1 : null)}
        />
      </div>
    </Modal>
  )
}
