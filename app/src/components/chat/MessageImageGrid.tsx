import { Maximize2 } from 'lucide-react'
import { t } from '@/utils/i18n'
import type { LightboxImage } from './ImageLightboxModal'

export interface MessageImageGridProps {
  images: LightboxImage[]
  align?: 'start' | 'end'
  variant?: 'bubble' | 'tool'
  onOpen: (index: number) => void
}

/**
 * Shared zoomable image grid for message attachments and tool/browser screenshots.
 * Supports single-image hero preview, 2..4+ thumbnail grid with +N overflow, and keyboard activation.
 */
export default function MessageImageGrid({
  images,
  align = 'start',
  variant = 'bubble',
  onOpen,
}: MessageImageGridProps) {
  if (!images || images.length === 0) return null

  const alignClass = align === 'end' ? 'items-end' : 'items-start'
  const singleMaxClass = variant === 'tool' ? 'max-w-lg max-h-72' : 'max-w-[280px] max-h-[220px]'
  const singleImgClass = variant === 'tool' ? 'w-full h-auto max-h-72 object-contain select-none' : 'max-w-full max-h-[220px] object-contain select-none'

  return (
    <div className={`flex flex-col ${alignClass}`}>
      {images.length === 1 ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={images[0].name || t('chat.attachment.double_click_zoom')}
          title={t('chat.attachment.double_click_zoom')}
          className={`rounded-[6px] overflow-hidden border ${singleMaxClass} cursor-zoom-in hover:opacity-95 transition-opacity motion-reduce:transition-none relative group/img focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]`}
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
          onClick={(e) => {
            e.stopPropagation()
            onOpen(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onOpen(0)
            }
          }}
        >
          <img
            src={images[0].preview}
            alt={images[0].name || 'image'}
            className={singleImgClass}
          />
          <div
            className="absolute top-1.5 right-1.5 p-1 rounded-[4px] border opacity-0 group-hover/img:opacity-100 transition-opacity motion-reduce:transition-none pointer-events-none"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <Maximize2 size={11} />
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-1.5 ${
            images.length === 3 ? 'grid-cols-3 max-w-[280px]' : 'grid-cols-2 max-w-[260px]'
          }`}
        >
          {(images.length > 4 ? images.slice(0, 4) : images).map((att, i) => {
            const isOverflowTile = images.length > 4 && i === 3
            const remainingCount = images.length - 3
            const sizeClass = images.length === 3 ? 'w-22 h-22' : 'w-28 h-28'

            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-label={att.name || `image-${i + 1}`}
                title={t('chat.attachment.double_click_zoom')}
                className={`aspect-square ${sizeClass} rounded-[6px] overflow-hidden border cursor-zoom-in hover:opacity-95 transition-opacity motion-reduce:transition-none relative group/img flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]`}
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(i)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onOpen(i)
                  }
                }}
              >
                <img
                  src={att.preview}
                  alt={att.name || `image-${i + 1}`}
                  className="w-full h-full object-cover select-none"
                />
                {!isOverflowTile && (
                  <div
                    className="absolute top-1 right-1 p-0.5 rounded-[4px] border opacity-0 group-hover/img:opacity-100 transition-opacity motion-reduce:transition-none pointer-events-none"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Maximize2 size={10} />
                  </div>
                )}
                {isOverflowTile && (
                  <div
                    className="absolute inset-0 flex items-center justify-center font-mono font-semibold text-base"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.65)',
                      color: '#FFFFFF',
                    }}
                  >
                    +{remainingCount}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
