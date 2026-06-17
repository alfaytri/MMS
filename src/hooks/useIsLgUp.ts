'use client'

import { useEffect, useState } from 'react'

const QUERY = '(min-width: 1024px)'

/**
 * Returns true when the viewport is at the Tailwind `lg:` breakpoint or above.
 * Returns false during SSR (mobile-first default).
 */
export function useIsLgUp(): boolean {
  const [isLg, setIsLg] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const update = () => setIsLg(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return isLg
}
