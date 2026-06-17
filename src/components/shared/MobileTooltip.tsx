'use client'

import * as React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useLongPress } from '@/hooks/useLongPress'

interface MobileTooltipProps {
  /** Tooltip body. Anything renderable (string or JSX). */
  content: React.ReactNode
  children: React.ReactElement
  /** ms to hold before the tooltip opens on touch. Default 500. */
  longPressMs?: number
  /** ms to keep the tooltip open after a long-press before auto-close. Default 3000. */
  autoCloseMs?: number
  /** Tooltip side — passed to Radix TooltipContent. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Optional className for the tooltip content. */
  contentClassName?: string
}

/**
 * A Tooltip that works on touch devices via long-press (default 500 ms hold).
 * On a device with hover, it behaves exactly like the desktop tooltip.
 *
 * The trigger child is cloned with extra touch handlers — pass any focusable
 * element (button, a, span with tabIndex, etc.) as the single child.
 */
export function MobileTooltip({
  content,
  children,
  longPressMs = 500,
  autoCloseMs = 3000,
  side,
  contentClassName,
}: MobileTooltipProps) {
  const [open, setOpen] = React.useState(false)
  const closeTimerRef = React.useRef<number | null>(null)

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  React.useEffect(() => clearCloseTimer, [clearCloseTimer])

  const longPress = useLongPress(
    () => {
      setOpen(true)
      clearCloseTimer()
      closeTimerRef.current = window.setTimeout(() => setOpen(false), autoCloseMs)
    },
    { durationMs: longPressMs },
  )

  // Merge our touch handlers with whatever the child already has.
  const childProps = (children.props ?? {}) as Record<string, unknown>
  const mergedChild = React.cloneElement(children, {
    onTouchStart: (e: React.TouchEvent) => {
      longPress.onTouchStart(e)
      const orig = childProps.onTouchStart
      if (typeof orig === 'function') (orig as (e: React.TouchEvent) => void)(e)
    },
    onTouchMove: (e: React.TouchEvent) => {
      longPress.onTouchMove(e)
      const orig = childProps.onTouchMove
      if (typeof orig === 'function') (orig as (e: React.TouchEvent) => void)(e)
    },
    onTouchEnd: (e: React.TouchEvent) => {
      longPress.onTouchEnd(e)
      const orig = childProps.onTouchEnd
      if (typeof orig === 'function') (orig as (e: React.TouchEvent) => void)(e)
    },
    onTouchCancel: (e: React.TouchEvent) => {
      longPress.onTouchCancel(e)
      const orig = childProps.onTouchCancel
      if (typeof orig === 'function') (orig as (e: React.TouchEvent) => void)(e)
    },
  } as React.HTMLAttributes<HTMLElement>)

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>{mergedChild}</TooltipTrigger>
        <TooltipContent side={side} className={contentClassName}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
