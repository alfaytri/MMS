'use client'

import { useState } from 'react'
import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Inventory item photo thumbnail. Used across every item-picker surface —
 * WhItemPicker rows, CascadeInventorySelector leaves, inventory master
 * list, item detail dialog — so the app has one consistent visual
 * treatment for product photos.
 *
 * When `url` is missing or the image fails to load, renders a subtle
 * grey `Package`-icon placeholder inside a `bg-muted` square — the row
 * never shows a browser broken-image glyph.
 *
 * Sizes are constrained to the design system's set (32/40/48/64 px)
 * so pickers, list cells, and detail previews stay visually related.
 */

type ItemPhotoSize = 24 | 32 | 40 | 48 | 64 | 96 | 120

interface Props {
  url:   string | null | undefined
  name?: string | null
  size?: ItemPhotoSize
  className?: string
}

const SIZE_TO_ICON_PX: Record<ItemPhotoSize, number> = {
  24:  12,
  32:  14,
  40:  16,
  48:  18,
  64:  24,
  96:  32,
  120: 40,
}

export function ItemPhoto({ url, name, size = 48, className }: Props) {
  const [failed, setFailed] = useState(false)

  const wrapperClass = cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted',
    className,
  )
  const style = { width: size, height: size }

  const showImage = !!url && !failed
  const iconPx = SIZE_TO_ICON_PX[size]

  return (
    <div className={wrapperClass} style={style}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name ?? ''}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package
          className="text-muted-foreground/50"
          style={{ width: iconPx, height: iconPx }}
          aria-hidden
        />
      )}
    </div>
  )
}
