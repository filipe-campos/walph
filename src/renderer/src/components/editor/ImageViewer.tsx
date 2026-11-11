import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { readImage } from '../../fileViewActions'
import type { ImageTab } from '../../types/tabs'
import { errorMessage } from '../../lib/errors'
import { clampZoom, dataUrlBytes, fitScale, stepZoom, wheelZoom } from '../../lib/imageView'
import { formatBytes } from '../../lib/format'
import { isSvgPath, openFile } from '../../tabActions'
import { IconButton } from '../common/IconButton'
import { useT } from '../../i18n'
import { Button } from '../common/Button'
import { useAsync } from '../common/useAsync'

type Loaded = { url: string; bytes: number | null } | { error: string }

const RELOAD_MS = 150

export function ImageViewer({ tab }: { tab: ImageTab }) {
  const t = useT()
  // Watcher revision (`fileRevs`) and the one already read: the read waits for the file to settle before reloading.
  const diskRev = useStore((s) => s.fileRevs[tab.path] ?? 0)
  const [read, setRead] = useState({ path: tab.path, rev: diskRev })
  // Renaming changes the path: the revision read from the old path no longer holds, the new one starts from the disk
  // revision.
  const rev = read.path === tab.path ? read.rev : diskRev
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [view, setView] = useState({ width: 0, height: 0 })
  // `null` = fit the area; number = fixed zoom.
  const [zoom, setZoom] = useState<number | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  // Reloads when the file changes on disk (the watcher notifies by path).
  useEffect(() => {
    if (diskRev === rev) return
    const timer = setTimeout(() => setRead({ path: tab.path, rev: diskRev }), RELOAD_MS)
    return () => clearTimeout(timer)
  }, [diskRev, rev, tab.path])

  // The previous result stays shown during the reload (errors enter the value to replace it as well).
  const load = useAsync<Loaded>(
    () =>
      readImage(tab.path).then(
        (url) => ({ url, bytes: dataUrlBytes(url) }),
        (err: unknown) => ({ error: errorMessage(err) })
      ),
    [tab.path, rev],
    { keepPrevious: true }
  )
  const loaded = load.value

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setView((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // On reload keeps the previous size until `onLoad` (no flicker at the natural size).
  const size = natural
  const fit = size ? fitScale(view, size) : 1
  const scale = zoom ?? fit
  const scaleRef = useRef(scale)
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  // Cmd/Ctrl + wheel and the trackpad pinch (arrives as a wheel with `ctrlKey`). Native and non-passive: React does not
  // allow `preventDefault` on the wheel, and without it the whole page would zoom.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom(wheelZoom(scaleRef.current, e.deltaY))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  const error = load.status === 'success' && loaded && 'error' in loaded ? loaded.error : null
  const url = loaded && 'url' in loaded ? loaded.url : null
  const bytes = loaded && 'bytes' in loaded ? loaded.bytes : null

  return (
    <div
      className="image-viewer"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return
        if (e.key === '+' || e.key === '=') setZoom(stepZoom(scale, 1))
        else if (e.key === '-') setZoom(stepZoom(scale, -1))
        else if (e.key === '0') setZoom(null)
        else if (e.key === '1') setZoom(1)
      }}
    >
      <div className="image-stage" ref={stageRef}>
        {error ? (
          <div className="image-error" role="alert">
            <i className="codicon codicon-file-media" />
            <span>{error}</span>
          </div>
        ) : (
          url && (
            <img
              key={tab.path}
              className="image-canvas"
              src={url}
              alt={tab.path}
              draggable={false}
              style={size ? { width: size.width * scale, height: size.height * scale } : undefined}
              data-pixelated={scale >= 2 ? '' : undefined}
              onLoad={(e) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight
                })
              }
            />
          )
        )}
      </div>
      <div className="image-footer">
        <span className="image-info">
          {size ? `${size.width} × ${size.height} px` : ''}
          {bytes !== null && size ? ` · ${formatBytes(bytes)}` : ''}
        </span>
        <div className="image-zoom">
          <IconButton
            icon="codicon-zoom-out"
            label={t.editor.image.zoomOut}
            onClick={() => setZoom(stepZoom(scale, -1))}
          />
          <span className="image-zoom-value">{Math.round(clampZoom(scale) * 100)}%</span>
          <IconButton
            icon="codicon-zoom-in"
            label={t.editor.image.zoomIn}
            onClick={() => setZoom(stepZoom(scale, 1))}
          />
          <Button aria-pressed={zoom === null} onClick={() => setZoom(null)}>
            {t.editor.image.fit}
          </Button>
          {isSvgPath(tab.path) && (
            <Button onClick={() => openFile(tab.path, undefined, { asText: true })}>{t.editor.image.openAsText}</Button>
          )}
          <Button aria-pressed={zoom === 1} onClick={() => setZoom(1)}>
            100%
          </Button>
        </div>
      </div>
    </div>
  )
}
