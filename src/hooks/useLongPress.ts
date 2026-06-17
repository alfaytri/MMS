'use client'

import { useCallback, useEffect, useRef } from 'react'

interface UseLongPressOptions {
  /** ms the user must hold before the long-press fires. Default 500. */
  durationMs?: number
  /** Pixel slop — if the touch moves more than this, the press is cancelled. Default 8. */
  moveTolerancePx?: number
}

interface UseLongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchCancel: (e: React.TouchEvent) => void
}

/**
 * Fires `onLongPress` when the user holds a touch on the target for
 * `durationMs` (default 500). Movement beyond `moveTolerancePx` cancels
 * the press, as does releasing or interruption. Pointer/mouse events are
 * intentionally ignored — desktop should use hover, not long-press.
 */
export function useLongPress(
  onLongPress: () => void,
  options: UseLongPressOptions = {},
): UseLongPressHandlers {
  const { durationMs = 500, moveTolerancePx = 8 } = options
  const timerRef = useRef<number | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPosRef.current = null
  }, [])

  useEffect(() => clear, [clear])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      firedRef.current = false
      startPosRef.current = { x: t.clientX, y: t.clientY }
      clear()
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true
        onLongPress()
      }, durationMs)
    },
    [clear, durationMs, onLongPress],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0]
      const start = startPosRef.current
      if (!t || !start) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (Math.hypot(dx, dy) > moveTolerancePx) clear()
    },
    [clear, moveTolerancePx],
  )

  const onTouchEnd = useCallback(() => {
    clear()
  }, [clear])

  const onTouchCancel = useCallback(() => {
    clear()
  }, [clear])

  return { onTouchStart, onTouchEnd, onTouchMove, onTouchCancel }
}
