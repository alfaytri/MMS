'use client'

import { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  title: string
  children: ReactNode
  editable?: boolean
  onEdit?: () => void
  error?: boolean
  errorCount?: number
  className?: string
  actions?: ReactNode
}

export function SectionCard({
  title,
  children,
  editable,
  onEdit,
  error,
  errorCount,
  className,
  actions,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 sm:p-6',
        error && 'border-red-300 border-l-4 border-l-red-500',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {error && errorCount && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {errorCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {editable && onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

interface FieldDisplayProps {
  label: string
  value: ReactNode
  className?: string
}

export function FieldDisplay({ label, value, className }: FieldDisplayProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  )
}

interface InfoRowProps {
  items: { icon: ReactNode; text: string }[]
}

export function InfoRow({ items }: InfoRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {item.icon}
          {item.text}
        </span>
      ))}
    </div>
  )
}
