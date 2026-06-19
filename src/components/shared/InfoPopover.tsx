'use client'

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface InfoPopoverProps {
  /** Header shown at the top of the popover */
  title?: string
  /** Body content — pass JSX for rich formatting */
  children: ReactNode
  /** Tailwind width class for the popover — default w-96 */
  widthClass?: string
  /** aria-label on the trigger button */
  ariaLabel?: string
}

/**
 * Compact info icon → clickable popover with rich content.
 * Designed to sit next to a page title (use via PageHeader.titleAfter) or
 * inline next to any element that needs explanatory help.
 */
export function InfoPopover({
  title,
  children,
  widthClass = 'w-96',
  ariaLabel = 'More information',
}: InfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={ariaLabel}
      >
        <Info className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent className={`${widthClass} p-0 text-sm`} align="start">
        {title && (
          <div className="border-b px-4 py-2.5">
            <h4 className="text-sm font-semibold">{title}</h4>
          </div>
        )}
        <div className="px-4 py-3 max-h-[70vh] overflow-y-auto space-y-3 leading-relaxed">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )
}
