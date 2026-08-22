'use client'

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'

export function useScrollSnapArrows<T extends HTMLElement>(
  cardSelector = '[data-snap-card]',
): { ref: RefObject<T>; canLeft: boolean; canRight: boolean; scrollLeft: () => void; scrollRight: () => void } {
  const ref = useRef<T>(null!)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(false)

  const recompute = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    recompute()
    el.addEventListener('scroll', recompute, { passive: true })
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', recompute)
      ro.disconnect()
    }
  }, [recompute])

  function step(dir: 1 | -1) {
    const el = ref.current
    if (!el) return
    const firstCard = el.querySelector<HTMLElement>(cardSelector)
    const w = (firstCard?.offsetWidth ?? 240) + 12
    el.scrollBy({ left: dir * w, behavior: 'smooth' })
  }

  return {
    ref,
    canLeft,
    canRight,
    scrollLeft:  () => step(-1),
    scrollRight: () => step( 1),
  }
}
