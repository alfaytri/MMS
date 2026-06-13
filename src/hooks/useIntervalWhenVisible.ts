'use client'

import { useEffect, useRef } from 'react'

export function useIntervalWhenVisible(callback: () => void, intervalMs: number): void {
  const callbackRef = useRef(callback)
  useEffect(() => { callbackRef.current = callback }, [callback])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const tick = (): void => {
      if (typeof document !== 'undefined' && document.hidden) return
      callbackRef.current()
    }

    const start = (): void => {
      if (timer != null) return
      timer = setInterval(tick, intervalMs)
    }
    const stop = (): void => {
      if (timer != null) { clearInterval(timer); timer = null }
    }

    const onVisibilityChange = (): void => {
      if (typeof document === 'undefined') return
      if (document.hidden) {
        stop()
      } else {
        callbackRef.current()
        start()
      }
    }

    if (typeof document !== 'undefined' && !document.hidden) start()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }, [intervalMs])
}
