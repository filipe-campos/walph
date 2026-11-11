import { useMemo, useState } from 'react'
import { formatFileSize, type Chip } from '../../lib/claudeAttachments'
import { useT } from '../../i18n'
import { FileIcon } from '../common/FileIcon'
import { IconButton } from '../common/IconButton'
import { ImageLightbox } from '../common/ImageLightbox'

/** Image and file chips attached to the message, each with "Remove". */
export function AttachmentChips({ chips, onRemove }: { chips: readonly Chip[]; onRemove: (key: number) => void }) {
  const t = useT()
  const [preview, setPreview] = useState<number | null>(null)
  // The data URL of a large image is built once, not on every render.
  const shown = useMemo(
    () =>
      chips.map((chip) =>
        chip.kind === 'image' ? { ...chip, url: `data:${chip.image.mediaType};base64,${chip.image.data}` } : chip
      ),
    [chips]
  )
  if (chips.length === 0) return null
  const previewed = shown.find((c) => c.kind === 'image' && c.key === preview)
  return (
    <div className="claude-images" data-testid="claude-attachments">
      {shown.map((chip) => (
        <div
          key={chip.key}
          className={chip.kind === 'image' ? 'claude-image' : 'claude-attachment'}
          data-kind={chip.kind}
          data-name={chip.name}
        >
          {chip.kind === 'image' ? (
            <button
              type="button"
              className="claude-image-open"
              aria-label={t.claude.attachmentChips.preview(chip.name)}
              title={chip.size ? `${chip.name} · ${formatFileSize(chip.size)}` : chip.name}
              onClick={() => setPreview(chip.key)}
            >
              <img src={chip.url} alt={t.claude.attachmentChips.imageAlt(chip.name)} />
            </button>
          ) : (
            <>
              <FileIcon name={chip.name.replace(/\/$/, '')} folder={chip.name.endsWith('/')} />
              <span className="claude-attachment-name ellipsis" title={chip.path}>
                {chip.name}
              </span>
              {/* Folder (main sends `name/` and size 0): no size. */}
              {!chip.name.endsWith('/') && <span className="claude-attachment-size">{formatFileSize(chip.size)}</span>}
            </>
          )}
          <IconButton
            icon="codicon-close"
            label={t.claude.attachmentChips.remove(chip.name)}
            onClick={() => onRemove(chip.key)}
          />
        </div>
      ))}
      {previewed?.kind === 'image' && (
        <ImageLightbox src={previewed.url} name={previewed.name} onClose={() => setPreview(null)} />
      )}
    </div>
  )
}
