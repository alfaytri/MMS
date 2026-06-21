'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface Props {
  id:           string
  label:        string
  icon?:        ReactNode
  defaultOpen?: boolean
  children:     ReactNode
}

// Sections always start collapsed when a chat is opened — the parent uses
// `key={activeConversationId}` on the accordion container to force a fresh
// mount on every chat switch. No cross-chat persistence (was previously
// localStorage-backed, but that worked against the "every expandable starts
// collapsed" behaviour the user wants).
export function SectionAccordion({ id: _id, label, icon, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  function toggle() {
    setOpen((o) => !o)
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
