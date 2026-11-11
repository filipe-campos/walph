import { t } from '@shared/i18n'
import type { ClaudeImage } from '@shared/types'
import { useCallback, useState } from 'react'
import { authorizeAttachments, pickAttachments } from '../../claudePromptActions'
import { addChips, chipFromFile, imageChip, type Chip } from '../../lib/claudeAttachments'
import { notify } from '../../toasts'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES: ClaudeImage['mediaType'][] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function readImage(file: File): Promise<ClaudeImage | null> {
  const mediaType = IMAGE_TYPES.find((type) => type === file.type)
  if (!mediaType) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      resolve({ mediaType, data: url.slice(url.indexOf(',') + 1) })
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

const dragHasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

/** Prompt box attachments: chips, pasting an image, picking files and drag and drop. */
export function useAttachments(focusInput: () => void) {
  const [chips, setChips] = useState<Chip[]>([])
  const [dragging, setDragging] = useState(false)

  const removeChips = useCallback(
    (keys: ReadonlySet<number>) => setChips((list) => list.filter((c) => !keys.has(c.key))),
    []
  )

  /** Image (pasted or dragged) → chip with a thumbnail; 5 MB limit and formats Claude reads. */
  const addImageFile = (file: File): void => {
    const m = t().claude.useAttachments
    const label = file.name || m.pasted
    if (file.size > MAX_IMAGE_BYTES) {
      notify(m.imageTooLarge(label))
      return
    }
    void readImage(file).then((image) => {
      if (image)
        setChips((list) => addChips(list, [imageChip(image, file.name || t().claude.useAttachments.image, file.size)]))
      else notify(t().claude.useAttachments.unsupportedImage)
    })
  }

  const onPaste = (e: React.ClipboardEvent): void => {
    const imageFiles = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    // Pasting text along with the image (e.g. copied from a spreadsheet or page): the text goes into the field
    // normally.
    if (!e.clipboardData.getData('text/plain')) e.preventDefault()
    for (const file of imageFiles) addImageFile(file)
  }

  const addFiles = (found: Parameters<typeof chipFromFile>[0][]): void => {
    if (found.length > 0) setChips((list) => addChips(list, found.map(chipFromFile)))
  }

  const attach = (): void => {
    void pickAttachments().then(addFiles)
    // The native dialog returns focus to the window; the field needs it to keep typing.
    focusInput()
  }

  const onDrop = (e: React.DragEvent): void => {
    setDragging(false)
    if (!dragHasFiles(e)) return
    e.preventDefault()
    const paths: string[] = []
    for (const file of [...e.dataTransfer.files]) {
      // With a path, main validates (size limit, an outside file asks for confirmation) and returns the image already
      // read; without a path (e.g. dragged from a page) it can only be read through the FileReader.
      const path = window.api.files.pathForFile(file)
      if (path) paths.push(path)
      else if (IMAGE_TYPES.some((type) => type === file.type)) addImageFile(file)
      else notify(t().claude.useAttachments.notOnDisk(file.name))
    }
    void authorizeAttachments(paths).then(addFiles)
    focusInput()
  }

  const dropZone = {
    onDragEnter: (e: React.DragEvent): void => {
      if (dragHasFiles(e)) setDragging(true)
    },
    onDragOver: (e: React.DragEvent): void => {
      if (!dragHasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent): void => {
      // Leaving to a child does not count: only when the pointer leaves the box.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop
  }

  return { chips, dragging, dropZone, onPaste, attach, removeChips }
}
