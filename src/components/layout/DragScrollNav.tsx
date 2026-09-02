'use client'

import { useRef, useState, type ReactNode, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react'

/**
 * A `<nav>` you can grab and drag horizontally to scroll (click-and-pan),
 * on top of the native wheel/trackpad scrolling. Needed because browsers
 * don't pan overflow containers on mouse drag, and the scrollbar is hidden.
 *
 * Behaviour:
 *  - Left-button drag past a small threshold pans the strip 1:1 with the cursor.
 *  - Touch is left to the browser (native swipe already works).
 *  - While dragging, descendants get `pointer-events: none` so hover-opened
 *    dropdowns don't flash, and the click that ends a drag is swallowed so a
 *    menu doesn't open on release.
 *  - `scroll-behavior` is forced to `auto` mid-drag so a `scroll-smooth` class
 *    doesn't fight the 1:1 panning; it's restored when the drag ends.
 */
export function DragScrollNav({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement | null>(null)
  const drag = useRef({ active: false, moved: false, startX: 0, startScroll: 0, pointerId: -1 })
  const [dragging, setDragging] = useState(false)

  function onPointerDown(e: RPointerEvent<HTMLElement>) {
    if (e.pointerType === 'touch' || e.button !== 0) return // native swipe; left button only
    const el = ref.current
    if (!el) return
    drag.current = { active: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft, pointerId: e.pointerId }
  }

  function onPointerMove(e: RPointerEvent<HTMLElement>) {
    const el = ref.current
    const d = drag.current
    if (!el || !d.active) return
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dx) > 5) {
      d.moved = true
      el.style.scrollBehavior = 'auto'
      try { el.setPointerCapture(d.pointerId) } catch { /* older browsers */ }
      setDragging(true)
    }
    if (d.moved) {
      el.scrollLeft = d.startScroll - dx
      e.preventDefault()
    }
  }

  function endDrag() {
    const el = ref.current
    if (el && drag.current.moved) el.style.scrollBehavior = ''
    if (drag.current.moved) setDragging(false)
    drag.current.active = false
    // `moved` stays true until onClickCapture consumes the trailing click.
  }

  function onClickCapture(e: RMouseEvent<HTMLElement>) {
    if (drag.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      drag.current.moved = false
    }
  }

  return (
    <nav
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      className={`${className} ${dragging ? 'cursor-grabbing [&_*]:pointer-events-none' : 'cursor-grab'}`}
    >
      {children}
    </nav>
  )
}
