'use client'

import { useEffect, useState } from 'react'

const QUERY = '(min-width: 640px)'

/**
 * Returns true when the viewport is at the Tailwind `sm:` breakpoint or above
 * (i.e. tablet / desktop). Returns false during SSR and on phones — so the
 * first client paint assumes phone and the effect corrects it on mount.
 *
 * Used to pick the item-picker surface: anchored popover on `sm+`, full-screen
 * bottom sheet on a phone (where a floating popover gets crushed by the
 * on-screen keyboard).
 */
export function useIsSmUp(): boolean {
  const [isSm, setIsSm] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const update = () => setIsSm(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return isSm
}
