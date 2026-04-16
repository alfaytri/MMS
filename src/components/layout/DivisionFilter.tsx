'use client'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'

interface DivisionFilterProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function DivisionFilter({ selected, onSelect }: DivisionFilterProps) {
  const { data: divisions, isLoading } = useDivisions()

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {divisions?.map((division) => (
        <Badge
          key={division.id}
          variant={selected === division.id ? 'default' : 'outline'}
          className={cn(
            'cursor-pointer select-none transition-colors',
            selected === division.id
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'hover:bg-muted'
          )}
          onClick={() => onSelect(selected === division.id ? null : division.id)}
        >
          {division.short_name ?? division.name}
        </Badge>
      ))}
    </div>
  )
}
