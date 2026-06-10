'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface Props {
  id:           string
  label:        string
  icon?:        ReactNode
  defaultOpen?: boolean
  children:     ReactNode
}

const STORAGE_KEY = 'cc-v2-section-open'

function readMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}
function writeMap(map: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

export function SectionAccordion({ id, label, icon, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    const map = readMap()
    if (Object.prototype.hasOwnProperty.call(map, id)) setOpen(map[id])
  }, [id])

  function toggle() {
    const next = !open
    setOpen(next)
    const map = readMap()
    map[id] = next
    writeMap(map)
  }

  return (
    <div className="border-b border-border">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 hover:bg-muted transition-colors"
      >
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        {icon}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 text-left">{label}</span>
      </button>
      {open && (
        <div className="border-t border-border">
          {children}
        </div>
      )}
    </div>
  )
}
