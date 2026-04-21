'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'

interface DivisionMultiSelectProps {
  value: string[]
  onChange: (slugs: string[]) => void
  className?: string
}

export function DivisionMultiSelect({ value, onChange, className }: DivisionMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const { data: divisions = [] } = useDivisions()

  function toggle(slug: string) {
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug])
  }

  const label =
    value.length === 0
      ? 'All Divisions'
      : `${value.length} division${value.length > 1 ? 's' : ''}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 w-[200px] text-[11px] justify-between font-normal', className)}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 ml-1 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start">
        <div className="max-h-48 overflow-y-auto">
          {divisions.map((div) => (
            <button
              key={div.slug}
              onClick={() => toggle(div.slug)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent rounded text-left"
            >
              <Check
                className={cn('h-3 w-3 shrink-0', value.includes(div.slug) ? 'opacity-100' : 'opacity-0')}
              />
              {div.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
