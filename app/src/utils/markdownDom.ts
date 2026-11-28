import type React from 'react'
import { useEffect } from 'react'
import type { LightboxImage } from '@/components/chat/ImageLightboxModal'

/**
 * Collect all zoomable images rendered inside markdown containers (`.mc img`)
 * within `root`, returning the list and the index matching `clickedImg`.
 */
export function collectMarkdownImages(
  root: HTMLElement | null,
  clickedImg: HTMLImageElement,
  prefixImages: LightboxImage[] = []
): { images: LightboxImage[]; index: number } {
  const images: LightboxImage[] = [...prefixImages]
  let matchIndex = -1

  if (root) {
    const imgs = root.querySelectorAll('.mc img')
    imgs.forEach((node) => {
      const img = node as HTMLImageElement
      const src = img.currentSrc || img.getAttribute('src') || ''
      if (!src) return
      const idx = images.length
      images.push({
        name: img.alt || img.dataset.localPath?.split(/[\\/]/).pop() || undefined,
        preview: src,
      })
      if (img === clickedImg) {
        matchIndex = idx
      }
    })
  }

  if (matchIndex === -1) {
    const fallbackSrc = clickedImg.currentSrc || clickedImg.getAttribute('src') || ''
    if (fallbackSrc) {
      matchIndex = images.length
      images.push({
        name: clickedImg.alt || clickedImg.dataset.localPath?.split(/[\\/]/).pop() || undefined,
        preview: fallbackSrc,
      })
    }
  }

  return { images, index: Math.max(0, matchIndex) }
}

/**
 * Unified click delegation for rendered markdown containers (`.mc`):
 * handles `.code-fold`, `.code-copy`, and `.mc img` lightbox opening.
 */
export function handleMarkdownContainerClick(
  e: React.MouseEvent,
  root: HTMLElement | null,
  onOpenImages: (images: LightboxImage[], index: number) => void,
  prefixImages: LightboxImage[] = []
): boolean {
  const targetEl = e.target as HTMLElement | null
  if (!targetEl) return false

  const fold = targetEl.closest('.code-fold') as HTMLElement | null
  if (fold) {
    e.stopPropagation()
    const pre = fold.closest('pre.code-block')
    if (pre) {
      const collapsed = pre.classList.toggle('collapsed')
      const n = fold.getAttribute('data-lines') || ''
      fold.textContent = collapsed ? '▸' : '▾'
      fold.setAttribute('data-folded', collapsed ? '1' : '0')
      if (collapsed) fold.setAttribute('title', `${n} lines — click to expand`)
    }
    return true
  }

  const copyBtn = targetEl.closest('.code-copy') as HTMLElement | null
  if (copyBtn) {
    e.stopPropagation()
    const raw = copyBtn.getAttribute('data-code') || ''
    // getAttribute() already resolves HTML entities — decoding again here
    // would corrupt code that literally contains e.g. "&amp;" (double-escape).
    navigator.clipboard?.writeText(raw)
    const prev = copyBtn.textContent
    copyBtn.textContent = 'Copied!'
    copyBtn.classList.add('copied')
    setTimeout(() => {
      copyBtn.textContent = prev
      copyBtn.classList.remove('copied')
    }, 1200)
    return true
  }

  const img = targetEl.closest('.mc img') as HTMLImageElement | null
  if (img) {
    e.stopPropagation()
    const { images, index } = collectMarkdownImages(root, img, prefixImages)
    if (images.length > 0) {
      onOpenImages(images, index)
    }
    return true
  }

  return false
}

/**
 * Capture-phase image error fallback for local Windows paths when `file:///`
 * is blocked by the dev-server origin (`http://localhost:5173`).
 */
export function useLocalImageFallback(containerRef: React.RefObject<HTMLElement | null>, depsKey: unknown) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onImgError = async (evt: Event) => {
      const target = evt.target
      if (!(target instanceof HTMLImageElement)) return
      const localPath = target.dataset.localPath
      if (!localPath || target.dataset.localResolved) return
      target.dataset.localResolved = '1'
      try {
        const res = await window.electronAPI?.system?.readLocalImage?.(localPath)
        if (res?.ok && res.dataUrl && target.isConnected) {
          target.src = res.dataUrl
        }
      } catch {
        // Ignore if file is missing or outside authorized directories
      }
    }

    el.addEventListener('error', onImgError, true)
    return () => el.removeEventListener('error', onImgError, true)
  }, [containerRef, depsKey])
}
