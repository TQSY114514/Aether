import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Check,
  RotateCw,
  Expand,
  Shrink,
} from 'lucide-react'
import { t } from '@/utils/i18n'

export interface LightboxImage {
  name?: string
  preview: string
}

interface ImageLightboxModalProps {
  images: LightboxImage[]
  initialIndex?: number
  onClose: () => void
}

/**
 * World-class interactive image inspection overlay:
 * - Edge-to-edge immersive full-screen viewport with optional true OS Fullscreen (F / F11)
 * - Focal-point wheel zoom anchored to mouse cursor
 * - Smart drag-to-pan with 120Hz zero-lag tracking and drag/click discrimination
 * - Double-click to toggle Fit ↔ 1:1 Actual Pixel Size (anchored at click point)
 * - 90° Clockwise rotation
 * - Safe boundary constraints (prevents panning image out of view)
 * - Auto-fading HUD for distraction-free inspection
 * - Floating glass HUD with filmstrip thumbnail strip
 * - Keyboard shortcuts (Esc, F, Space, 0, 1, +, -, R, ArrowLeft, ArrowRight)
 * - Clipboard copy & high-res download
 */
export default function ImageLightboxModal({ images, initialIndex = 0, onClose }: ImageLightboxModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const interactionTimerRef = useRef<any>(null)
  const idleTimerRef = useRef<any>(null)
  const dragMouseStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, images.length - 1))
  )
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isInteracting, setIsInteracting] = useState(false) // true during continuous mouse drag/wheel -> disable CSS transitions
  const [isHudIdle, setIsHudIdle] = useState(false) // auto-dim HUD when idle
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hasDragged, setHasDragged] = useState(false)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const currentImage = images[currentIndex]

  // Reset viewport state when changing images
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
    setNaturalSize(null)
    setIsInteracting(false)
  }, [currentIndex])

  // Track native fullscreen changes (via F11, Esc, or programmatic toggle)
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Lock background window scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1))
  }, [images.length])

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0))
  }, [images.length])

  const handleResetZoom = useCallback(() => {
    setIsInteracting(false)
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  const handleRotate = useCallback(() => {
    setIsInteracting(false)
    setRotation((r) => (r + 90) % 360)
  }, [])

  const handleZoomIn = useCallback(() => {
    setIsInteracting(false)
    setScale((s) => Math.min(8, Number((s + 0.25).toFixed(2))))
  }, [])

  const handleZoomOut = useCallback(() => {
    setIsInteracting(false)
    setScale((s) => {
      const next = Math.max(0.25, Number((s - 0.25).toFixed(2)))
      if (next <= 1) setPosition({ x: 0, y: 0 })
      return next
    })
  }, [])

  // Toggle true OS/display full screen
  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen()
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        }
      }
    } catch {
      // Ignored if permissions are restricted
    }
  }, [])

  // Calculate true 1:1 scale (pixel-to-pixel ratio based on naturalWidth vs rendered clientWidth)
  const getActualPixelScale = useCallback(() => {
    const img = imgRef.current
    if (img && naturalSize && img.clientWidth > 0) {
      const ratio = naturalSize.w / img.clientWidth
      return Math.max(1.2, Math.min(6, Number(ratio.toFixed(2))))
    }
    return 2
  }, [naturalSize])

  // Toggle between Fit to Window (1.0) and 1:1 Actual Pixel Size
  const handleToggleFitOrActual = useCallback(
    (e?: React.MouseEvent) => {
      setIsInteracting(false)
      if (scale > 1.05) {
        setScale(1)
        setPosition({ x: 0, y: 0 })
      } else {
        const targetScale = getActualPixelScale()
        if (e && containerRef.current) {
          const stageRect = containerRef.current.getBoundingClientRect()
          const stageCenterX = stageRect.left + stageRect.width / 2
          const stageCenterY = stageRect.top + stageRect.height / 2
          const mouseX = e.clientX - stageCenterX
          const mouseY = e.clientY - stageCenterY
          const scaleRatio = targetScale / scale
          const nextX = mouseX - (mouseX - position.x) * scaleRatio
          const nextY = mouseY - (mouseY - position.y) * scaleRatio
          setPosition({ x: nextX, y: nextY })
        } else {
          setPosition({ x: 0, y: 0 })
        }
        setScale(targetScale)
      }
    },
    [scale, position, getActualPixelScale]
  )

  // Focal-Point Mouse Wheel Zoom (cursor-anchored, zero background jitter)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      setIsInteracting(true)
      setIsHudIdle(false)
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current)
      interactionTimerRef.current = setTimeout(() => setIsInteracting(false), 120)

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87

      setScale((prevScale) => {
        const nextScale = Math.max(0.25, Math.min(8, Number((prevScale * zoomFactor).toFixed(3))))
        if (Math.abs(nextScale - prevScale) < 0.001) return prevScale

        const stageRect = el.getBoundingClientRect()
        const stageCenterX = stageRect.left + stageRect.width / 2
        const stageCenterY = stageRect.top + stageRect.height / 2
        const mouseX = e.clientX - stageCenterX
        const mouseY = e.clientY - stageCenterY

        setPosition((prevPos) => {
          if (nextScale <= 1) {
            return { x: prevPos.x * 0.4, y: prevPos.y * 0.4 }
          }
          const scaleRatio = nextScale / prevScale
          const nextX = mouseX - (mouseX - prevPos.x) * scaleRatio
          const nextY = mouseY - (mouseY - prevPos.y) * scaleRatio

          // Clamped safe bounds so image doesn't fly off screen
          const maxOffsetX = (stageRect.width * nextScale) / 2 + 100
          const maxOffsetY = (stageRect.height * nextScale) / 2 + 100

          return {
            x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX)),
            y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY)),
          }
        })

        return nextScale
      })
    }

    el.addEventListener('wheel', onNativeWheel, { passive: false })
    return () => el.removeEventListener('wheel', onNativeWheel)
  }, [])

  // Comprehensive keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        } else {
          onClose()
        }
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleFullscreen()
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        handlePrev()
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        handleNext()
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn()
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut()
      } else if (e.key === '0') {
        handleResetZoom()
      } else if (e.key === '1') {
        handleToggleFitOrActual()
      } else if (e.key === 'r' || e.key === 'R') {
        handleRotate()
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleToggleFitOrActual()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    onClose,
    handlePrev,
    handleNext,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleToggleFitOrActual,
    handleRotate,
    handleToggleFullscreen,
  ])

  // Mouse move resets HUD idle timer so controls re-appear cleanly
  const handleStageMouseMove = (e: React.MouseEvent) => {
    setIsHudIdle(false)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      // Auto-dim HUD only when zoomed in to prioritize inspectability
      if (scale > 1.1) {
        setIsHudIdle(true)
      }
    }, 2800)

    if (!isDragging) return
    if (Math.hypot(e.clientX - dragMouseStartRef.current.x, e.clientY - dragMouseStartRef.current.y) > 3) {
      setHasDragged(true)
    }

    const rawX = e.clientX - dragStart.x
    const rawY = e.clientY - dragStart.y

    if (containerRef.current) {
      const stageRect = containerRef.current.getBoundingClientRect()
      const maxOffsetX = (stageRect.width * scale) / 2 + 100
      const maxOffsetY = (stageRect.height * scale) / 2 + 100
      setPosition({
        x: Math.max(-maxOffsetX, Math.min(maxOffsetX, rawX)),
        y: Math.max(-maxOffsetY, Math.min(maxOffsetY, rawY)),
      })
    } else {
      setPosition({ x: rawX, y: rawY })
    }
  }

  // Mouse drag handlers with drag-vs-click threshold discrimination
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // only left click
    setIsInteracting(true)
    setIsDragging(true)
    setHasDragged(false)
    dragMouseStartRef.current = { x: e.clientX, y: e.clientY }
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsInteracting(false)
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentImage?.preview) return
    if (navigator.clipboard?.write && window.ClipboardItem) {
      try {
        const res = await fetch(currentImage.preview)
        const blob = await res.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
        return
      } catch {
        // Fallback to electronAPI if web API throws
      }
    }
    // Fallback to electronAPI
    if ((window as any).electronAPI?.system?.clipboardWrite) {
      ;(window as any).electronAPI.system.clipboardWrite(currentImage.preview)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentImage?.preview) return
    const a = document.createElement('a')
    a.href = currentImage.preview
    a.download = currentImage.name || `image-${currentIndex + 1}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!currentImage) return null

  const isFit = Math.abs(scale - 1) < 0.05

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={currentImage.name || 'Image Preview'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md select-none overflow-hidden animate-fade-in"
      onClick={(e) => {
        // Clicking backdrop closes modal; dragging doesn't close
        if (!hasDragged && e.target === containerRef.current) {
          onClose()
        }
      }}
      onMouseMove={handleStageMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Header Bar: File Info + Natural Resolution + Current Scale */}
      <div
        className={`absolute top-4 left-6 z-20 flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-mono shadow-lg border border-white/10 backdrop-blur-md transition-opacity duration-300 ${
          isHudIdle ? 'opacity-25 hover:opacity-100' : 'opacity-100'
        }`}
        style={{ backgroundColor: 'rgba(24, 24, 27, 0.85)', color: '#d4d4d8' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate max-w-sm font-medium">{currentImage.name || `image-${currentIndex + 1}`}</span>
        {naturalSize && (
          <span className="opacity-60 text-[11px] tabular-nums font-normal">
            ({naturalSize.w} × {naturalSize.h} px)
          </span>
        )}
        <div className="w-[1px] h-3 bg-white/15 mx-1" />
        <span className="opacity-80 text-[11px] font-mono tabular-nums">
          {isFit ? t('chat.lightbox.fit') : `${Math.round(scale * 100)}%`}
        </span>
        {rotation !== 0 && (
          <span className="opacity-60 text-[11px] font-mono tabular-nums">
            {rotation}°
          </span>
        )}
      </div>

      {/* Top Right Actions: Fullscreen + Close Button */}
      <div
        className={`absolute top-4 right-6 z-20 flex items-center gap-2 transition-opacity duration-300 ${
          isHudIdle ? 'opacity-25 hover:opacity-100' : 'opacity-100'
        }`}
      >
        {/* Fullscreen Toggle */}
        <button
          onClick={handleToggleFullscreen}
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 icon-btn-silky transition-colors border border-white/10 shadow-lg backdrop-blur-md"
          style={{ backgroundColor: 'rgba(24, 24, 27, 0.85)' }}
          title={isFullscreen ? t('chat.lightbox.exit_fullscreen') : t('chat.lightbox.fullscreen')}
          aria-label={isFullscreen ? t('chat.lightbox.exit_fullscreen') : t('chat.lightbox.fullscreen')}
        >
          {isFullscreen ? <Shrink size={16} /> : <Expand size={16} />}
        </button>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 icon-btn-silky transition-colors border border-white/10 shadow-lg backdrop-blur-md"
          style={{ backgroundColor: 'rgba(24, 24, 27, 0.85)' }}
          title={t('chat.lightbox.close')}
          aria-label={t('chat.lightbox.close')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Gallery Left Arrow (Multi-image) */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handlePrev()
          }}
          className={`absolute left-6 z-20 p-3 rounded-full text-white/80 hover:text-white border border-white/10 shadow-xl backdrop-blur-md transition-all active:scale-90 hover:bg-white/15 ${
            isHudIdle ? 'opacity-20 hover:opacity-100' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(24, 24, 27, 0.85)' }}
          title={t('chat.lightbox.prev')}
          aria-label={t('chat.lightbox.prev')}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Main Image Stage: Edge-to-Edge full bleed canvas */}
      <div
        className="relative w-full h-full flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden cursor-default"
        onClick={(e) => {
          if (!hasDragged && e.target === e.currentTarget) {
            onClose()
          }
        }}
      >
        <div
          className="flex items-center justify-center will-change-transform"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`,
            transition: isInteracting ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
          }}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleToggleFitOrActual}
        >
          <img
            ref={imgRef}
            src={currentImage.preview}
            alt={currentImage.name || 'Image'}
            className="max-w-[96vw] max-h-[92vh] object-contain select-none pointer-events-none drop-shadow-2xl"
            onLoad={(e) => {
              const img = e.currentTarget
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* Gallery Right Arrow (Multi-image) */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleNext()
          }}
          className={`absolute right-6 z-20 p-3 rounded-full text-white/80 hover:text-white border border-white/10 shadow-xl backdrop-blur-md transition-all active:scale-90 hover:bg-white/15 ${
            isHudIdle ? 'opacity-20 hover:opacity-100' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(24, 24, 27, 0.85)' }}
          title={t('chat.lightbox.next')}
          aria-label={t('chat.lightbox.next')}
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Bottom Floating Island: Filmstrip + Control Pill */}
      <div
        className={`absolute bottom-5 z-20 flex flex-col items-center gap-2 max-w-2xl w-full px-4 transition-opacity duration-300 ${
          isHudIdle ? 'opacity-25 hover:opacity-100' : 'opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Filmstrip Carousel (Multi-image) */}
        {images.length > 1 && (
          <div
            className="flex items-center gap-1.5 p-1.5 rounded-[8px] border border-white/10 backdrop-blur-md shadow-xl overflow-x-auto max-w-full"
            style={{ backgroundColor: 'rgba(24, 24, 27, 0.85)' }}
          >
            {images.map((img, idx) => {
              const isActive = idx === currentIndex
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-10 h-10 rounded-[4px] overflow-hidden border transition-all shrink-0 ${
                    isActive
                      ? 'border-white opacity-100 scale-105 shadow-md'
                      : 'border-transparent opacity-45 hover:opacity-85'
                  }`}
                  title={img.name || `image-${idx + 1}`}
                >
                  <img
                    src={img.preview}
                    alt={img.name || ''}
                    className="w-full h-full object-cover select-none pointer-events-none"
                    draggable={false}
                  />
                </button>
              )
            })}
          </div>
        )}

        {/* Minimalist Floating Pill Toolbar */}
        <div
          className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-white/10 shadow-2xl backdrop-blur-md text-xs text-white"
          style={{ backgroundColor: 'rgba(24, 24, 27, 0.90)' }}
        >
          {images.length > 1 && (
            <>
              <span className="font-mono text-[11px] font-medium text-white/70 px-1">
                {currentIndex + 1} / {images.length}
              </span>
              <div className="w-[1px] h-3.5 bg-white/15 mx-0.5" />
            </>
          )}

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.25}
            className="p-1.5 rounded-full hover:bg-white/15 icon-btn-silky disabled:opacity-30"
            title={t('chat.lightbox.zoom_out')}
            aria-label={t('chat.lightbox.zoom_out')}
          >
            <ZoomOut size={14} />
          </button>

          {/* Scale Reset Pill */}
          <button
            onClick={handleResetZoom}
            className="px-2 py-0.5 rounded-full font-mono text-[11px] hover:bg-white/15 icon-btn-silky tabular-nums"
            title={t('chat.lightbox.reset')}
            aria-label={t('chat.lightbox.reset')}
          >
            {isFit ? t('chat.lightbox.fit') : `${Math.round(scale * 100)}%`}
          </button>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            disabled={scale >= 8}
            className="p-1.5 rounded-full hover:bg-white/15 icon-btn-silky disabled:opacity-30"
            title={t('chat.lightbox.zoom_in')}
            aria-label={t('chat.lightbox.zoom_in')}
          >
            <ZoomIn size={14} />
          </button>

          <div className="w-[1px] h-3.5 bg-white/15 mx-0.5" />

          {/* Toggle Fit ↔ 1:1 Actual Size */}
          <button
            onClick={() => handleToggleFitOrActual()}
            className="p-1.5 rounded-full hover:bg-white/15 icon-btn-silky"
            title={scale > 1.05 ? t('chat.lightbox.fit_to_window') : t('chat.lightbox.actual_size')}
            aria-label={scale > 1.05 ? t('chat.lightbox.fit_to_window') : t('chat.lightbox.actual_size')}
          >
            {scale > 1.05 ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={handleToggleFullscreen}
            className="p-1.5 rounded-full hover:bg-white/15 icon-btn-silky"
            title={isFullscreen ? t('chat.lightbox.exit_fullscreen') : t('chat.lightbox.fullscreen')}
            aria-label={isFullscreen ? t('chat.lightbox.exit_fullscreen') : t('chat.lightbox.fullscreen')}
          >
            {isFullscreen ? <Shrink size={14} /> : <Expand size={14} />}
          </button>

          {/* Rotate 90° Clockwise */}
          <button
            onClick={handleRotate}
            className="p-1.5 rounded-full hover:bg-white/15 icon-btn-silky"
            title={t('chat.lightbox.rotate')}
            aria-label={t('chat.lightbox.rotate')}
          >
            <RotateCw size={14} />
          </button>

          {/* Copy Image */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-full hover:bg-white/15 icon-btn-silky relative"
            title={copied ? t('chat.lightbox.copied') : t('chat.lightbox.copy')}
            aria-label={copied ? t('chat.lightbox.copied') : t('chat.lightbox.copy')}
          >
            {copied ? <Check size={14} className="text-emerald-400 animate-scale-pop" /> : <Copy size={14} />}
          </button>

          {/* Download Image */}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-full hover:bg-white/15 icon-btn-silky"
            title={t('chat.lightbox.download')}
            aria-label={t('chat.lightbox.download')}
          >
            <Download size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
