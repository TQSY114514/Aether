/**
 * Clipboard copy and save/download helpers for ImageLightboxModal.
 */

export async function copyImageToClipboard(source: string): Promise<boolean> {
  if (!source) return false
  try {
    const ipcRes = await window.electronAPI?.system?.clipboardWriteImage?.(source)
    if (ipcRes?.ok) return true
  } catch {
    // Fall through to browser ClipboardItem fallback
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined') {
    try {
      const res = await fetch(source)
      const blob = await res.blob()
      const pngBlob = blob.type === 'image/png' ? blob : await (async () => {
        const bmp = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width
        canvas.height = bmp.height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(bmp, 0, 0)
        return await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
        )
      })()
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })])
      return true
    } catch {
      return false
    }
  }
  return false
}

export async function downloadImageSource(source: string, defaultName: string): Promise<void> {
  if (!source) return
  try {
    const saveFn = window.electronAPI?.system?.saveImage
    if (saveFn) {
      const res = await saveFn({ source, defaultName })
      if (res?.ok || res?.canceled) return
    }
  } catch {
    // Fall through to browser blob download fallback
  }

  try {
    const res = await fetch(source)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = defaultName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    const a = document.createElement('a')
    a.href = source
    a.download = defaultName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}
